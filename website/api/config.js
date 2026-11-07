export default function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  const id = String(process.env.AETHER_DISCORD_CLIENT_ID || '1528192052393808022');
  const inviteUrl = /^\d{17,20}$/.test(id)
    ? `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands` : null;
  let cadUrl = null;
  try {
    const url = new URL(process.env.AETHER_CAD_URL || '');
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) {
      cadUrl = new URL('/cad/', url.origin).toString();
    }
  } catch { /* CAD not linked yet. */ }
  response.setHeader('Cache-Control', 'no-store');
  return response.status(200).json({ inviteUrl, cadUrl });
}
