import { botRequest, BackendUnavailable } from './_lib/bot.js';
import { json, sessionUser, requireSameOrigin } from './_lib/security.js';
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  const user = sessionUser(req);
  if (req.method === 'POST' && (!user || !requireSameOrigin(req))) return json(res, 403, { error: 'Sign in and use this website to submit listings.' });
  try {
    const result = await botRequest('/internal/listings', { method: req.method, body: req.method === 'POST' ? { ...req.body, actorId: user.id } : undefined });
    return json(res, result.status, result.data);
  } catch (error) { return json(res, 503, { configured: false, listings: [], error: error instanceof BackendUnavailable ? error.message : 'Directory temporarily unavailable' }); }
}
