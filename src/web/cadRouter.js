import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';
import { getServerStatus, runServerCommand } from '../services/erlc/erlcService.js';
import {
    createCadCall,
    getCadGuildAccess,
    getCadState,
    isValidUnitStatus,
    listCadGuildAccess,
    recordCadCommand,
    saveCadPlayers,
    setCadGuildConfig,
    updateCadCall,
    updateCadUnit,
} from '../services/cad/cadService.js';
import { CadAuthService } from '../services/cad/cadAuthService.js';

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

router.use((req, res, next) => {
    res.set({
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://cdn.discordapp.com https://media.discordapp.net; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://discord.com",
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
    if (req.query.error || !auth.configured) return res.redirect('/cad/?authError=login_failed');
    try {
        const result = await auth.completeLogin(req.query.code, req.query.state, req.headers.cookie);
        res.append('Set-Cookie', [result.sessionCookie, result.clearStateCookie]);
        return res.redirect('/cad/');
    } catch (error) {
        logger.warn(`[cad] Discord OAuth callback rejected: ${error.message}`);
        return res.redirect('/cad/?authError=login_failed');
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
    return res.json({
        guild: { id: access.guild.id, name: access.guild.name, icon: access.guild.iconURL({ size: 64 }) },
        permissions: { manager: access.isManager, dispatch: access.canDispatch, commands: access.canCommand },
        config: access.isManager ? access.config : null,
        state,
    });
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
    const { dispatchRoleIds, commandRoleIds } = req.body || {};
    const roleLists = [dispatchRoleIds, commandRoleIds];
    if (roleLists.some((list) => !Array.isArray(list) || list.length > 20 || list.some((id) => typeof id !== 'string' || !idPattern.test(id) || !access.guild.roles.cache.has(id)))) {
        return res.status(400).json({ error: 'Choose valid roles from this Discord server.' });
    }
    try {
        const config = await setCadGuildConfig(req.params.guildId, { dispatchRoleIds, commandRoleIds });
        return res.json({ config });
    } catch {
        return res.status(500).json({ error: 'Could not save CAD role settings.' });
    }
});

router.post('/api/guilds/:guildId/sync-players', async (req, res) => {
    const access = await requireGuild(req, res, 'dispatch');
    if (!access) return;
    try {
        const result = await getServerStatus(req.params.guildId, ['Players', 'Staff']);
        const players = (result.Players || []).slice(0, 100).map((player) => ({
            player: String(player.Player || '').slice(0, 64),
            team: String(player.Team || '').slice(0, 48),
            callsign: String(player.Callsign || '').slice(0, 24),
            wantedStars: Number(player.WantedStars) || 0,
        }));
        const sync = await saveCadPlayers(req.params.guildId, req.cadSession.profile, players);
        return res.json({ players, ...sync });
    } catch (error) {
        return res.status(502).json({ error: error.userMessage || 'ER:LC player sync failed. Check that the private server is online.' });
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
    const { status, assignedUnitIds } = req.body || {};
    if ((status !== undefined && !callStatuses.has(status))
        || (assignedUnitIds !== undefined && (!Array.isArray(assignedUnitIds) || assignedUnitIds.length > 20 || assignedUnitIds.some((id) => !idPattern.test(id))))) {
        return res.status(400).json({ error: 'Invalid call status or unit assignment.' });
    }
    if (assignedUnitIds) {
        const state = await getCadState(req.params.guildId);
        const unitIds = new Set(state.units.map((unit) => unit.userId));
        if (assignedUnitIds.some((id) => !unitIds.has(id))) return res.status(400).json({ error: 'Assignments must reference CAD units.' });
    }
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

router.post('/api/guilds/:guildId/commands', async (req, res) => {
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