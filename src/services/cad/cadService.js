import { randomUUID } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import { deleteFromDb, getFromDb, setInDb } from '../../utils/database.js';

const STATE_LIMIT = 500;
const AUDIT_LIMIT = 1000;
const UNIT_STATUSES = new Set(['available', 'busy', 'on_scene', 'off_duty']);
const writeQueues = new Map();

const stateKey = (guildId) => `guild:${guildId}:cad:state`;
const configKey = (guildId) => `guild:${guildId}:cad:config`;

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
        playerSyncAt: Number.isFinite(value?.playerSyncAt) ? value.playerSyncAt : null,
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
        if (updates.status) call.status = updates.status;
        call.updatedAt = Date.now();
        if (call.status === 'closed') call.closedAt = Date.now();
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

export async function saveCadPlayers(guildId, actor, players) {
    return mutateState(guildId, (state) => {
        state.players = players;
        state.playerSyncAt = Date.now();
        addAudit(state, actor, 'erlc.players_synced', { count: players.length });
        return { count: players.length, syncedAt: state.playerSyncAt };
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