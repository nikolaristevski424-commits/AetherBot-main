import { loginReady, configuredOrigin, cookieNames, parseCookie, unseal, setCookie, clearCookie, seal } from '../../lib/auth.js';
export default async function handler(req, res) {
  const fail = reason => { clearCookie(res, cookieNames.STATE); res.writeHead(302, { Location: `/login/?error=${reason}`, 'Cache-Control': 'no-store' }); res.end(); };
  if (req.method !== 'GET' || !loginReady()) return fail('not-configured');
  const receivedState = String(req.query?.state || '');
  const details = unseal(parseCookie(req, cookieNames.STATE), 'oauth');
  if (!details || details.expiresAt < Date.now() || !receivedState || details.state !== receivedState || req.query?.error) return fail('state');
  const code = typeof req.query?.code === 'string' ? req.query.code : '';
  if (!code || code.length > 2048) return fail('state');
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
    let tokens, user;
    try {
      const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: process.env.AETHER_DISCORD_CLIENT_ID, client_secret: process.env.AETHER_DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: configuredOrigin() + '/api/auth/callback' }),
      });
      if (!tokenResponse.ok) return fail('discord');
      tokens = await tokenResponse.json();
      const userResponse = await fetch('https://discord.com/api/v10/users/@me', { signal: controller.signal, headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!userResponse.ok) return fail('discord');
      user = await userResponse.json();
    } finally { clearTimeout(timeout); }
    if (!/^[0-9]{17,20}$/.test(user?.id || '')) return fail('discord');
    // We never store the Discord OAuth access token in the cookie or frontend.
    const payload = { userId: user.id, username: String(user.global_name || user.username || 'Discord user').slice(0, 80), avatar: typeof user.avatar === 'string' && /^[a-zA-Z0-9_]+$/.test(user.avatar) ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : '', expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
    clearCookie(res, cookieNames.STATE);
    // Multiple Set-Cookie headers must be preserved when clearing state and writing session.
    const stateClear = res.getHeader('Set-Cookie');
    setCookie(res, cookieNames.SESSION, seal(payload, 'session'), 12 * 60 * 60);
    res.setHeader('Set-Cookie', [stateClear, res.getHeader('Set-Cookie')]);
    res.writeHead(302, { Location: details.next, 'Cache-Control': 'no-store' }); res.end();
  } catch { return fail('discord'); }
}
