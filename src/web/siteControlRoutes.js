import { rateLimit } from 'express-rate-limit';
import { AutoModerationActionType, AutoModerationRuleEventType, AutoModerationRuleTriggerType, ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { isBotOwner } from '../config/bot.js';
import { db } from '../utils/database.js';
import { cadWebsiteOrigin, issueCadTicket } from '../services/cad/websiteLogin.js';
import { Mutex } from '../utils/mutex.js';
import { getSecurityConfig, getSecurityLog, protectionTypes, setProtection } from '../services/security/securityConfigService.js';
import {
    auditSiteAction, checkedText, ControlError, discordId, isPrimaryOwner, maintenancePages,
    publicSiteControl, readSiteControl, siteAccess, updateSiteControl,
} from '../services/siteControlService.js';
import { getProfile, saveProfile, personalCommunity, publicCommunity, publishPreset, saveReview, removeCommunityItem } from '../services/siteCommunityService.js';

const automodName = 'Aether • Mention protection';
const textChannels = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
const response = (res, data) => res.json(data);
const limit = (windowMs, max) => rateLimit({
    windowMs, limit: max, keyGenerator: req => req.siteUserId,
    standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Please wait before trying again.' },
});

function guildFor(client, id) {
    if (!discordId.test(id)) throw new ControlError(400, 'Invalid server ID.');
    const guild = client.guilds.cache.get(id);
    if (!guild?.available) throw new ControlError(404, 'Aether cannot access this server.');
    return guild;
}

async function manager(guild, id) {
    const member = await guild.members.fetch({ user: id, force: true }).catch(() => null);
    if (!member?.permissions.has(P.ManageGuild)) throw new ControlError(403, 'Manage Server permission is required.');
    return member;
}

function channelAllowed(channel, actor, bot, permissions) {
    return textChannels.has(channel?.type) && channel.permissionsFor(actor)?.has(permissions) && channel.permissionsFor(bot)?.has(permissions);
}

async function inviteChannels(guild, id) {
    const actor = await manager(guild, id);
    const bot = await guild.members.fetchMe({ force: true });
    const channels = await guild.channels.fetch();
    return [...channels.values()].filter(channel => channelAllowed(channel, actor, bot, [P.ViewChannel, P.CreateInstantInvite]));
}

async function auditGuild(guild, actor, operation, target, execute) {
    if (!db.isAvailable()) throw new ControlError(503, 'Persistent audit storage is unavailable.');
    const key = `site:guild:${guild.id}:audit`;
    return Mutex.runExclusive(key, async () => {
        const history = await db.get(key) || [];
        const entry = { actor, operation, target, at: new Date().toISOString(), outcome: 'attempted' };
        const entries = [entry, ...history].slice(0, 100);
        await db.set(key, entries);
        db.flush();
        try {
            const result = await execute();
            entry.outcome = 'applied';
            return result;
        } catch (error) {
            entry.outcome = 'failed';
            throw error;
        } finally {
            await db.set(key, entries);
            db.flush();
        }
    });
}

async function mentionRule(guild, clientId) {
    const rules = await guild.autoModerationRules.fetch();
    return rules.find(rule => rule.name === automodName && rule.creatorId === clientId && rule.triggerType === AutoModerationRuleTriggerType.MentionSpam);
}

export function mountSiteControlRoutes(router, client) {
    const readLimit = limit(60_000, 36);
    const writeLimit = limit(60_000, 10);
    const sensitiveLimit = limit(60_000, 3);
    router.get('/site/probe', readLimit, (req, res) => response(res, { verified: true }));
    router.post('/site/cad-login', writeLimit, (req, res) => {
        if (!cadWebsiteOrigin() || !client.isReady()) throw new ControlError(503, 'CAD login is unavailable.');
        const username = checkedText(req.siteBody.username, 80);
        const ticket = issueCadTicket(req.siteBody.state, { id: req.siteUserId, username, avatar: null }, [...client.guilds.cache.keys()]);
        if (!ticket) throw new ControlError(409, 'CAD sign-in expired. Start again from CAD.');
        return response(res, { ticket });
    });
    router.get('/site/access', readLimit, async (req, res) => response(res, { access: await siteAccess(req.siteUserId), primaryOwner: isPrimaryOwner(req.siteUserId) }));
    router.get('/site/profile', readLimit, async (req, res) => response(res, await getProfile(req.siteUserId)));
    router.patch('/site/profile', writeLimit, async (req, res) => response(res, await saveProfile(req.siteUserId, req.siteBody)));
    router.get('/site/community', readLimit, async (req, res) => response(res, await personalCommunity(req.siteUserId)));
    router.post('/site/community', writeLimit, async (req, res) => {
        if (req.siteBody.action === 'review') return response(res, await saveReview(req.siteUserId, req.siteBody));
        if (req.siteBody.action === 'remove') return response(res, await removeCommunityItem(req.siteUserId, req.siteBody));
        throw new ControlError(400, 'Choose a supported community action.');
    });
    router.get('/site/team', readLimit, async (req, res) => {
        if (!await siteAccess(req.siteUserId)) throw new ControlError(403, 'Aether staff access is required.');
        const state = await readSiteControl();
        return response(res, {
            ...publicSiteControl(state),
            activity: state.audit.slice(0, 30).map(({ action, at }) => ({ action, at })),
        });
    });
    router.use('/owner', (req, res, next) => {
        if (!isBotOwner(req.siteUserId)) throw new ControlError(403, 'Bot owner access is required.');
        next();
    });
    router.use('/owner/site', (req, res, next) => {
        if (!isPrimaryOwner(req.siteUserId)) throw new ControlError(403, 'Primary owner access is required.');
        next();
    });
    router.get('/owner/site', readLimit, async (req, res) => {
        const state = await readSiteControl();
        return response(res, {
            ...state, pages: maintenancePages,
            devlogs: state.devlogs.map(({ id, title }) => ({ id, title })),
            incidents: state.incidents.map(({ updates, ...incident }) => incident),
        });
    });
    router.post('/owner/site', writeLimit, async (req, res) => {
        if (req.siteBody.action === 'staff') {
            const { userId } = req.siteBody;
            if (typeof userId !== 'string' || !discordId.test(userId)) throw new ControlError(400, 'Enter a valid Discord user ID.');
            const person = await client.users.fetch(userId, { force: true }).catch(() => null);
            if (!person || person.bot) throw new ControlError(400, 'Enter the Discord ID of an existing user account.');
        }
        await updateSiteControl(req.siteUserId, req.siteBody);
        return response(res, { ok: true });
    });
    router.get('/owner/guilds', readLimit, (req, res) => {
        if (!client.isReady()) throw new ControlError(503, 'Discord connectivity is unavailable.');
        const guilds = [...client.guilds.cache.values()].map(({ id, name, memberCount, available }) => ({ id, name, memberCount, available }));
        return response(res, { guilds: guilds.sort((a, b) => a.name.localeCompare(b.name)) });
    });
    router.get('/owner/guilds/:id/invite', readLimit, async (req, res) => {
        const channels = await inviteChannels(guildFor(client, req.params.id), req.siteUserId);
        return response(res, { channels: channels.map(({ id, name }) => ({ id, name })) });
    });
    router.post('/owner/guilds/:id/invite', sensitiveLimit, async (req, res) => {
        const guild = guildFor(client, req.params.id);
        const channel = (await inviteChannels(guild, req.siteUserId)).find(candidate => candidate.id === req.siteBody.channelId);
        if (!channel) throw new ControlError(403, 'You and Aether need permission to create invitations in this channel.');
        await auditSiteAction(req.siteUserId, 'invite.attempt', guild.id);
        const invite = await channel.createInvite({ maxAge: 900, maxUses: 1, unique: true, reason: `Aether owner panel • ${req.siteUserId}` });
        await auditSiteAction(req.siteUserId, 'invite.created', guild.id);
        return response(res, { url: `https://discord.gg/${invite.code}` });
    });
    router.post('/owner/guilds/:id/leave', sensitiveLimit, async (req, res) => {
        const guild = guildFor(client, req.params.id);
        if (req.siteBody.confirmation !== guild.id) throw new ControlError(400, 'Type the server ID to confirm.');
        const reason = checkedText(req.siteBody.reason, 240, 5);
        return Mutex.runExclusive(`site:leave:${guild.id}`, async () => {
            guildFor(client, guild.id);
            await auditSiteAction(req.siteUserId, 'leave.attempt', { guildId: guild.id, reason });
            await guild.leave();
            await auditSiteAction(req.siteUserId, 'leave.applied', guild.id);
            return response(res, { ok: true });
        });
    });

    router.get('/guilds/:guildId/setup', readLimit, async (req, res) => {
        const guild = req.siteGuild;
        const actor = await manager(guild, req.siteUserId);
        const bot = await guild.members.fetchMe();
        const canAutoMod = bot.permissions.has(P.ManageGuild);
        const [security, events, rule] = await Promise.all([
            getSecurityConfig(guild.id),
            getSecurityLog(guild.id),
            canAutoMod ? mentionRule(guild, client.user.id) : null,
        ]);
        const eligible = [...guild.channels.cache.values()].filter(channel => channel.type === ChannelType.GuildText && channelAllowed(channel, actor, bot, [P.ViewChannel, P.ManageChannels]));
        return response(res, {
            protections: { antiraid: security.antiraid, antinuke: security.antinuke }, events,
            channels: eligible.map(({ id, name }) => ({ id, name })),
            alertChannels: [...guild.channels.cache.values()]
                .filter(channel => textChannels.has(channel.type) && channel.permissionsFor(actor)?.has(P.ViewChannel)
                    && channel.permissionsFor(bot)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks]))
                .map(({ id, name }) => ({ id, name })),
            autoMod: { available: canAutoMod, enabled: rule?.enabled ?? false, count: rule?.triggerMetadata.mentionTotalLimit ?? 5 },
            botPermissions: { viewAuditLog: bot.permissions.has(P.ViewAuditLog), moderateMembers: bot.permissions.has(P.ModerateMembers) },
            audit: await db.get(`site:guild:${guild.id}:audit`) || [],
        });
    });

    router.post('/guilds/:guildId/share-config', writeLimit, async (req, res) => {
        const guild = req.siteGuild;
        await manager(guild, req.siteUserId);
        const config = await getSecurityConfig(guild.id);
        return response(res, await publishPreset(req.siteUserId, req.siteBody, config));
    });

    router.patch('/guilds/:guildId/setup', writeLimit, async (req, res) => {
        const guild = req.siteGuild;
        const actor = await manager(guild, req.siteUserId);
        const { system, type, enabled, threshold, alertChannelId, action } = req.siteBody;
        const isRaid = system === 'antiraid';
        const types = protectionTypes(system);
        if ((!isRaid && system !== 'antinuke') || !types.includes(type) || typeof enabled !== 'boolean'
            || !Number.isInteger(threshold) || threshold < 1 || threshold > (type === 'newAccount' ? 720 : 100)) {
            throw new ControlError(400, 'Select a valid protection and threshold.');
        }
        const bot = await guild.members.fetchMe({ force: true });
        if (enabled && !isRaid && !bot.permissions.has(P.ViewAuditLog)) throw new ControlError(409, 'Give Aether View Audit Log before enabling anti-nuke.');
        if (alertChannelId !== null) {
            const channel = typeof alertChannelId === 'string' && discordId.test(alertChannelId) ? await guild.channels.fetch(alertChannelId, { force: true }).catch(() => null) : null;
            if (!textChannels.has(channel?.type) || !channel.permissionsFor(actor)?.has(P.ViewChannel) || !channel.permissionsFor(bot)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) {
                throw new ControlError(403, 'Choose a channel you can view and Aether can send embeds to.');
            }
        }
        const actions = isRaid ? ['alert', 'timeout', 'kick', 'ban'] : ['alert', 'strip_roles', 'kick', 'ban'];
        if (action !== undefined && !actions.includes(action)) throw new ControlError(400, 'Choose a supported response.');
        const required = { timeout: P.ModerateMembers, kick: P.KickMembers, ban: P.BanMembers, strip_roles: P.ManageRoles }[action];
        if (enabled && required && !bot.permissions.has(required)) throw new ControlError(409, 'Aether lacks the Discord permission for this response.');
        const config = { enabled, alertChannelId, ...(action && { action }), [type === 'newAccount' ? 'minAgeHours' : 'threshold']: threshold };
        await auditGuild(guild, actor.id, 'protection.update', type, () => setProtection(guild.id, system, type, config));
        return response(res, { ok: true });
    });

    router.patch('/guilds/:guildId/automod', writeLimit, async (req, res) => {
        const guild = req.siteGuild;
        const actor = await manager(guild, req.siteUserId);
        const bot = await guild.members.fetchMe({ force: true });
        if (!bot.permissions.has(P.ManageGuild)) throw new ControlError(403, 'Aether needs Manage Server to configure Discord AutoMod.');
        const { enabled, count } = req.siteBody;
        if (typeof enabled !== 'boolean' || !Number.isInteger(count) || count < 1 || count > 50) throw new ControlError(400, 'Choose a mention limit from 1 to 50.');
        await auditGuild(guild, actor.id, 'automod.update', 'mention protection', async () => {
            const rule = await mentionRule(guild, client.user.id);
            if (!enabled && !rule) return;
            const options = {
                enabled, triggerMetadata: { mentionTotalLimit: count, mentionRaidProtectionEnabled: true },
                actions: [{ type: AutoModerationActionType.BlockMessage }],
                reason: `Aether dashboard • ${actor.id}`,
            };
            if (rule) await rule.edit(options);
            else await guild.autoModerationRules.create({ ...options, name: automodName, eventType: AutoModerationRuleEventType.MessageSend, triggerType: AutoModerationRuleTriggerType.MentionSpam });
        });
        return response(res, { ok: true });
    });

    router.post('/guilds/:guildId/remote', sensitiveLimit, async (req, res) => {
        const guild = req.siteGuild;
        const actor = await manager(guild, req.siteUserId);
        const { command, channelId, seconds } = req.siteBody;
        if (command !== 'slowmode' || typeof channelId !== 'string' || !discordId.test(channelId) || ![0, 5, 10, 30, 60, 300].includes(seconds)) {
            throw new ControlError(400, 'Choose a channel and an allowed slowmode duration.');
        }
        const bot = await guild.members.fetchMe({ force: true });
        const channel = await guild.channels.fetch(channelId, { force: true }).catch(() => null);
        if (channel?.type !== ChannelType.GuildText || !channelAllowed(channel, actor, bot, [P.ViewChannel, P.ManageChannels])) {
            throw new ControlError(403, 'You and Aether need Manage Channel in this text channel.');
        }
        await auditGuild(guild, actor.id, 'slowmode.set', channel.id, () => channel.setRateLimitPerUser(seconds, `Aether dashboard • ${actor.id}`));
        return response(res, { ok: true });
    });
}

export async function servePublicSiteContent(req, res) {
    res.set('Cache-Control', 'public, max-age=0, s-maxage=10, stale-if-error=60');
    try {
        return response(res, publicSiteControl(await readSiteControl()));
    } catch {
        return res.status(503).set('Cache-Control', 'no-store').json({ error: 'Site content storage is unavailable.' });
    }
}

export async function servePublicCommunity(req, res) {
    try {
        res.set('Cache-Control', 'no-store');
        return response(res, await publicCommunity(req.query.kind));
    } catch (error) {
        return res.status(error instanceof ControlError ? error.status : 503).json({ error: 'Community posts are unavailable.' });
    }
}
