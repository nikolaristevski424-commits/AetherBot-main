// actionTracker.js
//
// Generic sliding-window event counter shared by anti-raid (guild-wide join
// rate) and anti-nuke (per-executor destructive-action rate). Records a
// timestamp, discards anything older than the configured window, and
// reports whether the remaining count breaches the threshold — the same
// primitive either system needs, just keyed differently.

import { getFromDb, setInDb } from '../../utils/database.js';
import { getSecurityJoinsKey, getSecurityActionsKey } from '../../utils/database/keys.js';

const MAX_TRACKED_TIMESTAMPS = 200; // hard cap so a runaway loop can't grow a key unbounded

async function recordAndCheck(key, windowSeconds, threshold) {
    const now = Date.now();
    const cutoff = now - windowSeconds * 1000;

    const existing = await getFromDb(key, []);
    const withinWindow = existing.filter((ts) => ts > cutoff);
    withinWindow.push(now);

    const trimmed = withinWindow.length > MAX_TRACKED_TIMESTAMPS
        ? withinWindow.slice(withinWindow.length - MAX_TRACKED_TIMESTAMPS)
        : withinWindow;

    // TTL a bit past the window — if nothing else happens, the key cleans
    // itself up instead of sitting around forever.
    await setInDb(key, trimmed, windowSeconds + 30);

    return { count: trimmed.length, breached: trimmed.length >= threshold };
}

/** Guild-wide join-rate tracking for anti-raid. */
export async function recordJoinAndCheck(guildId, windowSeconds, threshold) {
    return recordAndCheck(getSecurityJoinsKey(guildId), windowSeconds, threshold);
}

/** Per-executor destructive-action tracking for anti-nuke. */
export async function recordActionAndCheck(guildId, category, executorId, windowSeconds, threshold) {
    return recordAndCheck(getSecurityActionsKey(guildId, category, executorId), windowSeconds, threshold);
}
