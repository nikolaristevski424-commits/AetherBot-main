import { botOrigin } from './bridge.js';

let cached;
let loading;
export async function siteContent() {
    if (cached?.until > Date.now()) return cached.value;
    if (loading) return loading;
    const origin = botOrigin();
    if (!origin) return null;

    loading = (async () => {
        try {
            const response = await fetch(origin + '/api/site-content', { signal: AbortSignal.timeout(1400), redirect: 'error' });
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Content unavailable');
            const value = await response.json();
            if (!value || typeof value.maintenance !== 'object' || !Array.isArray(value.staff) || !Array.isArray(value.devlogs)) throw new Error('Invalid content');
            cached = { value, until: Date.now() + 10_000, staleUntil: Date.now() + 60_000 };
            return value;
        } catch {
            const stale = cached?.staleUntil > Date.now() ? cached.value : null;
            cached = { value: stale, until: Date.now() + 5000, staleUntil: cached?.staleUntil };
            return stale;
        } finally {
            loading = null;
        }
    })();
    return loading;
}
