import { loginReady, configuredOrigin, cookieNames, seal, setCookie, newNonce, authResponse } from '../../lib/auth.js';
export default function handler(req, res) {
  if (req.method !== 'GET') return authResponse(res, 405, { error: 'Method not allowed' });
  if (!loginReady()) return res.writeHead(302, { Location: '/login/?error=not-configured', 'Cache-Control': 'no-store' }).end();
  const state = newNonce();
  const next = ['/dashboard/', '/cad/', '/staff/'].includes(req.query?.next) ? req.query.next : '/dashboard/';
  setCookie(res, cookieNames.STATE, seal({ state, next, expiresAt: Date.now() + 600000 }, 'oauth'), 600);
  const query = new URLSearchParams({ client_id: process.env.AETHER_DISCORD_CLIENT_ID, redirect_uri: configuredOrigin() + '/api/auth/callback', response_type: 'code', scope: 'identify', state });
  res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${query.toString()}`, 'Cache-Control': 'no-store' }); res.end();
}
