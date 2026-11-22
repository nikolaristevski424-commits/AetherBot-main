import { db } from '../../utils/database.js';
import { getSecurityJoinsKey, getSecurityActionsKey } from '../../utils/database/keys.js';
import { Mutex } from '../../utils/mutex.js';

const maxEntries = 200;

export function trackWindow(previous, event, now, windowSeconds, threshold, cooldown) {
    const cutoff = now - windowSeconds * 1000;
    // Older releases used an array of timestamps. Preserve the remaining window.
    const current = Array.isArray(previous)
        ? { events: previous.map(at => ({ at })), respondedAt: null }
        : previous || { events: [], respondedAt: null };
    const events = current.events.filter(item => item.at > cutoff);
    if (event.at <= cutoff || (event.id && events.some(item => item.id === event.id))) {
        return { state: current, count: events.length, breached: false };
    }
    events.push(event);
    const count = Math.min(events.length, maxEntries);
    const breached = count >= threshold && (!cooldown || current.respondedAt === null || current.respondedAt <= cutoff);
    const state = { events: events.slice(-maxEntries), respondedAt: breached && cooldown ? now : current.respondedAt };
    return { state, count, breached };
}

function record(key, event, windowSeconds, threshold, cooldown) {
    return Mutex.runExclusive(key, async () => {
        const now = Date.now();
        const result = trackWindow(await db.get(key), event, now, windowSeconds, threshold, cooldown);
        await db.set(key, result.state, windowSeconds + 65);
        return result;
    });
}

export function recordJoinAndCheck(guildId, windowSeconds, threshold, member) {
    return record(getSecurityJoinsKey(guildId), { id: `${member.id}:${member.joinedTimestamp}`, at: Date.now() }, windowSeconds, threshold, false);
}

export function recordActionAndCheck(guildId, category, executorId, windowSeconds, threshold, event) {
    return record(getSecurityActionsKey(guildId, category, executorId), event, windowSeconds, threshold, true);
}
