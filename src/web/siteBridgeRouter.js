/**
 * Aether Website Bridge – private, signed server-to-server API.
 * Only the Vercel BFF knows AETHER_BRIDGE_SECRET. No Discord token or ER:LC key
 * is exposed to the browser. Every request is reauthorized against Discord.
 */
import express from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import { getCadState, getCadGuildAccess, getCadGuildConfig, setCadGuildConfig, isAssignableCadRole, recordCadCommand, createCadCall, updateCadCall, updateCadUnit } from '../services/cad/cadService.js';
import { searchMdt, createMdtRecord, createMdtBolo, clearMdtBolo } from '../services/cad/mdtService.js';
import { fitMapCalibration } from '../services/cad/mdtCore.js';
import { getModerationCases, logModerationAction } from '../utils/moderation.js';
import { WarningService } from '../services/moderation/warningService.js';
import { ModerationService } from '../services/moderation/moderationService.js';
import { getErlcConfig, runServerCommand } from '../services/erlc/erlcService.js';
import { getGuildTicketStats } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { ControlError } from '../services/siteControlService.js';
import { mountSiteControlRoutes } from './siteControlRoutes.js';

const snowflake = /^[0-9]{17,20}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const activeNonces = new Map();
const recache = new Map();
const RECACHE_MS = 15_000;
const erlcActionCooldowns = new Map();
const METHODS = new Set(['GET', 'POST', 'PATCH']);

const reply = (res, status, value) => res.status(status).set('Cache-Control', 'no-store').json(value);
const err = (res, status, value) => reply(res, status, { error: value });
const actor = (user, id) => ({ id, username: user?.user?.username || user?.displayName || `Officer ${id.slice(-4)}` });
function validBody(req) {
  if (req.method === 'GET') return {};
  try {
    const value = JSON.parse(req.body || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* fail */ }
  return null;
}
function verifyRequest(req) {
  const secret = process.env.AETHER_BRIDGE_SECRET || '';
  if (secret.length < 32) return null;
  const userId = req.get('x-aether-user') || '';
  const ts = req.get('x-aether-time') || '';
  const nonce = req.get('x-aether-nonce') || '';
  const signature = req.get('x-aether-signature') || '';
  if (!snowflake.test(userId) || !/^\d{13}$/.test(ts) || !/^[A-Za-z0-9_-]{20,64}$/.test(nonce) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  if (Math.abs(Date.now() - Number(ts)) > 45_000) return null;
  const rawBody = typeof req.body === 'string' ? req.body : '';
  const digest = createHash('sha256').update(rawBody).digest('hex');
  const path = req.originalUrl;
  const message = [req.method, path, userId, ts, nonce, digest].join('\n');
  const expected = createHmac('sha256', secret).update(message).digest('base64url');
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  if (activeNonces.has(nonce)) return null;
  if (activeNonces.size > 3000) {
    for (const [key, expiry] of activeNonces) if (expiry < Date.now()) activeNonces.delete(key);
    if (activeNonces.size > 3000) return null;
  }
  activeNonces.set(nonce, Date.now() + 70_000);
  return userId;
}
async function getRole(client, guildId, userId) {
  const cad = await getCadGuildAccess(client, userId, guildId);
  if (!cad) return null;
  const mod = cad.isManager || cad.member.permissions.has(PermissionFlagsBits.ModerateMembers)
    || cad.member.permissions.has(PermissionFlagsBits.ManageMessages)
    || cad.member.permissions.has(PermissionFlagsBits.KickMembers)
    || cad.member.permissions.has(PermissionFlagsBits.BanMembers);
  const caps = {
    manager: cad.isManager,
    dispatch: cad.canDispatch,
    erlc: cad.canCommand,
    moderator: mod,
    canWarn: cad.member.permissions.has(PermissionFlagsBits.ModerateMembers),
    canTimeout: cad.member.permissions.has(PermissionFlagsBits.ModerateMembers),
  };
  return { ...cad, caps, any: Object.values(caps).some(Boolean) };
}
function guildInfo(guild, caps) {
  return { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }), members: guild.memberCount, permissions: caps };
}
const permit = (access, feature) => access?.any && (feature === 'overview' ||
  (feature === 'cad' && access.caps.dispatch) || (feature === 'moderator' && access.caps.moderator) ||
  (feature === 'manager' && access.caps.manager));

export function createSiteBridgeRouter(client) {
  const router = express.Router();
  router.use(express.text({ type: 'application/json', limit: '32kb' }));
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (!METHODS.has(req.method)) return err(res, 405, 'Method not allowed');
    const userId = verifyRequest(req);
    if (!userId) return err(res, 401, 'Invalid bridge signature');
    const body = validBody(req);
    if (!body) return err(res, 400, 'Expected a JSON object');
    req.siteUserId = userId;
    req.siteBody = body;
    next();
  });
  router.get('/guilds', async (req, res) => {
    const key = req.siteUserId;
    const old = recache.get(key);
    if (old && old.expiresAt > Date.now()) return reply(res, 200, { guilds: old.guilds });
    const guilds = [];
    // Use short batches to avoid overwhelming Discord member-fetch limits.
    const all = [...client.guilds.cache.values()].slice(0, 500);
    for (let i = 0; i < all.length; i += 8) {
      const candidates = await Promise.all(all.slice(i, i + 8).map(async g => {
        const a = await getRole(client, g.id, key).catch(() => null);
        return a?.any ? guildInfo(g, a.caps) : null;
      }));
      guilds.push(...candidates.filter(Boolean));
    }
    guilds.sort((a,b) => a.name.localeCompare(b.name));
    recache.set(key, { expiresAt: Date.now() + RECACHE_MS, guilds });
    if (recache.size > 300) recache.clear();
    return reply(res, 200, { guilds });
  });
  router.use('/guilds/:guildId', async (req, res, next) => {
    const guildId = req.params.guildId;
    if (!snowflake.test(guildId)) return err(res, 400, 'Invalid guild ID');
    const access = await getRole(client, guildId, req.siteUserId).catch(() => null);
    if (!access?.any) return err(res, 403, 'You lack access to this server');
    req.siteAccess = access;
    req.siteGuild = access.guild;
    next();
  });
  mountSiteControlRoutes(router, client);
  router.get('/guilds/:guildId/overview', async (req, res) => {
    const a = req.siteAccess, guild = req.siteGuild;
    const state = a.caps.dispatch ? await getCadState(guild.id) : null;
    const summary = {
      guild: guildInfo(guild, a.caps),
      channels: guild.channels.cache.size, roles: guild.roles.cache.size, members: guild.memberCount,
      bot: { connected: client.isReady(), pingMs: Math.max(0, Math.round(client.ws.ping)) },
      cad: state ? { calls: state.calls.filter(x => x.status !== 'closed').length, units: state.units.filter(u=>u.status!=='off_duty').length, players: Date.now() - (state.playerSyncAt||0) < 90_000 ? state.players.length : null, lastSyncAt: state.playerSyncAt || null } : null,
      modules: ['Moderation', 'Tickets', 'AutoMod', 'ER:LC', 'Giveaways', 'CAD', 'Staff tools'],
    };
    return reply(res, 200, summary);
  });
  router.get('/guilds/:guildId/cad', async (req, res) => {
    if (!permit(req.siteAccess, 'cad')) return err(res, 403, 'Dispatch role required');
    const [state, mdt] = await Promise.all([getCadState(req.params.guildId), searchMdt(req.params.guildId)]);
    return reply(res, 200, {
      guild: guildInfo(req.siteGuild, req.siteAccess.caps),
      calls: state.calls.slice(-100).reverse(), units: state.units,
      players: state.serverOnline !== false && Date.now() - (state.playerSyncAt || 0) < 90_000 ? state.players : [],
      playerSyncAt: state.playerSyncAt || null, serverOnline: state.serverOnline,
      bolos: mdt.bolos, audit: state.audit.slice(-100).reverse(), calibration: mdt.calibration, mapTransform: fitMapCalibration(mdt.calibration),
    });
  });
  router.get('/guilds/:guildId/mdt', async (req, res) => {
    if (!permit(req.siteAccess, 'cad')) return err(res, 403, 'Dispatch role required');
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    return reply(res, 200, await searchMdt(req.params.guildId, q));
  });
  router.post('/guilds/:guildId/cad/calls', async (req, res) => {
    if (!permit(req.siteAccess, 'cad')) return err(res, 403, 'Dispatch role required');
    const { title, location, details, priority } = req.siteBody;
    if (typeof title !== 'string' || title.trim().length < 5 || title.length > 100 || typeof location !== 'string' || location.trim().length < 3 || location.length > 100 || typeof details !== 'string' || details.length > 800) return err(res, 400, 'Invalid call details');
    const call = await createCadCall(req.params.guildId, actor(req.siteAccess.member, req.siteUserId), {title,location,details,priority});
    return reply(res, 201, {call});
  });
  router.patch('/guilds/:guildId/cad/calls/:callId', async (req, res) => {
    if (!permit(req.siteAccess, 'cad')) return err(res, 403, 'Dispatch role required');
    if (!uuid.test(req.params.callId))return err(res,400,'Invalid call reference');
    const updates={};
    if(req.siteBody.status!==undefined){if(!['open','assigned','closed'].includes(req.siteBody.status))return err(res,400,'Invalid status');updates.status=req.siteBody.status;}
    if(req.siteBody.assignedUnitIds!==undefined){
      const ids=req.siteBody.assignedUnitIds;
      if(!Array.isArray(ids)||ids.length>8||new Set(ids).size!==ids.length||!ids.every(id=>snowflake.test(id)))return err(res,400,'Invalid unit assignment');
      const state=await getCadState(req.params.guildId);
      const available=new Set(state.units.filter(u=>u.status!=='off_duty').map(u=>u.userId));
      if(!ids.every(id=>available.has(id)))return err(res,400,'Unavailable unit');
      updates.assignedUnitIds=ids;
      if(updates.status===undefined)updates.status=ids.length?'assigned':'open';
    }
    if(!Object.keys(updates).length)return err(res,400,'No changes');
    const call=await updateCadCall(req.params.guildId,actor(req.siteAccess.member,req.siteUserId),req.params.callId,updates);
    return call ? reply(res,200,{call}) : err(res,404,'Call not found');
  });
  router.post('/guilds/:guildId/cad/units', async (req, res) => {
    if (!permit(req.siteAccess, 'cad')) return err(res,403,'Dispatch role required');
    const {callsign,status}=req.siteBody;
    if (!['available','busy','on_scene','off_duty'].includes(status) || typeof callsign!=='string' || callsign.length > 24) return err(res,400,'Invalid unit status/callsign');
    const unit=await updateCadUnit(req.params.guildId,actor(req.siteAccess.member,req.siteUserId),{callsign,status});
    return reply(res,200,{unit});
  });
  router.post('/guilds/:guildId/mdt/records', async (req, res) => {
    if (!permit(req.siteAccess,'cad'))return err(res,403,'Dispatch role required');
    const record=await createMdtRecord(req.params.guildId,actor(req.siteAccess.member,req.siteUserId),req.siteBody);
    return reply(res,201,{record});
  });
  router.post('/guilds/:guildId/mdt/bolos', async (req, res) => {
    if (!permit(req.siteAccess,'cad'))return err(res,403,'Dispatch role required');
    const bolo=await createMdtBolo(req.params.guildId,actor(req.siteAccess.member,req.siteUserId),req.siteBody);
    return reply(res,201,{bolo});
  });
  router.patch('/guilds/:guildId/mdt/bolos/:boloId/clear', async (req, res) => {
    if (!permit(req.siteAccess,'cad'))return err(res,403,'Dispatch role required');
    if (!uuid.test(req.params.boloId))return err(res,400,'Invalid BOLO reference');
    const bolo=await clearMdtBolo(req.params.guildId,actor(req.siteAccess.member,req.siteUserId),req.params.boloId);
    return bolo?reply(res,200,{bolo}):err(res,404,'BOLO not found');
  });
  router.get('/guilds/:guildId/cad/config',async(req,res)=>{
    if(!permit(req.siteAccess,'manager'))return err(res,403,'Manage Server required');
    return reply(res,200,{config:await getCadGuildConfig(req.params.guildId),
      roles:[...req.siteGuild.roles.cache.values()].filter(r=>isAssignableCadRole(req.siteGuild,r.id)).map(r=>({id:r.id,name:r.name})),
      channels:[...req.siteGuild.channels.cache.values()].filter(c=>c.isTextBased()&&!c.isThread()).map(c=>({id:c.id,name:c.name}))});
  });
  router.patch('/guilds/:guildId/cad/config',async(req,res)=>{
    if(!permit(req.siteAccess,'manager'))return err(res,403,'Manage Server required');
    const v=req.siteBody,g=req.siteGuild;
    const roles=x=>Array.isArray(x)&&x.length<=20&&new Set(x).size===x.length&&x.every(id=>snowflake.test(id)&&isAssignableCadRole(g,id));
    if(!roles(v.dispatchRoleIds)||!roles(v.commandRoleIds))return err(res,400,'Invalid roles');
    if(v.dispatchChannelId!==null&&(!snowflake.test(v.dispatchChannelId||'')||!g.channels.cache.get(v.dispatchChannelId)?.isTextBased()))return err(res,400,'Invalid channel');
    return reply(res,200,{config:await setCadGuildConfig(req.params.guildId,v)});
  });
  router.get('/guilds/:guildId/erlc/players',async(req,res)=>{
    if(!req.siteAccess.caps.erlc&&!req.siteAccess.caps.manager)return err(res,403,'ER:LC role required');
    const [state,config]=await Promise.all([getCadState(req.params.guildId),getErlcConfig(req.params.guildId)]);
    const fresh=state.serverOnline!==false&&Date.now()-(state.playerSyncAt||0)<90000;
    return reply(res,200,{configured:!!config?.serverKey,players:fresh?state.players:[],fresh,lastSyncAt:state.playerSyncAt,canModerate:req.siteAccess.caps.manager});
  });
  router.post('/guilds/:guildId/erlc/moderate',async(req,res)=>{
    if(!req.siteAccess.caps.manager||!req.siteAccess.caps.erlc)return err(res,403,'Manage Server required');
    const {action,player,reason}=req.siteBody;
    if(!['warn','kick','ban'].includes(action)||typeof player!=='string'||!/^[A-Za-z0-9_]{3,20}$/.test(player)||typeof reason!=='string'||reason.trim().length<5||reason.length>240)return err(res,400,'Invalid details');
    if(!(await getErlcConfig(req.params.guildId))?.serverKey)return err(res,503,'Run /erlc setup first');
    const state=await getCadState(req.params.guildId);
    if(state.serverOnline===false||Date.now()-(state.playerSyncAt||0)>=90000||!state.players.some(p=>String(p.player||'').split(':')[0].toLowerCase()===player.toLowerCase()))return err(res,409,'Player not in recent server snapshot');
    const key=req.params.guildId+':'+req.siteUserId;
    if((erlcActionCooldowns.get(key)||0)>Date.now())return err(res,429,'Please wait before repeating a command');
    erlcActionCooldowns.set(key,Date.now()+12000);
    if(erlcActionCooldowns.size>1000)for(const [k,v] of erlcActionCooldowns)if(v<Date.now())erlcActionCooldowns.delete(k);
    try{
      const command=action==='warn'?':pm '+player+' Staff warning: Please review the server rules.':':'+action+' '+player;
      await runServerCommand(req.params.guildId,command);
      await recordCadCommand(req.params.guildId,actor(req.siteAccess.member,req.siteUserId),command+' reason: '+reason.trim());
      return reply(res,200,{ok:true,action,player});
    }catch(e){logger.warn('[site bridge] ER:LC action blocked '+String(e?.message||e).slice(0,100));return err(res,502,'ER:LC command was not accepted');}
  });
  router.get('/guilds/:guildId/staff', async (req, res) => {
    if (!permit(req.siteAccess,'moderator'))return err(res,403,'Moderator permission required');
    const [cases, tickets] = await Promise.all([
      getModerationCases(req.params.guildId,{limit:35}),
      getGuildTicketStats(req.params.guildId).catch(()=>null),
    ]);
    return reply(res,200,{guild:guildInfo(req.siteGuild,req.siteAccess.caps),cases:cases.slice(0,35).map(c=>({caseId:c.caseId,action:c.action,target:c.target,reason:c.reason,createdAt:c.createdAt,moderatorId:c.moderatorId,targetUserId:c.targetUserId})),ticketStats:tickets,permissions:req.siteAccess.caps});
  });
  router.post('/guilds/:guildId/staff/moderate', async (req, res) => {
    const a=req.siteAccess, b=req.siteBody;
    if (!permit(a,'moderator'))return err(res,403,'Moderator permission required');
    if (!['warn','timeout'].includes(b.action) || !snowflake.test(b.targetId||'') || typeof b.reason !== 'string' || b.reason.trim().length < 5 || b.reason.length > 300)return err(res,400,'Invalid moderation action');
    if (b.targetId === req.siteUserId || b.targetId === client.user.id || b.targetId === req.siteGuild.ownerId)return err(res,403,'Cannot moderate this member');
    if (!a.caps.canWarn) return err(res,403,'Moderate Members permission required');
    const target=await req.siteGuild.members.fetch(b.targetId).catch(()=>null);
    if(!target) return err(res,404,'Target member not found');
    const reason=`Website moderation: ${b.reason.trim()}`;
    try {
      ModerationService.assertModerationHierarchy(a.member,target,b.action);
      if(b.action==='timeout'){
        const duration=Number(b.durationMinutes);
        if(![5,10,30,60,360,1440,10080].includes(duration))return err(res,400,'Choose an allowed timeout duration');
        const result=await ModerationService.timeoutUser({guild:req.siteGuild,member:target,moderator:a.member,durationMs:duration*60000,reason});
        return reply(res,200,{ok:true,caseId:result.caseId,action:b.action});
      }
      const w=await WarningService.addWarning({guildId:req.params.guildId,userId:target.id,moderatorId:req.siteUserId,reason,timestamp:Date.now()});
      const caseId=await logModerationAction({client,guild:req.siteGuild,event:{action:'User Warned',target:`${target.user.tag} (${target.id})`,executor:`${a.member.user.tag} (${a.member.id})`,reason,metadata:{userId:target.id,moderatorId:req.siteUserId,totalWarns:w.totalCount,warningId:w.id}}});
      return reply(res,200,{ok:true,caseId,action:b.action});
    }catch(error){logger.warn(`[site bridge] moderation blocked: ${String(error?.message||error).slice(0,150)}`);return err(res,403,'Moderation denied by role hierarchy or bot permissions');}
  });
  router.use((error, req, res, next) => {
    logger.warn(`[site bridge] request rejected: ${String(error.message).slice(0,200)}`);
    if (error instanceof ControlError) return err(res, error.status, error.message);
    if (error.status === 413) return err(res, 413, 'Request too large');
    return err(res,500,'Could not complete request securely');
  });
  return router;
}
