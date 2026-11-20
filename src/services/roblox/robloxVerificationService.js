// robloxVerificationService.js
//
// Guild-scoped Roblox account verification + group rank sync.
//
// Verification proves account ownership by having the user place a random
// generated phrase in their Roblox profile "About" description (something
// only the account owner can edit), then checking it server-side — the
// same mechanism used by most established Roblox verification bots.
//
// Group rank sync is separate and re-runnable: given a guild's configured
// group -> rank-threshold -> role mappings, it fetches the user's current
// groups/ranks from Roblox and reconciles their Discord roles to match,
// so promotions/demotions in-game can be reflected with /roblox sync
// without requiring a full re-verification.

import crypto from 'node:crypto';
import { getFromDb, setInDb, deleteFromDb } from '../../utils/database.js';
import { db } from '../../utils/database/wrapper.js';
import {
    getRobloxConfigKey,
    getRobloxPendingKey,
    getRobloxProfileKey,
    getRobloxProfilePrefix,
} from '../../utils/database/keys.js';
import {
    getRobloxUserByUsername,
    getRobloxUserById,
    getRobloxUserGroupRoles,
    RobloxApiError,
} from './robloxApi.js';
import { AetherError, ErrorTypes, wrapServiceBoundary } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

const PENDING_TTL_SECONDS = 30 * 60; // 30 minutes

const PHRASE_WORDS = [
    'acorn', 'alloy', 'antler', 'aspen', 'atoll', 'basalt', 'birchwood', 'boulder',
    'brass', 'canyon', 'cascade', 'cavern', 'cedarwood', 'chalk', 'cinderpath', 'clover',
    'copperleaf', 'coral', 'cove', 'crag', 'crescent', 'currant', 'daisyfield', 'dune',
    'eastwind', 'echo', 'ember', 'estuary', 'fable', 'fennel', 'fiddlehead', 'flint',
    'foxglove', 'gale', 'gorge', 'granite', 'gully', 'hallow', 'hearth', 'heron',
    'holler', 'hollow', 'hollyoak', 'iceberg', 'inlet', 'ivory', 'juniper', 'kestrel',
    'knoll', 'lattice', 'ledger', 'lichen', 'loam', 'lodestar', 'longmarsh', 'lookout',
    'lumen', 'marrow', 'meadowlark', 'mesa', 'millpond', 'moraine', 'moss', 'nettle',
    'northgate', 'oakmoss', 'obsidian', 'orchard', 'outcrop', 'palisade', 'pebble', 'pinebark',
    'plateau', 'quill', 'ravine', 'redwood', 'ridgeline', 'rockshelf', 'rowan', 'saltmarsh',
    'sedge', 'shale', 'slate', 'sparrowgrass', 'summit', 'switchgrass', 'tanager', 'thicket',
    'thistle', 'timberline', 'tundra', 'wetland', 'wildoak', 'willowbrook', 'windward', 'wren',
];

function randomPhrase() {
    const pool = [...PHRASE_WORDS];
    const chosen = [];
    while (chosen.length < 5) {
        chosen.push(pool.splice(crypto.randomInt(pool.length), 1)[0]);
    }
    return chosen.join(' ');
}

function userMessageForRobloxError(error) {
    if (error instanceof RobloxApiError) {
        if (error.kind === 'rate_limited') return "Roblox's API is rate limiting requests right now — try again in a moment.";
        if (error.kind === 'network') return "Couldn't reach Roblox right now. Try again shortly.";
        return 'Roblox returned an unexpected error. Try again shortly.';
    }
    return null;
}

function toAetherError(error, fallbackUserMessage) {
    if (error instanceof AetherError) return error;
    const mapped = userMessageForRobloxError(error);
    return new AetherError(`roblox verification: ${error.message}`, ErrorTypes.NETWORK, mapped || fallbackUserMessage);
}

async function listGuildProfiles(guildId) {
    const keys = await db.list(getRobloxProfilePrefix(guildId));
    const profiles = [];
    for (const key of keys) {
        const profile = await getFromDb(key, null);
        if (profile) profiles.push(profile);
    }
    return profiles;
}

export const getRobloxConfig = wrapServiceBoundary(async function getRobloxConfig(guildId) {
    return await getFromDb(getRobloxConfigKey(guildId), null);
}, {
    service: 'robloxVerificationService', operation: 'getRobloxConfig',
    message: 'Failed to read Roblox verification config',
    userMessage: 'Failed to load the Roblox verification configuration.',
});

export const setRobloxConfig = wrapServiceBoundary(async function setRobloxConfig(guildId, updates, configuredByUserId) {
    const existing = await getFromDb(getRobloxConfigKey(guildId), null);
    const config = {
        verifiedRoleId: existing?.verifiedRoleId ?? null,
        topBanner: existing?.topBanner ?? null,
        lowerBanner: existing?.lowerBanner ?? null,
        groupMappings: existing?.groupMappings ?? [],
        ...updates,
        configuredBy: configuredByUserId,
        updatedAt: Date.now(),
    };
    await setInDb(getRobloxConfigKey(guildId), config);
    return config;
}, {
    service: 'robloxVerificationService', operation: 'setRobloxConfig',
    message: 'Failed to save Roblox verification config',
    userMessage: 'Failed to save the Roblox verification configuration.',
});

export const addGroupMapping = wrapServiceBoundary(async function addGroupMapping(guildId, { groupId, groupName, minRank, roleId, nicknamePrefix }, configuredByUserId) {
    const existing = await getFromDb(getRobloxConfigKey(guildId), null);
    const groupMappings = existing?.groupMappings ? existing.groupMappings.map((g) => ({ ...g, rankMappings: [...g.rankMappings] })) : [];

    let group = groupMappings.find((g) => g.groupId === groupId);
    if (!group) {
        group = { groupId, groupName, rankMappings: [] };
        groupMappings.push(group);
    } else {
        group.groupName = groupName || group.groupName;
    }
    // Re-adding a mapping for a role that's already configured in this
    // group updates its threshold in place, rather than leaving the old
    // threshold behind as a second (stale) entry for the same role.
    group.rankMappings = group.rankMappings.filter((r) => r.roleId !== roleId);
    group.rankMappings.push({ minRank, roleId, nicknamePrefix: nicknamePrefix || null });
    group.rankMappings.sort((a, b) => b.minRank - a.minRank);

    return setRobloxConfig(guildId, { groupMappings }, configuredByUserId);
}, {
    service: 'robloxVerificationService', operation: 'addGroupMapping',
    message: 'Failed to save group rank mapping',
    userMessage: 'Failed to save that group rank mapping.',
});

export const removeGroupMapping = wrapServiceBoundary(async function removeGroupMapping(guildId, groupId, configuredByUserId) {
    const existing = await getFromDb(getRobloxConfigKey(guildId), null);
    const groupMappings = (existing?.groupMappings || []).filter((g) => g.groupId !== groupId);
    return setRobloxConfig(guildId, { groupMappings }, configuredByUserId);
}, {
    service: 'robloxVerificationService', operation: 'removeGroupMapping',
    message: 'Failed to remove group mapping',
    userMessage: 'Failed to remove that group mapping.',
});

export const beginVerification = wrapServiceBoundary(async function beginVerification(guildId, discordUserId, robloxUsername) {
    const config = await getFromDb(getRobloxConfigKey(guildId), null);
    if (!config?.verifiedRoleId) {
        throw new AetherError('roblox: not configured', ErrorTypes.VALIDATION,
            "Roblox verification isn't set up for this server yet. Ask an admin to run `/roblox setup`.");
    }

    let robloxUser;
    try {
        robloxUser = await getRobloxUserByUsername(robloxUsername.trim());
    } catch (error) {
        throw toAetherError(error, "Couldn't look that Roblox username up right now.");
    }

    if (!robloxUser) {
        throw new AetherError('roblox: username not found', ErrorTypes.VALIDATION,
            "I couldn't find a Roblox account with that username. Check the spelling and try again.");
    }

    const existingProfiles = await listGuildProfiles(guildId);
    const clash = existingProfiles.find((p) => p.robloxUserId === robloxUser.id && p.discordUserId !== discordUserId);
    if (clash) {
        throw new AetherError('roblox: account already linked', ErrorTypes.VALIDATION,
            'That Roblox account is already linked to a different Discord member in this server.');
    }

    const record = {
        discordUserId,
        robloxUserId: robloxUser.id,
        robloxUsername: robloxUser.name,
        robloxDisplayName: robloxUser.displayName,
        phrase: randomPhrase(),
        createdAt: Date.now(),
    };

    await setInDb(getRobloxPendingKey(guildId, discordUserId), record, PENDING_TTL_SECONDS);
    return record;
}, {
    service: 'robloxVerificationService', operation: 'beginVerification',
    message: 'Failed to begin Roblox verification',
    userMessage: 'Failed to start verification.',
});

export const getPendingVerification = wrapServiceBoundary(async function getPendingVerification(guildId, discordUserId) {
    return await getFromDb(getRobloxPendingKey(guildId, discordUserId), null);
}, {
    service: 'robloxVerificationService', operation: 'getPendingVerification',
    message: 'Failed to read pending verification',
    userMessage: 'Failed to check your verification status.',
});

function resolveGroupRoles(config, userGroupRoles) {
    const toAddRoleIds = new Set();
    let nicknamePrefix = null;

    for (const mapping of config.groupMappings || []) {
        const membership = userGroupRoles.find((g) => g.group?.id === mapping.groupId);
        const userRank = membership?.role?.rank ?? 0;
        if (userRank <= 0) continue;

        const matched = mapping.rankMappings.find((r) => userRank >= r.minRank);
        if (matched) {
            toAddRoleIds.add(matched.roleId);
            if (matched.nicknamePrefix && !nicknamePrefix) {
                nicknamePrefix = matched.nicknamePrefix;
            }
        }
    }

    return { roleIds: [...toAddRoleIds], nicknamePrefix };
}

export const syncGroupRoles = wrapServiceBoundary(async function syncGroupRoles(guild, member, robloxUserId) {
    const config = await getFromDb(getRobloxConfigKey(guild.id), null);
    if (!config?.groupMappings?.length) {
        return { added: [], removed: [], nicknamePrefix: null };
    }

    let userGroupRoles;
    try {
        userGroupRoles = await getRobloxUserGroupRoles(robloxUserId);
    } catch (error) {
        throw toAetherError(error, "Couldn't fetch group roles from Roblox right now.");
    }

    const { roleIds: desiredRoleIds, nicknamePrefix } = resolveGroupRoles(config, userGroupRoles);

    const allMappedRoleIds = new Set(
        (config.groupMappings || []).flatMap((g) => g.rankMappings.map((r) => r.roleId)),
    );

    const toAdd = desiredRoleIds.filter((id) => !member.roles.cache.has(id));
    const toRemove = [...allMappedRoleIds].filter((id) => !desiredRoleIds.includes(id) && member.roles.cache.has(id));

    for (const roleId of toRemove) {
        await member.roles.remove(roleId, 'Roblox group rank sync').catch((error) => {
            logger.warn(`[roblox] Failed to remove role ${roleId} from ${member.id}: ${error.message}`);
        });
    }
    for (const roleId of toAdd) {
        await member.roles.add(roleId, 'Roblox group rank sync').catch((error) => {
            logger.warn(`[roblox] Failed to add role ${roleId} to ${member.id}: ${error.message}`);
        });
    }

    return { added: toAdd, removed: toRemove, nicknamePrefix };
}, {
    service: 'robloxVerificationService', operation: 'syncGroupRoles',
    message: 'Failed to sync group roles',
    userMessage: 'Failed to sync group roles.',
});

export const completeVerification = wrapServiceBoundary(async function completeVerification(guild, member) {
    const guildId = guild.id;
    const discordUserId = member.id;

    const config = await getFromDb(getRobloxConfigKey(guildId), null);
    if (!config?.verifiedRoleId) {
        throw new AetherError('roblox: not configured', ErrorTypes.VALIDATION,
            "Verification isn't configured for this server yet. An admin needs to run `/roblox setup`.");
    }

    const record = await getFromDb(getRobloxPendingKey(guildId, discordUserId), null);
    if (!record) {
        throw new AetherError('roblox: no pending verification', ErrorTypes.VALIDATION,
            "You don't have an active verification. Use `/roblox link` or click **Verify** first.");
    }

    let robloxUser;
    try {
        robloxUser = await getRobloxUserById(record.robloxUserId);
    } catch (error) {
        throw toAetherError(error, "Couldn't check Roblox right now — your code is still saved, try again shortly.");
    }

    const description = String(robloxUser?.description || '').toLowerCase();
    if (!description.includes(record.phrase.toLowerCase())) {
        return { verified: false, record };
    }

    const role = await guild.roles.fetch(config.verifiedRoleId).catch(() => null);
    if (role) {
        await member.roles.add(role, `Roblox verification: ${record.robloxUsername} (${record.robloxUserId})`).catch((error) => {
            logger.warn(`[roblox] Could not add verified role: ${error.message}`);
        });
    }

    let groupSync = { added: [], removed: [], nicknamePrefix: null };
    try {
        groupSync = await syncGroupRoles(guild, member, record.robloxUserId);
    } catch (error) {
        logger.warn(`[roblox] Group sync failed during verification for ${discordUserId}: ${error.message}`);
    }

    const nickname = (groupSync.nicknamePrefix ? `${groupSync.nicknamePrefix} ` : '') + record.robloxUsername;
    await member.setNickname(nickname.slice(0, 32), 'Roblox verification').catch((error) => {
        logger.warn(`[roblox] Could not set nickname: ${error.message}`);
    });

    const profile = {
        discordUserId,
        robloxUserId: record.robloxUserId,
        robloxUsername: record.robloxUsername,
        robloxDisplayName: robloxUser.displayName || record.robloxDisplayName,
        verifiedAt: Date.now(),
    };
    await setInDb(getRobloxProfileKey(guildId, discordUserId), profile);
    await deleteFromDb(getRobloxPendingKey(guildId, discordUserId));

    return { verified: true, profile, role, groupSync };
}, {
    service: 'robloxVerificationService', operation: 'completeVerification',
    message: 'Failed to complete Roblox verification',
    userMessage: 'Verification failed unexpectedly. Try again.',
});

export const getProfile = wrapServiceBoundary(async function getProfile(guildId, discordUserId) {
    return await getFromDb(getRobloxProfileKey(guildId, discordUserId), null);
}, {
    service: 'robloxVerificationService', operation: 'getProfile',
    message: 'Failed to read Roblox profile',
    userMessage: 'Failed to look up that profile.',
});

export const findProfileByRobloxUsername = wrapServiceBoundary(async function findProfileByRobloxUsername(guildId, robloxUsername) {
    const profiles = await listGuildProfiles(guildId);
    const needle = robloxUsername.trim().toLowerCase();
    return profiles.find((p) => p.robloxUsername.toLowerCase() === needle) || null;
}, {
    service: 'robloxVerificationService', operation: 'findProfileByRobloxUsername',
    message: 'Failed to search Roblox profiles',
    userMessage: 'Failed to look up that profile.',
});

export const unverify = wrapServiceBoundary(async function unverify(guildId, discordUserId) {
    const profile = await getFromDb(getRobloxProfileKey(guildId, discordUserId), null);
    if (!profile) return false;
    await deleteFromDb(getRobloxProfileKey(guildId, discordUserId));
    return true;
}, {
    service: 'robloxVerificationService', operation: 'unverify',
    message: 'Failed to unverify user',
    userMessage: 'Failed to remove that verification.',
});
