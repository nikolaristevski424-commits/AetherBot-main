export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  const rawOrigin = process.env.AETHER_BOT_ORIGIN;
  let url;
  try {
    const u = new URL(rawOrigin || '');
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash) {
      throw new Error('Invalid monitoring origin');
    }
    url = new URL('/api/public/overview', u.origin);
  } catch {
    return response.status(503).json({ configured: false, ready: false, reason: 'Bot monitoring host not configured' });
  }
  try {
    const res = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(4000), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Bot status endpoint not ready');
    const result = await res.json();
    if (typeof result?.ready !== 'boolean') throw new Error('Invalid bot health payload');
    const numberOrNull = (x, max) => Number.isFinite(x) && x >= 0 && x <= max ? x : null;
    return response.status(200).json({
      configured: true, ready: result.ready,
      servers: numberOrNull(result.servers, 10000000),
      commands: numberOrNull(result.commands, 100000),
      gatewayPingMs: numberOrNull(result.gatewayPingMs, 600000),
      uptimeSeconds: numberOrNull(result.uptimeSeconds, 315360000),
      checkedAt: Date.now(),
    });
  } catch {
    return response.status(503).json({ configured: true, ready: false, reason: 'Bot status endpoint unavailable' });
  }
}
