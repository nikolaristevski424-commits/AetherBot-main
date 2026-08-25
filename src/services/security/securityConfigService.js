// securityConfigService.js
//
// Guild-scoped config for anti-raid / anti-nuke: per-protection-type
// thresholds and actions, the whitelist that exempts trusted users/roles
// from anti-nuke actions, lockdown state, and a capped recent-events log
// that /security-status reads from.

import { getFromDb, setInDb } from '../../utils/database.js';
import { getSecurityConfigKey, getSecurityLogKey } from '../../utils/database/keys.js';
import { wrapServiceBoundary } from '../../utils/errorHandler.js';

const MAX_LOG_ENTRIES = 25;

const DEFAULT_CONFIG = Object.freeze({
    antiraid: {
        joinSpike: { enabled: false, threshold: 10, windowSeconds: 30, action: 'alert', alertChannelId: null },
        newAccount: { enabled: false, minAgeHours: 24, action: 'alert', alertChannelId: null },
    },
    antinuke: {
        channelDelete: { enabled: false, threshold: 3, windowSeconds: 60, action: 'alert', alertChannelId: null },
        roleDelete: { enabled: false, threshold: 3, windowSeconds: 60, action: 'alert', alertChannelId: null },
        banSpam: { enabled: false, threshold: 3, windowSeconds: 60, action: 'alert', alertChannelId: null },
    },
    whitelist: { userIds: [], roleIds: [] },
    quarantineRoleId: null,
    lockdown: { active: false, engagedBy: null, engagedAt: null, reason: null, lockedChannelIds: [] },
});

function mergeConfig(existing) {
    if (!existing) return structuredClone(DEFAULT_CONFIG);
    return {
        antiraid: {
            joinSpike: { ...DEFAULT_CONFIG.antiraid.joinSpike, ...existing.antiraid?.joinSpike },
            newAccount: { ...DEFAULT_CONFIG.antiraid.newAccount, ...existing.antiraid?.newAccount },
        },
        antinuke: {
            channelDelete: { ...DEFAULT_CONFIG.antinuke.channelDelete, ...existing.antinuke?.channelDelete },
            roleDelete: { ...DEFAULT_CONFIG.antinuke.roleDelete, ...existing.antinuke?.roleDelete },
            banSpam: { ...DEFAULT_CONFIG.antinuke.banSpam, ...existing.antinuke?.banSpam },
        },
        whitelist: {
            userIds: existing.whitelist?.userIds ?? [],
            roleIds: existing.whitelist?.roleIds ?? [],
        },
        quarantineRoleId: existing.quarantineRoleId ?? null,
        lockdown: { ...DEFAULT_CONFIG.lockdown, ...existing.lockdown },
    };
}

export const getSecurityConfig = wrapServiceBoundary(async function getSecurityConfig(guildId) {
    const existing = await getFromDb(getSecurityConfigKey(guildId), null);
    return mergeConfig(existing);
}, {
    service: 'securityConfigService', operation: 'getSecurityConfig',
    message: 'Failed to read security config', userMessage: 'Failed to load the security configuration.',
});

export const setProtection = wrapServiceBoundary(async function setProtection(guildId, system, type, updates) {
    const config = mergeConfig(await getFromDb(getSecurityConfigKey(guildId), null));
    config[system][type] = { ...config[system][type], ...updates };
    await setInDb(getSecurityConfigKey(guildId), config);
    return config[system][type];
}, {
    service: 'securityConfigService', operation: 'setProtection',
    message: 'Failed to update protection config', userMessage: 'Failed to update that protection setting.',
});

export const setQuarantineRole = wrapServiceBoundary(async function setQuarantineRole(guildId, roleId) {
    const config = mergeConfig(await getFromDb(getSecurityConfigKey(guildId), null));
    config.quarantineRoleId = roleId;
    await setInDb(getSecurityConfigKey(guildId), config);
    return config;
}, {
    service: 'securityConfigService', operation: 'setQuarantineRole',
    message: 'Failed to set quarantine role', userMessage: 'Failed to set the quarantine role.',
});

export const addToWhitelist = wrapServiceBoundary(async function addToWhitelist(guildId, targetType, targetId) {
    const config = mergeConfig(await getFromDb(getSecurityConfigKey(guildId), null));
    const list = targetType === 'role' ? config.whitelist.roleIds : config.whitelist.userIds;
    if (!list.includes(targetId)) list.push(targetId);
    await setInDb(getSecurityConfigKey(guildId), config);
    return config.whitelist;
}, {
    service: 'securityConfigService', operation: 'addToWhitelist',
    message: 'Failed to update whitelist', userMessage: 'Failed to add to the whitelist.',
});

export const removeFromWhitelist = wrapServiceBoundary(async function removeFromWhitelist(guildId, targetType, targetId) {
    const config = mergeConfig(await getFromDb(getSecurityConfigKey(guildId), null));
    if (targetType === 'role') {
        config.whitelist.roleIds = config.whitelist.roleIds.filter((id) => id !== targetId);
    } else {
        config.whitelist.userIds = config.whitelist.userIds.filter((id) => id !== targetId);
    }
    await setInDb(getSecurityConfigKey(guildId), config);
    return config.whitelist;
}, {
    service: 'securityConfigService', operation: 'removeFromWhitelist',
    message: 'Failed to update whitelist', userMessage: 'Failed to remove from the whitelist.',
});

/** True if the member should be exempt from anti-nuke actions — the guild
 * owner always is, along with anyone whose user ID or any of their role IDs
 * appear in the configured whitelist. */
export function isWhitelisted(config, member) {
    if (!member) return false;
    if (member.id === member.guild.ownerId) return true;
    if (config.whitelist.userIds.includes(member.id)) return true;
    return member.roles.cache.some((role) => config.whitelist.roleIds.includes(role.id));
}

export const setLockdown = wrapServiceBoundary(async function setLockdown(guildId, { active, engagedBy, reason, lockedChannelIds }) {
    const config = mergeConfig(await getFromDb(getSecurityConfigKey(guildId), null));
    config.lockdown = active
        ? { active: true, engagedBy, engagedAt: Date.now(), reason: reason || null, lockedChannelIds: lockedChannelIds || [] }
        : { active: false, engagedBy: null, engagedAt: null, reason: null, lockedChannelIds: [] };
    await setInDb(getSecurityConfigKey(guildId), config);
    return config.lockdown;
}, {
    service: 'securityConfigService', operation: 'setLockdown',
    message: 'Failed to update lockdown state', userMessage: 'Failed to update lockdown state.',
});

export const logSecurityEvent = wrapServiceBoundary(async function logSecurityEvent(guildId, event) {
    const key = getSecurityLogKey(guildId);
    const log = await getFromDb(key, []);
    log.unshift({ ...event, timestamp: Date.now() });
    await setInDb(key, log.slice(0, MAX_LOG_ENTRIES));
}, {
    service: 'securityConfigService', operation: 'logSecurityEvent',
    message: 'Failed to write security log', userMessage: 'Failed to log the security event.',
});

export const getSecurityLog = wrapServiceBoundary(async function getSecurityLog(guildId, limit = 10) {
    const log = await getFromDb(getSecurityLogKey(guildId), []);
    return log.slice(0, limit);
}, {
    service: 'securityConfigService', operation: 'getSecurityLog',
    message: 'Failed to read security log', userMessage: 'Failed to load the security log.',
});
