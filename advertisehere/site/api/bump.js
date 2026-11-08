import { botRequest, BackendUnavailable } from './_lib/bot.js';
import { sessionUser, requireSameOrigin, json } from './_lib/security.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const user = sessionUser(req);
  if (!user) return json(res, 401, { error: 'Sign in with Discord' });
  if (!requireSameOrigin(req)) return json(res, 403, { error: 'Invalid request origin' });
  try {
    const result = await botRequest('/internal/bump', { method: 'POST', body: { actorId: user.id, guildId: req.body?.guildId } });
    return json(res, result.status, result.data);
  } catch (error) { return json(res, 503, { error: error instanceof BackendUnavailable ? error.message : 'Backend unavailable' }); }
}
