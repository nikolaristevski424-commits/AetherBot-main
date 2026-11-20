import { getErlcConfig } from '../erlc/erlcService.js';
import { erlcClient } from '../erlc/erlcClient.js';
import { saveCadPlayers } from './cadService.js';
import { logger } from '../../utils/logger.js';

const activeGuildSyncs = new Set();
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
        locationX: Number.isFinite(location.LocationX) ? location.LocationX : null,
        locationZ: Number.isFinite(location.LocationZ) ? location.LocationZ : null,
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

export async function syncCadGuild(guildId, actor = null) {
    if (activeGuildSyncs.has(guildId)) return { skipped: true };
    activeGuildSyncs.add(guildId);

    try {
        const config = await getErlcConfig(guildId);
        if (!config?.serverKey) return null;

        let response;
        let serverOnline = true;
        try {
            response = await erlcClient.getServer(config.serverKey, ['Players', 'Staff', 'JoinLogs']);
        } catch (error) {
            if (error.kind !== 'offline') throw error;
            serverOnline = false;
            response = { Players: [], Staff: {}, JoinLogs: [] };
        }

        const staff = buildStaffRoster(response.Staff);
        const staffById = new Map(staff.map((member) => [member.robloxId, member.role]));
        const players = (response.Players || []).slice(0, 250).map((player) => normalizePlayer(player, staffById));
        const joinLogs = normalizeJoinLogs(response.JoinLogs);
        return await saveCadPlayers(guildId, actor, players, { staff, joinLogs, serverOnline });
    } finally {
        activeGuildSyncs.delete(guildId);
    }
}

export async function syncAllCadGuilds(client) {
    if (fullSyncRunning) return;
    fullSyncRunning = true;
    try {
        for (const guild of client.guilds.cache.values()) {
            try {
                await syncCadGuild(guild.id);
            } catch (error) {
                logger.warn(`[cad] ER:LC tracking failed for guild ${guild.id}: ${error.kind || error.message}`);
            }
        }
    } finally {
        fullSyncRunning = false;
    }
}