// erlcService.js
//
// Guild-scoped wrapper around erlcClient: stores each guild's ER:LC server
// key and related settings, and translates ErlcApiError into the app's
// AetherError shape with a message tailored to what actually went wrong
// (bad key vs. offline vs. rate limited vs. outdated module all need
// different guidance for the user, not one generic "something went wrong").

import { getFromDb, setInDb, deleteFromDb } from '../../utils/database.js';
import { getErlcConfigKey, getErlcStatusMessageKey } from '../../utils/database/keys.js';
import { erlcClient, ErlcApiError } from './erlcClient.js';
import { decryptErlcKey, encryptErlcKey, isEncryptedErlcKey } from './erlcKeyEncryption.js';
import { AetherError, ErrorTypes, wrapServiceBoundary } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

function userMessageForErlcError(error) {
    switch (error.kind) {
        case 'auth':
            return 'That ER:LC server key looks invalid, expired, or banned. Re-run `/erlc setup` with a fresh key from your private server settings.';
        case 'offline':
            return 'The private server is currently offline (no players in-game). Live status/commands need at least one player in the server.';
        case 'outdated_module':
            return 'The ER:LC in-game module is out of date for that server. Have everyone leave and rejoin the private server, then try again.';
        case 'rate_limited':
            return `This is being rate limited right now — try again in about ${Math.ceil((error.retryAfterMs || 5000) / 1000)}s.`;
        case 'network':
            return "Couldn't reach the ER:LC API right now. Try again shortly.";
        default:
            return 'The ER:LC API returned an error. Try again, and let staff know if this keeps happening.';
    }
}

function toAetherError(error, { operation }) {
    if (error instanceof ErlcApiError) {
        return new AetherError(
            `erlcService.${operation} failed: ${error.message}`,
            error.kind === 'auth' || error.kind === 'rate_limited' ? ErrorTypes.VALIDATION : ErrorTypes.NETWORK,
            userMessageForErlcError(error),
            { erlcErrorKind: error.kind, erlcErrorCode: error.code, retryAfterMs: error.retryAfterMs },
        );
    }
    return error;
}

export const getErlcConfig = wrapServiceBoundary(async function getErlcConfig(guildId) {
    const config = await getFromDb(getErlcConfigKey(guildId), null);
    if (!config?.serverKey) return config;

    const serverKey = decryptErlcKey(config.serverKey);
    if (!isEncryptedErlcKey(config.serverKey) && process.env.ERLC_KEY_ENCRYPTION_SECRET) {
        await persistErlcConfig(guildId, { ...config, serverKey });
    }
    return { ...config, serverKey };
}, {
    service: 'erlcService',
    operation: 'getErlcConfig',
    message: 'Failed to read ER:LC configuration',
    userMessage: 'Failed to load the ER:LC configuration for this server.',
});

async function persistErlcConfig(guildId, config) {
    const storedConfig = config?.serverKey
        ? { ...config, serverKey: encryptErlcKey(config.serverKey) }
        : config;
    await setInDb(getErlcConfigKey(guildId), storedConfig);
}

export const updateErlcConfigSettings = wrapServiceBoundary(async function updateErlcConfigSettings(guildId, updates) {
    const existing = await getErlcConfig(guildId);
    if (!existing?.serverKey) {
        throw new AetherError('erlcService: no server key configured', ErrorTypes.VALIDATION,
            'ER:LC isn\'t set up for this server yet. Run `/erlc setup` first.');
    }
    const config = { ...existing, ...updates };
    await persistErlcConfig(guildId, config);
    return config;
}, {
    service: 'erlcService',
    operation: 'updateErlcConfigSettings',
    message: 'Failed to update ER:LC settings',
    userMessage: 'Failed to update the ER:LC settings.',
});

/**
 * Validates the key against the live API before saving it, so a typo
 * doesn't sit silently in config until someone tries to use it later.
 */
export const setErlcServerKey = wrapServiceBoundary(async function setErlcServerKey(guildId, serverKey, configuredByUserId) {
    try {
        await erlcClient.getServer(serverKey);
    } catch (error) {
        throw toAetherError(error, { operation: 'setErlcServerKey' });
    }

    const storedConfig = await getFromDb(getErlcConfigKey(guildId), null);
    let existing = storedConfig;
    if (storedConfig?.serverKey) {
        try {
            existing = { ...storedConfig, serverKey: decryptErlcKey(storedConfig.serverKey) };
        } catch {
            existing = storedConfig;
        }
    }
    if (existing?.serverKey && existing.serverKey !== serverKey) {
        erlcClient.forgetKey(existing.serverKey);
    }

    const config = {
        serverKey,
        statusChannelId: existing?.statusChannelId ?? null,
        autoUpdate: existing?.autoUpdate ?? false,
        configuredBy: configuredByUserId,
        configuredAt: Date.now(),
    };
    await persistErlcConfig(guildId, config);
    return config;
}, {
    service: 'erlcService',
    operation: 'setErlcServerKey',
    message: 'Failed to save ER:LC server key',
    userMessage: 'Failed to save the ER:LC server key.',
});

export const clearErlcConfig = wrapServiceBoundary(async function clearErlcConfig(guildId) {
    const existing = await getFromDb(getErlcConfigKey(guildId), null);
    if (existing?.serverKey) {
        erlcClient.forgetKey(existing.serverKey);
    }
    await deleteFromDb(getErlcConfigKey(guildId));
    await deleteFromDb(getErlcStatusMessageKey(guildId));
    return true;
}, {
    service: 'erlcService',
    operation: 'clearErlcConfig',
    message: 'Failed to clear ER:LC configuration',
    userMessage: 'Failed to clear the ER:LC configuration.',
});

async function requireConfig(guildId) {
    const config = await getErlcConfig(guildId);
    if (!config?.serverKey) {
        throw new AetherError(
            'erlcService: no server key configured',
            ErrorTypes.VALIDATION,
            'ER:LC isn\'t set up for this server yet. Run `/erlc setup` with your private server\'s API key first.',
        );
    }
    return config;
}

export const getServerStatus = wrapServiceBoundary(async function getServerStatus(guildId, include = []) {
    const config = await requireConfig(guildId);
    try {
        return await erlcClient.getServer(config.serverKey, include);
    } catch (error) {
        throw toAetherError(error, { operation: 'getServerStatus' });
    }
}, {
    service: 'erlcService',
    operation: 'getServerStatus',
    message: 'Failed to fetch ER:LC server status',
    userMessage: 'Failed to fetch the ER:LC server status.',
});

export const runServerCommand = wrapServiceBoundary(async function runServerCommand(guildId, command) {
    const config = await requireConfig(guildId);
    try {
        const result = await erlcClient.runCommand(config.serverKey, command);
        logger.info(`[ERLC] Ran command in guild ${guildId}: ${command}`);
        return result;
    } catch (error) {
        throw toAetherError(error, { operation: 'runServerCommand' });
    }
}, {
    service: 'erlcService',
    operation: 'runServerCommand',
    message: 'Failed to run ER:LC command',
    userMessage: 'Failed to run that command.',
});
