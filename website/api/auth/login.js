import { loginReady, configuredOrigin, cookieNames, seal, setCookie, newNonce, authResponse, loginDestinations } from '../../lib/auth.js';
export default function handler(req, res) {
  if (req.method !== 'GET') return authResponse(res, 405, { error: 'Method not allowed' });
  if (!loginReady()) return res.writeHead(302, { Location: '/login/?error=not-configured', 'Cache-Control': 'no-store' }).end();
  const next = loginDestinations.includes(req.query?.next) ? req.query.next : '/dashboard/';
  // OAuth state is scoped to a hostname. Always initiate the flow on the
  // canonical production host, even when someone opens a Vercel alias.
  const origin = configuredOrigin();
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim().toLowerCase();
  if (host && host !== new URL(origin).host.toLowerCase()) {
    const canonical = new URL('/api/auth/login', origin);
    canonical.searchParams.set('next', next);
    res.writeHead(302, { Location: canonical.toString(), 'Cache-Control': 'no-store' }); return res.end();
  }
  const state = newNonce();
  setCookie(res, cookieNames.STATE, seal({ state, next, expiresAt: Date.now() + 600000 }, 'oauth'), 600);
  const query = new URLSearchParams({ client_id: process.env.AETHER_DISCORD_CLIENT_ID, redirect_uri: configuredOrigin() + '/api/auth/callback', response_type: 'code', scope: 'identify', state });
  res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${query.toString()}`, 'Cache-Control': 'no-store' }); res.end();
}
