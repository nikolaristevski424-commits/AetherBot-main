import { authResponse } from '../lib/auth.js';
import { siteContent } from '../lib/site-content.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return authResponse(res, 405, { error: 'Method not allowed.' });
    const content = await siteContent();
    return authResponse(res, content ? 200 : 503, content || { error: 'Aether site updates are temporarily unavailable.' });
}
