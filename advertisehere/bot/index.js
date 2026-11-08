import 'dotenv/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { Client, GatewayIntentBits, PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder, REST, Routes, MessageFlags } from 'discord.js';
import { ListingStore, defaultStorePath } from './store.js';
import { CATEGORIES, isSnowflake, normalizeInvite } from './core.js';

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const web = (process.env.AD_PUBLIC_ORIGIN || 'https://advertisehere.vercel.app').replace(/\/$/, '');
const secret = process.env.AD_SHARED_SECRET;
const staff = new Set((process.env.AD_OWNER_IDS || process.env.OWNER_IDS || '').split(',').map(x=>x.trim()).filter(isSnowflake));
const port = Number(process.env.PORT || 3000);
if (!token || !isSnowflake(clientId || '')) throw new Error('Set DISCORD_TOKEN and CLIENT_ID on Wispbyte.');
if (!secret || secret.length < 32) throw new Error('Set a unique AD_SHARED_SECRET of at least 32 characters.');
const store = new ListingStore(defaultStorePath());
await store.load();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const categories = CATEGORIES.map(x=>({ name: x === 'roleplay' ? 'ER:LC / Roleplay' : x[0].toUpperCase() + x.slice(1), value: x }));
const commands = [
  new SlashCommandBuilder().setName('bump').setDescription('Move your approved server listing to the top of discovery (2-hour cooldown).').setDMPermission(false),
  new SlashCommandBuilder().setName('list-server').setDescription('Submit this Discord server to AdvertiseHERE for review.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o=>o.setName('invite').setDescription('Valid Discord invite URL').setRequired(true))
    .addStringOption(o=>o.setName('description').setDescription('Server description (20–600 characters)').setRequired(true).setMaxLength(600))
    .addStringOption(o=>o.setName('category').setDescription('Choose a category').setRequired(true).addChoices(...categories)),
  new SlashCommandBuilder().setName('listing').setDescription('View this server’s AdvertiseHERE listing and bump status.').setDMPermission(false),
  new SlashCommandBuilder().setName('top-servers').setDescription('Browse currently approved AdvertiseHERE communities.'),
  new SlashCommandBuilder().setName('ad-review').setDescription('AdvertiseHERE platform team: approve or reject a listing.')
    .addStringOption(o=>o.setName('guild_id').setDescription('Discord guild ID').setRequired(true))
    .addStringOption(o=>o.setName('decision').setDescription('Moderation decision').setRequired(true).addChoices({name:'Approve',value:'approved'},{name:'Reject',value:'rejected'})),
  new SlashCommandBuilder().setName('ad-help').setDescription('See AdvertiseHERE listing and bumping commands.'),
];

async function canManageGuild(guild, userId) {
  if (!guild || !isSnowflake(userId)) return false;
  if (guild.ownerId === userId) return true;
  try {
    const member = await guild.members.fetch({ user: userId, force: true });
    return member.permissions.has(PermissionFlagsBits.ManageGuild);
  } catch { return false; }
}
async function guildForManager(guildId, userId) {
  const guild = client.guilds.cache.get(guildId);
  return guild && await canManageGuild(guild, userId) ? guild : null;
}
async function validateGuildInvite(guildId, inviteUrl) {
  const normalized = normalizeInvite(inviteUrl);
  const code = normalized.replace('https://discord.gg/', '');
  try {
    const invite = await client.fetchInvite(code);
    if (invite.guild?.id !== guildId) throw new Error('Invite belongs to a different Discord server.');
  } catch (error) { throw new Error(error.message === 'Invite belongs to a different Discord server.' ? error.message : 'Could not verify that invite. Use a valid invite for this server.'); }
  return normalized;
}
function errorReply(error) { return typeof error?.message === 'string' ? error.message.slice(0,200) : 'Could not complete that action.'; }

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'ad-help') return interaction.reply({ content: `**AdvertiseHERE** — ${web}\n\`/list-server\` — submit a listing (Manage Server)\n\`/bump\` — refresh your approved listing every 2 hours\n\`/listing\` — see your listing\n\`/top-servers\` — discover communities`, flags: MessageFlags.Ephemeral });
    if (interaction.commandName === 'top-servers') {
      const top = store.list().slice(0,10);
      return interaction.reply({ content: top.length ? top.map((l,i)=>`${i+1}. **${l.title}** — ${l.invite}`).join('\n') : `No approved listings yet. Visit ${web} to get started.`, flags: MessageFlags.Ephemeral });
    }
    if (interaction.commandName === 'ad-review') {
      if (!staff.has(interaction.user.id)) return interaction.reply({ content: 'Platform staff only.', flags: MessageFlags.Ephemeral });
      const guildId = interaction.options.getString('guild_id',true), decision=interaction.options.getString('decision',true);
      if (!isSnowflake(guildId)) return interaction.reply({content:'Invalid guild ID.',flags:MessageFlags.Ephemeral});
      const listing = await store.moderate(guildId, decision, interaction.user.id);
      return interaction.reply({ content: `${listing.title} is now **${decision}**.`, flags: MessageFlags.Ephemeral });
    }
    if (!interaction.inGuild() || !interaction.guildId) return interaction.reply({ content:'Run this command in your Discord server.', flags:MessageFlags.Ephemeral });
    if (interaction.commandName === 'listing') {
      const l = store.get(interaction.guildId);
      return interaction.reply({ content: l ? `**${l.title}** — ${l.status}\nBumps: ${l.bumpCount}\n${web}/browse/` : 'No listing yet. A server manager can use `/list-server`.', flags: MessageFlags.Ephemeral });
    }
    if (interaction.commandName === 'list-server') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({content:'Manage Server permission required.',flags:MessageFlags.Ephemeral});
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const invite = await validateGuildInvite(interaction.guildId, interaction.options.getString('invite',true));
      const listing = await store.upsert({ guildId: interaction.guildId, title: interaction.guild.name, description: interaction.options.getString('description',true), category: interaction.options.getString('category',true), invite }, interaction.user.id, interaction.guild);
      return interaction.editReply(`**${listing.title}** submitted for review. Once approved, members can use \`/bump\` to move it up the directory.`);
    }
    if (interaction.commandName === 'bump') {
      await interaction.deferReply();
      const result = await store.bump(interaction.guildId);
      if (!result.ok) return interaction.editReply(result.availableAt ? `${result.error} Next bump: <t:${Math.ceil(result.availableAt/1000)}:R>` : result.error);
      return interaction.editReply({ embeds:[new EmbedBuilder().setColor(0xd20d12).setTitle('Listing bumped!').setDescription(`**${result.listing.title}** is now refreshed on the [AdvertiseHERE directory](${web}/browse/).\nBumps: **${result.listing.bumpCount}**`).setFooter({text:'One bump per server every 2 hours.'})] });
    }
  } catch (error) {
    console.error('[AdvertiseHERE] command error:', error.message);
    if (interaction.deferred || interaction.replied) await interaction.editReply(errorReply(error)).catch(()=>{});
    else await interaction.reply({content:errorReply(error),flags:MessageFlags.Ephemeral}).catch(()=>{});
  }
});

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(rateLimit({windowMs:60_000,limit:180,standardHeaders:'draft-8',legacyHeaders:false}));
app.use(express.json({limit:'16kb',strict:true,verify:(req,res,buf)=>{req.rawBody=buf.toString('utf8');}}));
const seen = new Map();
app.get('/health', (req,res)=>res.json({ ready: client.isReady(), service:'AdvertiseHERE bot' }));
app.use('/internal', (req,res,next)=>{
  if (!['GET','POST'].includes(req.method)) return res.sendStatus(405);
  const stamp = req.get('X-AH-Timestamp'),nonce=req.get('X-AH-Nonce'),signed=req.get('X-AH-Signature');
  if (!/^\d{13}$/.test(stamp||'') || Math.abs(Date.now()-Number(stamp))>60_000 || !/^[a-f0-9]{32}$/.test(nonce||'') || !/^[a-f0-9]{64}$/.test(signed||'')) return res.sendStatus(401);
  const payload = [stamp,nonce,req.method,req.path.startsWith('/') ? `/internal${req.path}` : `/internal/${req.path}`,req.rawBody||''].join('\n');
  const expected = createHmac('sha256',secret).update(payload).digest();
  const supplied = Buffer.from(signed,'hex');
  if (supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) return res.sendStatus(401);
  for (const [n,exp] of seen) { if (exp<Date.now()) seen.delete(n); }
  if (seen.has(nonce)) return res.sendStatus(409);
  seen.set(nonce,Date.now()+60_000);
  next();
});
app.get('/internal/health', (req,res)=>res.json({ready:client.isReady(),...store.stats()}));
app.get('/internal/listings', (req,res)=>res.json({configured:true,listings:store.list(),stats:store.stats()}));
app.get('/internal/my-guilds/:actorId', async (req,res)=>{
  if (!isSnowflake(req.params.actorId)) return res.status(400).json({error:'Invalid account'});
  const guilds=[];
  for(const g of client.guilds.cache.values()) {
    if(await canManageGuild(g,req.params.actorId)) {
      const record=store.get(g.id);
      guilds.push({id:g.id,name:g.name,memberCount:g.memberCount,listing:record});
    }
  }
  return res.json({guilds});
});
app.post('/internal/listings', async (req,res)=>{
  const {actorId,guildId}=req.body||{};
  if(!isSnowflake(actorId)||!isSnowflake(guildId)) return res.status(400).json({error:'Invalid Discord account or server ID'});
  const guild=await guildForManager(guildId,actorId);
  if(!guild) return res.status(403).json({error:'You need Manage Server permission and this bot in the server.'});
  try{
    const invite=await validateGuildInvite(guildId,req.body.invite);
    const l=await store.upsert({...req.body,invite},actorId,guild);
    return res.status(201).json({listing:l,message:'Listing submitted for moderator review.'});
  }catch(e){return res.status(400).json({error:errorReply(e)});}
});
app.post('/internal/bump', async(req,res)=>{
  const {actorId,guildId}=req.body||{};
  if(!isSnowflake(actorId)||!isSnowflake(guildId))return res.status(400).json({error:'Invalid request'});
  if(!await guildForManager(guildId,actorId))return res.status(403).json({error:'Manage Server permission required to bump from the website.'});
  const result=await store.bump(guildId);
  return res.status(result.ok?200:409).json(result);
});
app.use('/internal',(req,res)=>res.sendStatus(404));
app.use((error,req,res,next)=>{console.error('[AdvertiseHERE] HTTP error',error.message);return res.status(400).json({error:'Invalid API request'});});
const server=app.listen(port,process.env.WEB_HOST||'0.0.0.0',()=>console.log(`[AdvertiseHERE] API on port ${port}`));
await client.login(token);
console.log(`[AdvertiseHERE] Logged in as ${client.user.tag}`);
const commandPayload=commands.map(x=>x.toJSON());
if(process.env.AD_REGISTER_COMMANDS !== 'false'){
  const rest=new REST({version:'10'}).setToken(token);
  await rest.put(Routes.applicationCommands(clientId),{body:commandPayload});
  console.log(`[AdvertiseHERE] Registered ${commandPayload.length} commands`);
}
async function stop(){server.close();await client.destroy();process.exit(0);}
process.on('SIGTERM',stop);
process.on('SIGINT',stop);
