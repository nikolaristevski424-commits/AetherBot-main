import { db } from '../utils/database.js';
import { Mutex } from '../utils/mutex.js';
import { cadWebsiteOrigin } from './cad/websiteLogin.js';

const key = 'site:observations';
const components = ['website', 'discord', 'storage'];
const dayMs = 86400_000;
const intervalMs = 15 * 60_000;
const utcDay = time => new Date(time).toISOString().slice(0, 10);

export function mergeObservation(history, at, statuses) {
    const day = utcDay(at);
    const earliest = utcDay(at - 44 * dayMs);
    const days = Object.fromEntries(Object.entries(history.days ?? {}).filter(([date]) => date >= earliest && date <= day));
    const bucket = days[day] ?? {};
    for (const component of components) {
        if (typeof statuses[component] !== 'boolean') continue;
        const current = bucket[component] ?? { passed: 0, failed: 0 };
        if (statuses[component]) current.passed++;
        else current.failed++;
        bucket[component] = current;
    }
    days[day] = bucket;
    return { lastAt: at, days };
}

export async function readObservations() {
    if (!db.isAvailable()) throw new Error('Observation storage unavailable');
    const history = await db.get(key, null, { throwOnError: true });
    const now = Date.now();
    const days = Array.from({ length: 45 }, (_, i) => utcDay(now - (44 - i) * dayMs));
    return {
        checkedAt: history?.lastAt ? new Date(history.lastAt).toISOString() : null,
        days: days.map(day => ({
            day,
            checks: Object.fromEntries(components.map(component => [component, history?.days?.[day]?.[component] ?? null])),
        })),
    };
}

async function websiteCheck() {
    const origin = cadWebsiteOrigin();
    if (!origin) return null;
    try {
        const response = await fetch(origin + '/api/config', { signal: AbortSignal.timeout(4500), redirect: 'error' });
        return response.ok && Boolean(response.headers.get('content-type')?.includes('application/json'));
    } catch { return false; }
}

export async function sampleStatus(client) {
    if (!db.isAvailable()) return;
    return Mutex.runExclusive(key, async () => {
        const at = Date.now();
        const history = await db.get(key, null, { throwOnError: true }) ?? {};
        if (history.lastAt && at - history.lastAt < intervalMs - 1000) return;
        const status = { website: await websiteCheck(), discord: client.isReady(), storage: true };
        if (await db.set(key, mergeObservation(history, at, status)) === false) throw new Error('Observation could not be persisted');
        db.flush();
    });
}
