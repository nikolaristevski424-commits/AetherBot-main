import { json } from './_lib/security.js';
export default function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const id = process.env.AH_DISCORD_CLIENT_ID || '';
  const inviteUrl = /^\d{17,20}$/.test(id)
    ? `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands`
    : null;
  return json(res, 200, { inviteUrl });
}
