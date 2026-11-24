import { authResponse } from '../lib/auth.js';
import { botOrigin } from '../lib/bridge.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return authResponse(res, 405, { error: 'Method not allowed.' });
    const origin = botOrigin();
    if (origin) {
        try {
            const response = await fetch(origin + '/api/site-observations', { signal: AbortSignal.timeout(4500), redirect: 'error' });
            if (response.ok) return authResponse(res, 200, await response.json());
        } catch { /* Live service checks remain independent of history. */ }
    }
    return authResponse(res, 503, { error: 'Observation history is unavailable.' });
}
