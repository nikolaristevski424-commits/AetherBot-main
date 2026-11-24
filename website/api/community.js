import { authResponse } from '../lib/auth.js';
import { botOrigin } from '../lib/bridge.js';
import { siteContent } from '../lib/site-content.js';
import { maintenanceFor } from '../lib/publishing.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return authResponse(res, 405, { error: 'Method not allowed.' });
    const { kind } = req.query ?? {};
    if (!['presets', 'reviews'].includes(kind)) return authResponse(res, 400, { error: 'Choose a community section.' });
    if (maintenanceFor(await siteContent(), kind === 'presets' ? 'community' : 'reviews')) {
        return authResponse(res, 503, { error: 'This community section is under maintenance.' });
    }
    const origin = botOrigin();
    if (origin) {
        const url = new URL('/api/site-community', origin);
        url.searchParams.set('kind', kind);
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
            if (response.ok) return authResponse(res, 200, await response.json());
        } catch { /* Show a recoverable public error. */ }
    }
    return authResponse(res, 503, { error: 'Community posts are temporarily unavailable.' });
}
