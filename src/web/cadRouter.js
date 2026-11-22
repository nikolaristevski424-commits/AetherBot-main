import express from 'express';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';
import { runServerCommand } from '../services/erlc/erlcService.js';
import {
    createCadCall,
    getCadGuildAccess,
    getCadState,
    isAssignableCadRole,
    isValidUnitStatus,
    listCadGuildAccess,
    recordCadCommand,
    setCadGuildConfig,
    updateCadCall,
    assignCadCallUnit,
    updateCadUnit,
} from '../services/cad/cadService.js';
import { syncCadGuild } from '../services/cad/cadTrackingService.js';
import { CadAuthService } from '../services/cad/cadAuthService.js';
import {
    getMdtState, searchMdt, createMdtRecord, updateMdtRecord, archiveMdtRecord,
    createMdtBolo, clearMdtBolo, setMdtCalibration, logBaseBulletin,
} from '../services/cad/mdtService.js';
import { fitMapCalibration } from '../services/cad/mdtCore.js';
import { projectDispatchActivity } from '../services/cad/dispatchCore.js';
import { getBaseStation, signalBaseStation } from '../services/cad/baseStationService.js';

const router = express.Router();
let discordClient;
const webDirectory = path.dirname(fileURLToPath(import.meta.url));
const idPattern = /^\d{17,20}$/;
const callStatuses = new Set(['open', 'assigned', 'closed']);
const auth = new CadAuthService({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CAD_DISCORD_CLIENT_SECRET,
    redirectUri: process.env.CAD_REDIRECT_URI,
    sessionSecret: process.env.CAD_SESSION_SECRET,
    secureCookies: process.env.NODE_ENV === 'production',
});
const commandRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'ER:LC command limit reached. Try again shortly.' },
});

router.use((req, res, next) => {
    res.set({
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://cdn.discordapp.com https://media.discordapp.net https://api.policeroleplay.community https://api.erlc.gg; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://discord.com",
        'Referrer-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
    });
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    next();
});

router.get('/', (req, res) => res.sendFile(path.join(webDirectory, 'cad', 'index.html')));
router.use('/assets', express.static(path.join(webDirectory, 'cad', 'assets'), { fallthrough: false, maxAge: '1h' }));
router.use('/api', express.json({ limit: '32kb', strict: true }));
router.use('/auth', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts' },
}));

router.get('/auth/config', (req, res) => res.json({ enabled: auth.configured }));

router.get('/auth/login', (req, res) => {
    if (!auth.configured) return res.status(503).redirect('/cad/?authError=not_configured');
    try {
        const login = auth.beginLogin();
        res.append('Set-Cookie', login.stateCookie);
        return res.redirect(login.url);
    } catch {
        return res.status(503).redirect('/cad/?authError=not_configured');
    }
});

router.get('/auth/callback', async (req, res) => {
    if (req.query.error) return res.redirect('/cad/?authError=denied');
    if (!auth.configured) return res.redirect('/cad/?authError=not_configured');
    try {
        const result = await auth.completeLogin(req.query.code, req.query.state, req.headers.cookie);
        res.append('Set-Cookie', [result.sessionCookie, result.clearStateCookie]);
        return res.redirect('/cad/');
    } catch (error) {
        const message = String(error?.message || '');
        const reason = /state expired|did not match/i.test(message) ? 'state'
            : /Discord rejected the CAD login/i.test(message) ? 'credentials'
            : /could not verify the CAD account/i.test(message) ? 'account'
            : 'login_failed';
        // Only fixed diagnostic categories and sanitized error text are logged.
        // OAuth codes, state values, tokens and client secrets are never logged.
        logger.warn(`[cad] OAuth callback failed (${reason}): ${message.slice(0,120)}`);
        return res.redirect(`/cad/?authError=${reason}`);
    }
});

router.use('/api', (req, res, next) => {
    const session = auth.getSession(req.headers.cookie);
    if (!session) return res.status(401).json({ error: 'Sign in with Discord to access CAD.' });
    req.cadSession = session;
    next();
});

router.use('/api', (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.get('origin');
    let allowedOrigin;
    try {
        allowedOrigin = new URL(process.env.CAD_REDIRECT_URI).origin;
    } catch {
        return res.status(403).json({ error: 'CAD request origin is not allowed.' });
    }
    if (!origin || origin !== allowedOrigin) return res.status(403).json({ error: 'CAD request origin is not allowed.' });
    next();
});

router.get('/api/session', (req, res) => res.json({ user: req.cadSession.profile }));

router.post('/api/logout', (req, res) => {
    res.append('Set-Cookie', auth.clearSession(req.headers.cookie));
    res.status(204).end();
});

router.get('/api/guilds', async (req, res) => {
    try {
        return res.json({ guilds: await listCadGuildAccess(discordClient, req.cadSession) });
    } catch {
        return res.status(503).json({ error: 'Could not load CAD servers right now.' });
    }
});

async function requireGuild(req, res, permission = 'access') {
    if (!idPattern.test(req.params.guildId)) {
        res.status(400).json({ error: 'Invalid server ID.' });
        return null;
    }
    const access = await getCadGuildAccess(discordClient, req.cadSession.profile.id, req.params.guildId);
    if (!access) {
        res.status(403).json({ error: 'You are not a member of this bot-enabled server.' });
        return null;
    }
    const permitted = permission === 'manage'
        ? access.isManager
        : permission === 'dispatch'
            ? access.canDispatch
            : permission === 'command'
                ? access.canCommand
                : access.isManager || access.canDispatch || access.canCommand;
    if (!permitted) {
        res.status(403).json({ error: 'Your Discord roles do not have access to this CAD action.' });
        return null;
    }
    return access;
}

router.get('/api/guilds/:guildId', async (req, res) => {
    const access = await requireGuild(req, res);
    if (!access) return;
    const state = await getCadState(req.params.guildId);
    const dispatchActivity = access.canDispatch ? projectDispatchActivity(state.audit) : [];
    if (!access.isManager) state.audit = [];
    const mdt = access.canDispatch ? await getMdtState(req.params.guildId) : null;
    return res.json({
        calibration: mdt?.calibration || [],
        mapTransform: mdt ? fitMapCalibration(mdt.calibration) : null,
        guild: { id: access.guild.id, name: access.guild.name, icon: access.guild.iconURL({ size: 64 }) },
        permissions: { manager: access.isManager, dispatch: access.canDispatch, commands: access.canCommand },
        config: access.isManager ? access.config : null,
        cadExperienceMode: access.config.experienceMode || 'hybrid',
        dispatchActivity,
        state,
    });
});


const mdtRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 45,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many MDT requests. Try again soon.' },
});
router.use('/api/guilds/:guildId/mdt', mdtRateLimit);

function mdtFailure(res, error) {
    const message = String(error?.message || '');
    if (/^(Record type|Record kind|Vehicle records|Invalid Roblox|Plate should|Roleplay character|BOLO type|BOLO subject|BOLO details|BOLO priority|BOLO expiry|Calibration coordinates|Provide at most|Use at least|The selected landmarks|The roleplay record limit|The active roleplay BOLO limit)/i.test(message)) {
        return res.status(400).json({ error: message.slice(0, 240) });
    }
    logger.warn(`[cad] MDT operation failed: ${message.slice(0, 150)}`);
    return res.status(500).json({ error: 'Could not save the MDT changes. Try again or ask a server manager.' });
}

router.get('/api/guilds/:guildId/mdt', async (req, res) => {
    const access = await requireGuild(req, res, 'dispatch');
    if (!access) return;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    try {
        const [mdt, cad] = await Promise.all([searchMdt(req.params.guildId, q), getCadState(req.params.guildId)]);
        const fresh = cad.playerSyncAt && Date.now() - cad.playerSyncAt <= 90_000 && cad.serverOnline !== false;
        const players = fresh ? cad.players.filter(p => !q || [p.player,p.robloxId,p.callsign,p.team,p.location].some(v => String(v || '').toLowerCase().includes(q.toLowerCase()))).slice(0, 70) : [];
        const assignedCalls = cad.calls.filter(c => c.status !== 'closed' && (c.assignedUnitIds || []).includes(req.cadSession.profile.id)).slice(-20);
        return res.json({
            ...mdt, players, assignedCalls,
            calibrationTransform: fitMapCalibration(mdt.calibration),
            permissions: { manager: access.isManager, dispatch: access.canDispatch },
            base: { voice: getBaseStation(req.params.guildId), textChannelId: access.config.dispatchChannelId || null },
            snapshotAt: fresh ? cad.playerSyncAt : null,
        });
    } catch(error) { return mdtFailure(res, error); }
});


router.post('/api/guilds/:guildId/mdt/base/bulletin', async (req, res) => {
    const access = await requireGuild(req, res, 'dispatch');
    if (!access) return;
    const raw = req.body?.message;
    if (typeof raw !== 'string' || raw.trim().length < 5 || raw.length > 280)
        return res.status(400).json({ error: 'Roleplay bulletin must be 5–280 characters.' });
    const channelId = access.config.dispatchChannelId;
    if (!channelId) return res.status(409).json({error: 'Configure /cad dispatch-channel before sending bulletins.'});
    try {
        const state = await getMdtState(req.params.guildId);
        if (state.bulletins.some(b => b.actorId === req.cadSession.profile.id && Date.now() - b.at < 15_000))
            return res.status(429).json({ error: 'Please wait 15 seconds between dispatch bulletins.' });
        const channel = await access.guild.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased?.() || !channel.send)
            return res.status(409).json({ error: 'The configured dispatch channel cannot be reached.' });
        const text = raw.trim();
        await channel.send({
            content: `📻 **BASE DISPATCH • ER:LC ROLEPLAY**\n${text}\n— ${req.cadSession.profile.username.slice(0,60)}`,
            allowedMentions: { parse: [] },
        });
        const bulletin = await logBaseBulletin(req.params.guildId, req.cadSession.profile, text, channelId);
        const voiceAlert = await signalBaseStation(req.params.guildId);
        return res.status(201).json({ bulletin, voiceAlert });
    } catch (error) {
        logger.warn(`[cad] Base Dispatch bulletin failed: ${String(error.message).slice(0,100)}`);
        return res.status(503).json({ error: 'Could not deliver the dispatch bulletin. Check channel access and retry.' });
    }
});

router.post('/api/guilds/:guildId/mdt/records', async (req, res) => {
    const access = await requireGuild(req, res, 'dispatch');
    if (!access) return;
    try {
        const record = await createMdtRecord(req.params.guildId, req.cadSession.profile, req.body || {});
        return res.status(201).json({ record });
    } catch(error) { return mdtFailure(res, error); }
});
router.patch('/api/guilds/:guildId/mdt/records/:recordId', async (req, res) => {
    const access = await requireGuild(req, res, 'dispatch');
    if (!access) return;
    try {
        const record = await updateMdtRecord(req.params.guildId, req.cadSession.profile, req.params.recordId, req.body || {});
        return record ? res.json({record}) : res.status(404).json({error: 'Record not found.'});
    } catch(error) { return mdtFailure(res, error); }
});
router.delete('/api/guilds/:guildId/mdt/records/:recordId', async (req, res) => {
    const access = await requireGuild(req, res, 'manage');
    if (!access) return;
    try {
        const record = await archiveMdtRecord(req.params.guildId, req.cadSession.profile, req.params.recordId);
        return record ? res.json({record}) : res.status(404).json({error: 'Record not found.'});
    } catch(error) { return mdtFailure(res, error); }
});
router.post('/api/guilds/:guildId/mdt/bolos', async (req, res) => {
    const access = await requireGuild(req, res, 'dispatch');
    if (!access) return;
    try {
        const bolo = await createMdtBolo(req.params.guildId, req.cadSession.profile, req.body || {});
        if (access.config.dispatchChannelId) {
            const channel = await access.guild.channels.fetch(access.config.dispatchChannelId).catch(() => null);
            if (channel?.isTextBased?.()) {
                await channel.send({
                    content: `🚨 **ROLEPLAY BOLO** (${bolo.kind}) • **${bolo.subject}**\n${bolo.details.slice(0,600)}\n${bolo.location ? 'Last seen: '+bolo.location+'\n' : ''}Ref: ${bolo.id.slice(0,8).toUpperCase()}`,
                    allowedMentions: { parse: [] },
                }).catch(() => {});
            }
        }
        await signalBaseStation(req.params.guildId);
        return res.status(201).json({ bolo });
    } catch(error) { return mdtFailure(res, error); }
});
router.patch('/api/guilds/:guildId/mdt/bolos/:boloId/clear', async (req, res) => {
    const access = await requireGuild(req, res, 'dispatch');
    if (!access) return;
    try {
        const bolo = await clearMdtBolo(req.params.guildId, req.cadSession.profile, req.params.boloId);
        return bolo ? res.json({ bolo }) : res.status(404).json({ error: 'BOLO not found or already cleared.' });
    } catch(error) { return mdtFailure(res, error); }
});
router.put('/api/guilds/:guildId/mdt/calibration', async (req, res) => {
    const access = await requireGuild(req, res, 'manage');
    if (!access) return;
    try {
        const result = await setMdtCalibration(req.params.guildId, req.cadSession.profile, req.body?.anchors);
        return res.json({ calibration: result });
    } catch(error) { return mdtFailure(res, error); }
});

router.get('/api/guilds/:guildId/roles', async (req, res) => {
    const access = await requireGuild(req, res, 'manage');
    if (!access) return;
    const roles = [...access.guild.roles.cache.values()]
        .filter((role) => role.id !== access.guild.id && !role.managed)
        .sort((left, right) => right.position - left.position)
        .map((role) => ({ id: role.id, name: role.name, color: role.hexColor }));
    return res.json({ roles });
});

router.put('/api/guilds/:guildId/settings', async (req, res) => {
    const access = await requireGuild(req, res, 'manage');
    if (!access) return;
    const { dispatchRoleIds, commandRoleIds, experienceMode } = req.body || {};
    if (experienceMode !== undefined && !['discord','web','hybrid'].includes(experienceMode)) {
        return res.status(400).json({ error: 'Choose Discord, Web or Hybrid CAD mode.' });
    }
    const roleLists = [dispatchRoleIds, commandRoleIds];
    if (roleLists.some((list) => !Array.isArray(list) || list.length > 20 || list.some((id) => typeof id !== 'string' || !idPattern.test(id) || !isAssignableCadRole(access.guild, id)))) {
        return res.status(400).json({ error: 'Choose valid roles from this Discord server.' });
    }
    try {
        const config = await setCadGuildConfig(req.params.guildId, { dispatchRoleIds, commandRoleIds, ...(experienceMode ? {experienceMode} : {}) });
        return res.json({ config });
    } catch {
        return res.status(500).json({ error: 'Could not save CAD role settings.' });
    }
});

router.post('/api/guilds/:guildId/sync-players', async (req, res) => {
    const access = await requireGuild(req, res, 'dispatch');
    if (!access) return;
    try {
        const result = await syncCadGuild(req.params.guildId, req.cadSession.profile);
        if (!result) return res.status(409).json({ error: 'Connect ER:LC with `/erlc setup` before syncing players.' });
        if (result.skipped) return res.status(202).json({ syncing: true });
        return res.json(result);
    } catch (error) {
        return res.status(502).json({ error: error.userMessage || 'ER:LC player sync failed. Check the private-server connection.' });
    }
});

router.post('/api/guilds/:guildId/calls', async (req, res) => {
    const access = await requireGuild(req, res, 'dispatch');
    if (!access) return;
    const { title, location, details = '', priority = 'normal' } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.length > 100
        || typeof location !== 'string' || !location.trim() || location.length > 100
        || typeof details !== 'string' || details.length > 1000
        || !['normal', 'urgent'].includes(priority)) {
        return res.status(400).json({ error: 'Provide a title, location, valid priority, and details under 1,000 characters.' });
    }
    try {
        return res.status(201).json({ call: await createCadCall(req.params.guildId, req.cadSession.profile, { title, location, details, priority }) });
    } catch {
        return res.status(500).json({ error: 'Could not create the CAD call.' });
    }
});

router.patch('/api/guilds/:guildId/calls/:callId', async (req, res) => {
    const access = await requireGuild(req, res, 'dispatch');
    if (!access) return;
    const { status, assignedUnitIds, addAssignedUnitId } = req.body || {};
    if (addAssignedUnitId !== undefined) {
        // Incremental assignments are serialized server-side; clients must not
        // send stale arrays that overwrite another officer's response.
        if (status !== undefined || assignedUnitIds !== undefined
            || typeof addAssignedUnitId !== 'string' || !idPattern.test(addAssignedUnitId)) {
            return res.status(400).json({ error: 'Provide only one valid officer ID to assign.' });
        }
        try {
            const result = await assignCadCallUnit(req.params.guildId, req.cadSession.profile,
                req.params.callId, addAssignedUnitId);
            if (!result) return res.status(404).json({ error: 'CAD call not found.' });
            return res.json({ call: result.call, changed: result.changed });
        } catch (error) {
            if (/already closed|on-duty CAD unit|maximum number of assigned units/.test(String(error?.message))) {
                return res.status(409).json({ error: error.message });
            }
            return res.status(500).json({ error: 'Could not assign the officer.' });
        }
    }
    if (status === undefined && assignedUnitIds === undefined) {
        return res.status(400).json({ error: 'Provide a call status or unit assignment to update.' });
    }
    if ((status !== undefined && !callStatuses.has(status))
        || (assignedUnitIds !== undefined && (!Array.isArray(assignedUnitIds) || assignedUnitIds.length > 20 || assignedUnitIds.some((id) => !idPattern.test(id))))) {
        return res.status(400).json({ error: 'Invalid call status or unit assignment.' });
    }
    let existingCall;
    if (assignedUnitIds !== undefined || status === 'assigned') {
        const state = await getCadState(req.params.guildId);
        existingCall = state.calls.find((call) => call.id === req.params.callId);
        if (!existingCall) return res.status(404).json({ error: 'CAD call not found.' });
        const unitIds = new Set(state.units.map((unit) => unit.userId));
        if (assignedUnitIds?.some((id) => !unitIds.has(id))) return res.status(400).json({ error: 'Assignments must reference CAD units.' });
    }
    const effectiveAssignments = assignedUnitIds ?? existingCall?.assignedUnitIds;
    if (status === 'assigned' && !effectiveAssignments?.length) return res.status(400).json({ error: 'Assign at least one unit before marking a call assigned.' });
    try {
        const call = await updateCadCall(req.params.guildId, req.cadSession.profile, req.params.callId, { status, assignedUnitIds });
        if (!call) return res.status(404).json({ error: 'CAD call not found.' });
        return res.json({ call });
    } catch {
        return res.status(500).json({ error: 'Could not update the CAD call.' });
    }
});

router.put('/api/guilds/:guildId/units/me', async (req, res) => {
    const access = await requireGuild(req, res, 'dispatch');
    if (!access) return;
    const { callsign, status } = req.body || {};
    if ((callsign !== undefined && (typeof callsign !== 'string' || callsign.trim().length > 24))
        || (status !== undefined && !isValidUnitStatus(status))) {
        return res.status(400).json({ error: 'Calls signs must be under 24 characters and status must be valid.' });
    }
    const updates = {};
    if (callsign !== undefined) updates.callsign = callsign;
    if (status !== undefined) updates.status = status;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Provide a callsign or unit status to update.' });
    try {
        return res.json({ unit: await updateCadUnit(req.params.guildId, req.cadSession.profile, updates) });
    } catch {
        return res.status(500).json({ error: 'Could not update unit status.' });
    }
});

router.post('/api/guilds/:guildId/commands', commandRateLimit, async (req, res) => {
    const access = await requireGuild(req, res, 'command');
    if (!access) return;
    const command = req.body?.command;
    if (typeof command !== 'string' || !command.trim() || command.length > 200 || /[\r\n\0]/.test(command)) {
        return res.status(400).json({ error: 'ER:LC commands must be a single line under 200 characters.' });
    }
    try {
        await runServerCommand(req.params.guildId, command.trim());
        await recordCadCommand(req.params.guildId, req.cadSession.profile, command.trim());
        return res.json({ sent: true });
    } catch (error) {
        return res.status(502).json({ error: error.userMessage || 'ER:LC command failed.' });
    }
});

export function createCadRouter(client) {
    discordClient = client;
    return router;
}

export default router;