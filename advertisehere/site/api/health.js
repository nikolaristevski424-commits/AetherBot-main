import { botRequest, BackendUnavailable } from './_lib/bot.js';
import { configuredAuth, json } from './_lib/security.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  let bot = { connected: false, status: 'not-configured' };
  try {
    const r = await botRequest('/internal/health');
    bot = { connected: r.status === 200 && r.data?.ready === true, status: r.data?.ready === true ? 'online' : 'degraded' };
  } catch (error) { bot.status = error instanceof BackendUnavailable ? 'not-connected' : 'unavailable'; }
  return json(res, 200, { website: 'online', discordOAuthConfigured: configuredAuth(), bot, checkedAt: new Date().toISOString() });
}
