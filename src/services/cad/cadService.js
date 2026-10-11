import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import { deleteFromDb, getFromDb, setInDb } from '../../utils/database.js';

const STATE_LIMIT = 500;
const AUDIT_LIMIT = 1000;
const PLAYER_EVENT_LIMIT = 1000;
const JOIN_LOG_KEY_LIMIT = 5000;
const TRACKING_CONTINUITY_MS = 90 * 1000;
const UNIT_STATUSES = new Set(['available', 'busy', 'on_scene', 'off_duty']);
const writeQueues = new Map();

const stateKey = (guildId) => `guild:${guildId}:cad:state`;
const configKey = (guildId) => `guild:${guildId}:cad:config`;

function getPlayerId(player) {
    if (player?.robloxId) return String(player.robloxId);
    const name = String(player?.player || '');
    const separator = name.lastIndexOf(':');
    return separator >= 0 ? name.slice(separator + 1) : name;
}

export function getCadGuildConfig(guildId) {
    return getFromDb(configKey(guildId), { dispatchRoleIds: [], commandRoleIds: [] });
}

export async function setCadGuildConfig(guildId, updates) {
    const current = await getCadGuildConfig(guildId);
    const config = {
        dispatchRoleIds: updates.dispatchRoleIds ?? current.dispatchRoleIds ?? [],
        commandRoleIds: updates.commandRoleIds ?? current.commandRoleIds ?? [],
    };
    if (!await setInDb(configKey(guildId), config)) throw new Error('Could not save CAD settings.');
    return config;
}

function normalizeState(value) {
    return {
        calls: Array.isArray(value?.calls) ? value.calls : [],
        units: Array.isArray(value?.units) ? value.units : [],
        players: Array.isArray(value?.players) ? value.players : [],
        staff: Array.isArray(value?.staff) ? value.staff : [],
        playerEvents: Array.isArray(value?.playerEvents) ? value.playerEvents : [],
        joinLogKeys: Array.isArray(value?.joinLogKeys) ? value.joinLogKeys : [],
        playerSyncAt: Number.isFinite(value?.playerSyncAt) ? value.playerSyncAt : null,
        serverOnline: typeof value?.serverOnline === 'boolean' ? value.serverOnline : null,
        audit: Array.isArray(value?.audit) ? value.audit : [],
    };
}

export async function getCadState(guildId) {
    return normalizeState(await getFromDb(stateKey(guildId), null));
}

async function mutateState(guildId, mutate) {
    const previous = writeQueues.get(guildId) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    writeQueues.set(guildId, current);
    await previous;
    try {
        const state = await getCadState(guildId);
        const result = await mutate(state);
        state.calls = state.calls.slice(-STATE_LIMIT);
        state.audit = state.audit.slice(-AUDIT_LIMIT);
        if (!await setInDb(stateKey(guildId), state)) throw new Error('Could not save CAD data.');
        return result;
    } finally {
        release();
        if (writeQueues.get(guildId) === current) writeQueues.delete(guildId);
    }
}

function addAudit(state, actor, action, details = {}) {
    state.audit.push({ id: randomUUID(), actorId: actor.id, actorName: actor.username, action, details, at: Date.now() });
}

export function isValidUnitStatus(status) {
    return UNIT_STATUSES.has(status);
}

export function isAssignableCadRole(guild, roleId) {
    const role = guild.roles.cache.get(roleId);
    return Boolean(role && role.id !== guild.id && !role.managed);
}

export async function createCadCall(guildId, actor, input) {
    return mutateState(guildId, (state) => {
        const call = {
            id: randomUUID(),
            title: input.title.trim(),
            location: input.location.trim(),
            details: input.details?.trim() || '',
            priority: input.priority === 'urgent' ? 'urgent' : 'normal',
            status: 'open',
            createdBy: actor.id,
            createdByName: actor.username,
            assignedUnitIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        state.calls.push(call);
        addAudit(state, actor, 'call.created', { callId: call.id, title: call.title });
        return call;
    });
}

export async function updateCadCall(guildId, actor, callId, updates) {
    return mutateState(guildId, (state) => {
        const call = state.calls.find((entry) => entry.id === callId);
        if (!call) return null;
        if (updates.assignedUnitIds) call.assignedUnitIds = updates.assignedUnitIds;
        if (updates.status) {
            call.status = updates.status;
            if (call.status === 'closed') call.closedAt = Date.now();
            else delete call.closedAt;
        }
        call.updatedAt = Date.now();
        addAudit(state, actor, 'call.updated', { callId, status: call.status, assignedUnitIds: call.assignedUnitIds });
        return call;
    });
}

export async function updateCadUnit(guildId, actor, input) {
    return mutateState(guildId, (state) => {
        let unit = state.units.find((entry) => entry.userId === actor.id);
        if (!unit) {
            unit = { userId: actor.id };
            state.units.push(unit);
        }
        unit.username = actor.username;
        if (input.callsign !== undefined) unit.callsign = input.callsign.trim().slice(0, 24);
        if (input.status !== undefined) unit.status = input.status;
        unit.updatedAt = Date.now();
        addAudit(state, actor, 'unit.updated', { callsign: unit.callsign, status: unit.status });
        return unit;
    });
}

export async function saveCadPlayers(guildId, actor, players, { staff = [], joinLogs = [], serverOnline = true } = {}) {
    return mutateState(guildId, (state) => {
        const syncedAt = Date.now();
        const previousSyncAt = state.playerSyncAt;
        const hasContinuousHistory = previousSyncAt && syncedAt - previousSyncAt <= TRACKING_CONTINUITY_MS;
        const previousPlayers = new Map(state.players.map((player) => [getPlayerId(player), player]));
        const newPlayerIds = new Set(players.map(getPlayerId));
        const knownJoinLogKeys = new Set(state.joinLogKeys);
        const recentLogJoins = new Set();
        const recentLogLeaves = new Set();
        const addedEvents = [];

        const normalizedLogs = joinLogs
            .filter((entry) => typeof entry.player === 'string' && entry.player && Number.isFinite(entry.at))
            .sort((left, right) => left.at - right.at);

        const mostRecentJoinAt = new Map();
        for (const event of state.playerEvents) {
            const playerId = getPlayerId(event);
            if (event.type === 'joined') mostRecentJoinAt.set(playerId, event.at);
            if (event.type === 'left') mostRecentJoinAt.delete(playerId);
        }

        for (const log of normalizedLogs) {
            const playerId = getPlayerId(log);
            const type = log.joined ? 'joined' : 'left';
            const eventKey = `${playerId}:${type}:${log.at}`;
            const inRecentWindow = hasContinuousHistory && log.at >= previousSyncAt - 30_000 && log.at <= syncedAt + 30_000;
            if (inRecentWindow) (log.joined ? recentLogJoins : recentLogLeaves).add(playerId);
            if (knownJoinLogKeys.has(eventKey)) continue;

            const previous = previousPlayers.get(playerId);
            const joinedAt = mostRecentJoinAt.get(playerId) || previous?.firstSeenAt || log.at;
            const event = {
                id: randomUUID(),
                eventKey,
                type,
                player: log.player,
                robloxId: log.robloxId || null,
                at: log.at,
                team: log.team || previous?.team || null,
                source: 'erlc',
                ...(type === 'left' ? { durationMs: Math.max(0, log.at - joinedAt) } : {}),
            };
            state.playerEvents.push(event);
            addedEvents.push(event);
            knownJoinLogKeys.add(eventKey);
            state.joinLogKeys.push(eventKey);
            if (type === 'joined') mostRecentJoinAt.set(playerId, log.at);
            else mostRecentJoinAt.delete(playerId);
        }

        if (hasContinuousHistory) {
            for (const player of players) {
                const playerId = getPlayerId(player);
                if (previousPlayers.has(playerId) || recentLogJoins.has(playerId)) continue;
                const event = {
                    id: randomUUID(),
                    type: 'joined',
                    player: player.player,
                    robloxId: player.robloxId || null,
                    team: player.team || null,
                    at: syncedAt,
                    source: 'snapshot',
                };
                state.playerEvents.push(event);
                addedEvents.push(event);
            }
            for (const [playerId, player] of previousPlayers) {
                if (newPlayerIds.has(playerId) || recentLogLeaves.has(playerId)) continue;
                const event = {
                    id: randomUUID(),
                    type: 'left',
                    player: player.player,
                    robloxId: player.robloxId || null,
                    team: player.team || null,
                    at: syncedAt,
                    durationMs: Math.max(0, syncedAt - (player.firstSeenAt || syncedAt)),
                    source: 'snapshot',
                };
                state.playerEvents.push(event);
                addedEvents.push(event);
            }
        }

        const recentJoinAt = new Map();
        for (const event of [...state.playerEvents].reverse()) {
            if (event.type === 'joined' && !recentJoinAt.has(getPlayerId(event))) {
                recentJoinAt.set(getPlayerId(event), event.at);
            }
        }
        state.players = players.map((player) => {
            const playerId = getPlayerId(player);
            const previous = previousPlayers.get(playerId);
            const firstSeenAt = hasContinuousHistory && previous && !recentLogJoins.has(playerId)
                ? previous.firstSeenAt || syncedAt
                : recentJoinAt.get(playerId) || syncedAt;
            return { ...player, firstSeenAt, lastSeenAt: syncedAt };
        });
        state.staff = staff;
        state.playerEvents = state.playerEvents.slice(-PLAYER_EVENT_LIMIT);
        state.joinLogKeys = state.joinLogKeys.slice(-JOIN_LOG_KEY_LIMIT);
        state.playerSyncAt = syncedAt;
        state.serverOnline = serverOnline;

        if (actor) addAudit(state, actor, 'erlc.players_synced', { count: players.length, events: addedEvents.length });
        return { players: state.players, staff: state.staff, events: addedEvents, count: players.length, syncedAt, serverOnline };
    });
}

export async function recordCadCommand(guildId, actor, command) {
    return mutateState(guildId, (state) => {
        addAudit(state, actor, 'erlc.command', { command: command.slice(0, 200) });
        return true;
    });
}

export async function getCadGuildAccess(client, userId, guildId) {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return null;

    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) return null;

    const config = await getCadGuildConfig(guildId);
    const isManager = member.id === guild.ownerId || member.permissions.has(PermissionFlagsBits.ManageGuild);
    const hasRole = (roleIds = []) => roleIds.some((roleId) => member.roles.cache.has(roleId));
    return {
        guild,
        member,
        config,
        isManager,
        canDispatch: isManager || hasRole(config.dispatchRoleIds),
        canCommand: isManager || hasRole(config.commandRoleIds),
    };
}

export async function listCadGuildAccess(client, session) {
    const eligibleIds = new Set(session.guildIds);
    const guilds = [...client.guilds.cache.values()].filter((guild) => eligibleIds.has(guild.id));
    const results = await Promise.all(guilds.map(async (guild) => {
        const access = await getCadGuildAccess(client, session.profile.id, guild.id);
        if (!access || (!access.isManager && !access.canDispatch && !access.canCommand)) return null;
        return {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ size: 64 }),
            permissions: {
                manager: access.isManager,
                dispatch: access.canDispatch,
                commands: access.canCommand,
            },
        };
    }));
    return results.filter(Boolean).sort((left, right) => left.name.localeCompare(right.name));
}

export async function clearCadGuildData(guildId) {
    await Promise.all([deleteFromDb(stateKey(guildId)), deleteFromDb(configKey(guildId))]);
}