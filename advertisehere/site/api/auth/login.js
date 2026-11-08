import { configuredAuth, createState, json } from '../_lib/security.js';
export default function handler(request, response) {
  if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed' });
  if (!configuredAuth()) return response.redirect(302, '/dashboard/?error=auth-not-configured');
  const { state, cookie } = createState();
  const redirectUri = `${process.env.AH_PUBLIC_ORIGIN}/api/auth/callback`;
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', process.env.AH_DISCORD_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'none');
  response.setHeader('Set-Cookie', cookie);
  response.setHeader('Cache-Control', 'no-store');
  return response.redirect(302, url.toString());
}
