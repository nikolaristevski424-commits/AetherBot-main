import { getErlcConfig } from '../erlc/erlcService.js';
import { erlcClient } from '../erlc/erlcClient.js';
import { ingestErlc911Calls, saveCadPlayers } from './cadService.js';
import { logger } from '../../utils/logger.js';

const activeGuildSyncs = new Map();
const tracking = new Map();
let fullSyncRunning = false;

function splitRobloxPlayer(value) {
    const raw = String(value || '').slice(0, 96);
    const separator = raw.lastIndexOf(':');
    if (separator < 0) return { player: raw, robloxId: null };
    return { player: raw.slice(0, separator), robloxId: raw.slice(separator + 1) || null };
}

function buildStaffRoster(staffData = {}) {
    const roleNames = { Admins: 'Admin', Mods: 'Moderator', Helpers: 'Helper' };
    const roster = [];
    for (const [apiRole, role] of Object.entries(roleNames)) {
        const members = staffData[apiRole] || {};
        for (const [robloxId, username] of Object.entries(members)) {
            roster.push({ robloxId, username: String(username).slice(0, 64), role });
        }
    }
    return roster;
}

function coordinate(value) {
    const number = typeof value === 'string' && value.trim() ? Number(value) : value;
    return Number.isFinite(number) ? number : null;
}

function normalizePlayer(entry, staffById) {
    const identity = splitRobloxPlayer(entry.Player);
    const location = entry.Location || {};
    const locationParts = [
        location.PostalCode ? `Postal ${location.PostalCode}` : null,
        location.BuildingNumber ? `${location.BuildingNumber} ${location.StreetName || ''}`.trim() : location.StreetName,
    ].filter(Boolean);
    const staffRole = identity.robloxId ? staffById.get(identity.robloxId) || null : null;
    const permission = String(entry.Permission || 'Normal').slice(0, 48);

    return {
        player: identity.player || 'Unknown player',
        robloxId: identity.robloxId,
        team: String(entry.Team || 'Unknown').slice(0, 48),
        callsign: String(entry.Callsign || '').slice(0, 24),
        permission,
        staffRole,
        isStaff: Boolean(staffRole) || /owner|administrator|moderator/i.test(permission),
        wantedStars: Number(entry.WantedStars) || 0,
        location: locationParts.join(' / ') || 'Location unavailable',
        postalCode: String(location.PostalCode || '').slice(0, 16),
        streetName: String(location.StreetName || '').slice(0, 64),
        buildingNumber: String(location.BuildingNumber || '').slice(0, 24),
        locationX: coordinate(location.LocationX),
        locationZ: coordinate(location.LocationZ),
    };
}

function normalizeJoinLogs(entries = []) {
    return entries.map((entry) => {
        const identity = splitRobloxPlayer(entry.Player);
        const timestamp = Number(entry.Timestamp);
        return {
            ...identity,
            joined: entry.Join === true,
            at: timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp,
        };
    }).filter((entry) => entry.player && Number.isFinite(entry.at) && entry.at > 0);
}


const label = {
    unconfigured: 'Connect an ER:LC private server with /erlc setup.',
    offline: 'The private server reports that it is offline.',
    auth: 'The private-server key was rejected. Run /erlc setup with the current key.',
    application_required: 'PRC requires an Aether application key on the bot host.',
    rate_limited: 'PRC rate limited updates. Aether is waiting to retry.',
    outdated_module: 'The in-game ER:LC module is outdated. Rejoin the private server.',
    network: 'The ER:LC feed could not be reached. Showing the last available snapshot.',
    invalid_snapshot: 'PRC did not return the expected player roster.',
    error: 'The ER:LC update failed. Showing the last available snapshot.',
};

export function getCadTracking(guildId) {
    const entry = tracking.get(guildId);
    if (!entry) return { status: 'waiting', message: 'Waiting for the first ER:LC snapshot.' };
    return {
        status: entry.status, message: label[entry.status] || '',
        attemptedAt: entry.attemptedAt, retryAt: entry.retryAt,
    };
}

async function updateGuild(guildId, actor) {
    const attemptedAt = Date.now();
    const interval = process.env.ERLC_APPLICATION_KEY?.trim() ? 15_000 : 25_000;
    const note = (status, wait = interval) => tracking.set(guildId, { status, attemptedAt, retryAt: Date.now() + wait });

    try {
        const config = await getErlcConfig(guildId);
        if (!config?.serverKey) {
            note('unconfigured');
            return null;
        }

        let response;
        try {
            response = await erlcClient.getServer(config.serverKey, ['Players', 'Staff', 'JoinLogs', 'EmergencyCalls']);
        } catch (error) {
            if (error.kind !== 'offline') throw error;
            const result = await saveCadPlayers(guildId, actor, [], { serverOnline: false });
            note('offline');
            return result;
        }
        if (!Array.isArray(response?.Players) && response?.CurrentPlayers !== 0) {
            throw Object.assign(new Error('Missing PRC player roster.'), { kind: 'invalid_snapshot' });
        }
        const staff = buildStaffRoster(response.Staff);
        const staffById = new Map(staff.map(member => [member.robloxId, member.role]));
        const players = (Array.isArray(response.Players) ? response.Players : [])
            .filter(player => typeof player?.Player === 'string' && player.Player.trim()).slice(0, 250)
            .map(player => normalizePlayer(player, staffById));
        const joinLogs = normalizeJoinLogs(Array.isArray(response.JoinLogs) ? response.JoinLogs : []);
        const result = await saveCadPlayers(guildId, actor, players, { staff, joinLogs });
        note('current');
        const emergencyCalls = await ingestErlc911Calls(guildId, Array.isArray(response.EmergencyCalls) ? response.EmergencyCalls : [])
            .catch(error => {
                logger.warn('[cad] ER:LC 911 import failed for guild ' + guildId + ': ' + error.name);
                return [];
            });
        return { ...result, emergencyCalls };
    } catch (error) {
        const status = Object.hasOwn(label, error.kind) ? error.kind : 'error';
        note(status, Math.max(interval, Number(error.retryAfterMs) || 0));
        logger.warn('[cad] ER:LC tracking delayed for guild ' + guildId + ': ' + status);
        return { skipped: true };
    }
}

export function syncCadGuild(guildId, actor = null) {
    if (activeGuildSyncs.has(guildId)) return activeGuildSyncs.get(guildId);
    const entry = tracking.get(guildId);
    if (entry?.retryAt > Date.now()) return Promise.resolve(entry.status === 'unconfigured' ? null : { skipped: true });
    const pending = updateGuild(guildId, actor).finally(() => activeGuildSyncs.delete(guildId));
    activeGuildSyncs.set(guildId, pending);
    return pending;
}

export async function syncAllCadGuilds(client) {
    if (fullSyncRunning) return;
    fullSyncRunning = true;
    try {
        for (const id of tracking.keys()) if (!client.guilds.cache.has(id)) tracking.delete(id);
        for (const guild of client.guilds.cache.values()) await syncCadGuild(guild.id);
    } finally {
        fullSyncRunning = false;
    }
}
