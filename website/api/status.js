import { authResponse, loginReady } from '../lib/auth.js';
import { bridgeReady, botOrigin } from '../lib/bridge.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') return authResponse(res, 405, { error: 'Method not allowed' });
  if (!botOrigin()) return authResponse(res, 200, { website: 'operational', bot: 'unmonitored', cad: 'unmonitored', auth: loginReady() ? 'configured' : 'not_configured', updatedAt: new Date().toISOString(), note: 'Bot HTTPS origin is not configured.' });
  const c = new AbortController(); const timer = setTimeout(() => c.abort(), 3500);
  try {
    const response = await fetch(botOrigin() + '/health', { signal: c.signal, cache: 'no-store' });
    return authResponse(res, 200, { website: 'operational', bot: response.ok ? 'reachable' : 'unreachable', cad: bridgeReady() ? 'gateway_configured' : 'gateway_not_configured', auth: loginReady() ? 'configured' : 'not_configured', updatedAt: new Date().toISOString(), note: 'Live HTTPS reachability, not historical uptime.' });
  } catch { return authResponse(res, 200, { website: 'operational', bot: 'unreachable', cad: bridgeReady() ? 'gateway_configured' : 'gateway_not_configured', auth: loginReady() ? 'configured' : 'not_configured', updatedAt: new Date().toISOString(), note: 'Bot health endpoint did not respond; this does not necessarily mean the Discord bot is offline.' }); }
  finally { clearTimeout(timer); }
}
