// erlcOperationsService.js
//
// Session management, Leave of Absence, and duty-shift tracking for ER:LC
// staff teams — the "staff management" / "session management" side of the
// module, separate from erlcService.js (which is the raw API wrapper +
// server config). All state here is guild-scoped and persisted through the
// same FileStorage-backed KV store as everything else in Aether, unlike the
// in-memory (non-persistent, non-guild-isolated) vote tracking pattern seen
// in some reference ER:LC bots — a session vote here survives a restart and
// never leaks between servers.

import { getFromDb, setInDb, deleteFromDb } from '../../utils/database.js';
import { db } from '../../utils/database/wrapper.js';
import {
    getErlcSessionStateKey,
    getErlcSessionVoteKey,
    getErlcLoaKey,
    getErlcLoaPrefix,
    getErlcShiftActiveKey,
    getErlcShiftTotalKey,
    getErlcShiftTotalPrefix,
} from '../../utils/database/keys.js';
import { getErlcConfig } from './erlcService.js';
import { AetherError, ErrorTypes, wrapServiceBoundary } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

const VOTE_TTL_SECONDS = 10 * 60; // votes auto-expire after 10 minutes of inactivity

async function requireErlcConfig(guildId) {
    const config = await getErlcConfig(guildId);
    if (!config?.serverKey) {
        throw new AetherError('erlc ops: not configured', ErrorTypes.VALIDATION,
            "ER:LC isn't set up for this server yet. Run `/erlc setup` first.");
    }
    return config;
}

// ---------- Sessions ----------

export const startSession = wrapServiceBoundary(async function startSession(guild, startedByUserId) {
    const config = await requireErlcConfig(guild.id);
    if (!config.sessionChannelId) {
        throw new AetherError('erlc ops: no session channel', ErrorTypes.VALIDATION,
            'No session announcement channel is configured. Set `session_channel` with `/erlc setup`.');
    }

    const existing = await getFromDb(getErlcSessionStateKey(guild.id), null);
    if (existing?.active) {
        throw new AetherError('erlc ops: session already active', ErrorTypes.VALIDATION,
            'A session is already marked active. Use `/erlc session shutdown` first if it actually ended.');
    }

    const state = {
        active: true,
        startedBy: startedByUserId,
        startedAt: Date.now(),
        channelId: config.sessionChannelId,
    };
    await setInDb(getErlcSessionStateKey(guild.id), state);
    await deleteFromDb(getErlcSessionVoteKey(guild.id));
    return { state, roleId: config.sessionRoleId || null };
}, {
    service: 'erlcOperationsService', operation: 'startSession',
    message: 'Failed to start session', userMessage: 'Failed to start the session.',
});

export const attachSessionMessage = wrapServiceBoundary(async function attachSessionMessage(guildId, messageId) {
    const state = await getFromDb(getErlcSessionStateKey(guildId), null);
    if (!state) return null;
    state.messageId = messageId;
    await setInDb(getErlcSessionStateKey(guildId), state);
    return state;
}, {
    service: 'erlcOperationsService', operation: 'attachSessionMessage',
    message: 'Failed to save session message', userMessage: 'Failed to save session message reference.',
});

export const shutdownSession = wrapServiceBoundary(async function shutdownSession(guildId) {
    const state = await getFromDb(getErlcSessionStateKey(guildId), null);
    if (!state?.active) {
        throw new AetherError('erlc ops: no active session', ErrorTypes.VALIDATION, 'There\'s no active session to shut down.');
    }
    await deleteFromDb(getErlcSessionStateKey(guildId));
    return state;
}, {
    service: 'erlcOperationsService', operation: 'shutdownSession',
    message: 'Failed to shut down session', userMessage: 'Failed to shut down the session.',
});

export const getSessionState = wrapServiceBoundary(async function getSessionState(guildId) {
    return await getFromDb(getErlcSessionStateKey(guildId), null);
}, {
    service: 'erlcOperationsService', operation: 'getSessionState',
    message: 'Failed to read session state', userMessage: 'Failed to check session status.',
});

export const startSessionVote = wrapServiceBoundary(async function startSessionVote(guild, startedByUserId, threshold) {
    const config = await requireErlcConfig(guild.id);
    const existing = await getFromDb(getErlcSessionVoteKey(guild.id), null);
    if (existing) {
        throw new AetherError('erlc ops: vote already active', ErrorTypes.VALIDATION, 'There\'s already an active session vote.');
    }

    const vote = { startedBy: startedByUserId, threshold, voters: [], createdAt: Date.now() };
    await setInDb(getErlcSessionVoteKey(guild.id), vote, VOTE_TTL_SECONDS);
    return { vote, channelId: config.sessionChannelId || null, roleId: config.sessionRoleId || null };
}, {
    service: 'erlcOperationsService', operation: 'startSessionVote',
    message: 'Failed to start session vote', userMessage: 'Failed to start the session vote.',
});

export const attachVoteMessage = wrapServiceBoundary(async function attachVoteMessage(guildId, messageId) {
    const vote = await getFromDb(getErlcSessionVoteKey(guildId), null);
    if (!vote) return null;
    vote.messageId = messageId;
    await setInDb(getErlcSessionVoteKey(guildId), vote, VOTE_TTL_SECONDS);
    return vote;
}, {
    service: 'erlcOperationsService', operation: 'attachVoteMessage',
    message: 'Failed to save vote message', userMessage: 'Failed to save vote message reference.',
});

export const castSessionVote = wrapServiceBoundary(async function castSessionVote(guildId, userId) {
    const vote = await getFromDb(getErlcSessionVoteKey(guildId), null);
    if (!vote) {
        throw new AetherError('erlc ops: no active vote', ErrorTypes.VALIDATION, 'There\'s no active session vote right now.');
    }
    if (vote.voters.includes(userId)) {
        return { vote, alreadyVoted: true, reachedThreshold: false };
    }
    vote.voters.push(userId);
    const reachedThreshold = vote.voters.length >= vote.threshold;
    if (reachedThreshold) {
        await deleteFromDb(getErlcSessionVoteKey(guildId));
    } else {
        await setInDb(getErlcSessionVoteKey(guildId), vote, VOTE_TTL_SECONDS);
    }
    return { vote, alreadyVoted: false, reachedThreshold };
}, {
    service: 'erlcOperationsService', operation: 'castSessionVote',
    message: 'Failed to record vote', userMessage: 'Failed to record your vote.',
});

const BOOST_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between boosts, so it can't be used to spam-ping

export const boostSession = wrapServiceBoundary(async function boostSession(guildId) {
    const state = await getFromDb(getErlcSessionStateKey(guildId), null);
    if (!state?.active) {
        throw new AetherError('erlc ops: no active session', ErrorTypes.VALIDATION, 'There\'s no active session to boost.');
    }
    const sinceLast = state.lastBoostAt ? Date.now() - state.lastBoostAt : Infinity;
    if (sinceLast < BOOST_COOLDOWN_MS) {
        throw new AetherError('erlc ops: boost on cooldown', ErrorTypes.VALIDATION,
            `Boost is on cooldown — wait ${Math.ceil((BOOST_COOLDOWN_MS - sinceLast) / 60000)} more minute(s).`);
    }
    state.lastBoostAt = Date.now();
    await setInDb(getErlcSessionStateKey(guildId), state);
    return state;
}, {
    service: 'erlcOperationsService', operation: 'boostSession',
    message: 'Failed to boost session', userMessage: 'Failed to boost the session.',
});

// ---------- Leave of Absence ----------

export const requestLoa = wrapServiceBoundary(async function requestLoa(guildId, userId, { reason, durationDays }) {
    const existing = await getFromDb(getErlcLoaKey(guildId, userId), null);
    if (existing) {
        throw new AetherError('erlc ops: loa already active', ErrorTypes.VALIDATION, 'You already have an active LOA. End it first if you need to change it.');
    }

    const startedAt = Date.now();
    const endsAt = durationDays ? startedAt + durationDays * 24 * 60 * 60 * 1000 : null;
    const record = { userId, reason, startedAt, endsAt };
    await setInDb(getErlcLoaKey(guildId, userId), record);
    return record;
}, {
    service: 'erlcOperationsService', operation: 'requestLoa',
    message: 'Failed to request LOA', userMessage: 'Failed to submit your LOA request.',
});

export const endLoa = wrapServiceBoundary(async function endLoa(guildId, userId) {
    const existing = await getFromDb(getErlcLoaKey(guildId, userId), null);
    if (!existing) return null;
    await deleteFromDb(getErlcLoaKey(guildId, userId));
    return existing;
}, {
    service: 'erlcOperationsService', operation: 'endLoa',
    message: 'Failed to end LOA', userMessage: 'Failed to end that LOA.',
});

export const listActiveLoas = wrapServiceBoundary(async function listActiveLoas(guildId) {
    const keys = await db.list(getErlcLoaPrefix(guildId));
    const records = [];
    const now = Date.now();
    for (const key of keys) {
        const record = await getFromDb(key, null);
        if (!record) continue;
        if (record.endsAt && record.endsAt < now) {
            // Expired — clean it up rather than showing stale entries.
            await deleteFromDb(key);
            continue;
        }
        records.push(record);
    }
    return records;
}, {
    service: 'erlcOperationsService', operation: 'listActiveLoas',
    message: 'Failed to list LOAs', userMessage: 'Failed to load active LOAs.',
});

// ---------- Duty shifts ----------

export const startShift = wrapServiceBoundary(async function startShift(guildId, userId) {
    const existing = await getFromDb(getErlcShiftActiveKey(guildId, userId), null);
    if (existing) {
        throw new AetherError('erlc ops: shift already active', ErrorTypes.VALIDATION, 'You already have an active shift running.');
    }
    const record = { userId, startedAt: Date.now() };
    await setInDb(getErlcShiftActiveKey(guildId, userId), record);
    return record;
}, {
    service: 'erlcOperationsService', operation: 'startShift',
    message: 'Failed to start shift', userMessage: 'Failed to start your shift.',
});

export const endShift = wrapServiceBoundary(async function endShift(guildId, userId) {
    const active = await getFromDb(getErlcShiftActiveKey(guildId, userId), null);
    if (!active) {
        throw new AetherError('erlc ops: no active shift', ErrorTypes.VALIDATION, "You don't have an active shift running.");
    }
    const durationMs = Date.now() - active.startedAt;
    const priorTotal = await getFromDb(getErlcShiftTotalKey(guildId, userId), 0);
    const newTotal = priorTotal + durationMs;
    await setInDb(getErlcShiftTotalKey(guildId, userId), newTotal);
    await deleteFromDb(getErlcShiftActiveKey(guildId, userId));
    return { durationMs, totalMs: newTotal };
}, {
    service: 'erlcOperationsService', operation: 'endShift',
    message: 'Failed to end shift', userMessage: 'Failed to end your shift.',
});

export const getShiftLeaderboard = wrapServiceBoundary(async function getShiftLeaderboard(guildId, limit = 10) {
    const keys = await db.list(getErlcShiftTotalPrefix(guildId));
    const entries = [];
    for (const key of keys) {
        const totalMs = await getFromDb(key, 0);
        const userId = key.slice(getErlcShiftTotalPrefix(guildId).length);
        if (totalMs > 0) entries.push({ userId, totalMs });
    }
    entries.sort((a, b) => b.totalMs - a.totalMs);
    return entries.slice(0, limit);
}, {
    service: 'erlcOperationsService', operation: 'getShiftLeaderboard',
    message: 'Failed to load shift leaderboard', userMessage: 'Failed to load the shift leaderboard.',
});
