import { loginReady, authResponse } from '../lib/auth.js';
import { bridgeReady } from '../lib/bridge.js';
export default function handler(req, res) {
  if (req.method !== 'GET') return authResponse(res, 405, { error: 'Method not allowed' });
  const id = /^[0-9]{17,20}$/.test(process.env.AETHER_DISCORD_CLIENT_ID || '') ? process.env.AETHER_DISCORD_CLIENT_ID : null;
  return authResponse(res, 200, {
    brand: 'Aether', oauthConfigured: loginReady(), bridgeConfigured: bridgeReady(),
    inviteUrl: id ? `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands` : null,
    signInUrl: loginReady() ? '/api/auth/login' : null,
    cadMode: 'Website console linked to the persistent Aether bot',
  });
}
