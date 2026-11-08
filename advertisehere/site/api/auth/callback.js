import { configuredAuth, validateState, createSession, clearCookie, STATE_COOKIE } from '../_lib/security.js';
export default async function handler(request, response) {
  if (request.method !== 'GET' || !configuredAuth()) return response.redirect(302, '/dashboard/?error=auth-not-configured');
  const code = typeof request.query?.code === 'string' ? request.query.code : '';
  const state = typeof request.query?.state === 'string' ? request.query.state : '';
  if (!code || !state || !validateState(request, state)) return response.redirect(302, '/dashboard/?error=oauth-state');
  try {
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.AH_DISCORD_CLIENT_ID, client_secret: process.env.AH_DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: `${process.env.AH_PUBLIC_ORIGIN}/api/auth/callback` }),
      signal: AbortSignal.timeout(7000),
    });
    if (!tokenResponse.ok) throw new Error('token');
    const token = await tokenResponse.json();
    const profileResponse = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(7000) });
    if (!profileResponse.ok) throw new Error('profile');
    const profile = await profileResponse.json();
    if (!/^\d{17,20}$/.test(String(profile.id))) throw new Error('identity');
    response.setHeader('Set-Cookie', [createSession(profile), clearCookie(STATE_COOKIE, '/api/auth')]);
    response.setHeader('Cache-Control', 'no-store');
    return response.redirect(302, '/dashboard/');
  } catch { return response.redirect(302, '/dashboard/?error=discord-login'); }
}
