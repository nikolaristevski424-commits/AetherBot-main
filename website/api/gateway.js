import { session, authResponse, ensureOrigin } from '../lib/auth.js';
import { siteContent } from '../lib/site-content.js';
import { maintenanceFor } from '../lib/publishing.js';
import { bridgeReady, botOrigin, signBridge } from '../lib/bridge.js';
const METHODS = new Set(['GET','POST','PATCH']);
const ROUTES = /^(?:site\/(?:access|team)|owner\/(?:site|guilds(?:\/\d{17,20}\/(?:invite|leave))?)|guilds|guilds\/\d{17,20}(?:\/(?:overview|setup|automod|remote|cad|mdt|staff|staff\/cases|staff\/members|staff\/moderate|cad\/calls|cad\/calls\/[0-9a-f-]{36}|cad\/units|cad\/config|erlc\/players|erlc\/moderate|mdt\/records|mdt\/bolos|mdt\/bolos\/[0-9a-f-]{36}\/clear))?)$/;
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const who = session(req);
  if (!who) return authResponse(res, 401, { error: 'Sign in with Discord first.' });
  if (!METHODS.has(req.method)) return authResponse(res, 405, { error: 'Method not allowed' });
  if (req.method !== 'GET' && !ensureOrigin(req)) return authResponse(res, 403, { error: 'Request origin not allowed' });
  if (!bridgeReady()) return authResponse(res, 503, { error: 'The live Aether bot connection is not configured yet.', configured: false });
  const route = typeof req.query?.route === 'string' ? req.query.route : '';
  if (!ROUTES.test(route)) return authResponse(res, 404, { error: 'Unknown console API route.' });
  const page = /^guilds\/\d{17,20}\/(overview|setup|automod|remote)$/.test(route) ? 'dashboard' : /^guilds\/\d{17,20}\/staff(?:\/|$)/.test(route) ? 'staff' : null;
  if (page && maintenanceFor(await siteContent(), page)) return authResponse(res, 503, { error: 'This Aether page is under maintenance.' });
  const url = new URL(`/api/site-bridge/${route}`, botOrigin());
  if (req.method === 'GET' && typeof req.query?.q === 'string') url.searchParams.set('q', req.query.q.slice(0, 100));
  const path = url.pathname + url.search;
  const body = req.method === 'GET' ? '' : JSON.stringify(req.body || {});
  if (Buffer.byteLength(body, 'utf8') > 32 * 1024) return authResponse(res, 413, { error: 'Request body too large' });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8500);
  try {
    const response = await fetch(url.href, { method: req.method, signal: controller.signal, headers: {
      ...signBridge(req.method, path, who.userId, body), ...(body ? { 'Content-Type': 'application/json' } : {}), Accept: 'application/json',
    }, body: body || undefined, redirect: 'manual' });
    const text = await response.text();
    if (text.length > 1_200_000) return authResponse(res, 502, { error: 'Bot returned too much data.' });
    if (response.status >= 300 && response.status < 400) return authResponse(res, 502, { error: 'Bot gateway rejected unexpected redirect.' });
    let parsed; try { parsed = JSON.parse(text); } catch { return authResponse(res, 502, { error: 'Bot returned invalid JSON.' }); }
    return authResponse(res, response.status, parsed);
  } catch { return authResponse(res, 502, { error: 'Could not reach the bot securely. Check Wispbyte HTTPS and bridge configuration.' }); }
  finally { clearTimeout(timeout); }
}
