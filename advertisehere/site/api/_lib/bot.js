import { createHmac, randomBytes } from 'node:crypto';

export class BackendUnavailable extends Error { constructor(message) { super(message); this.name = 'BackendUnavailable'; } }
export async function botRequest(path, { method = 'GET', body = undefined } = {}) {
  const apiBase = process.env.AH_BOT_API_ORIGIN;
  const secret = process.env.AH_SHARED_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) throw new BackendUnavailable('Discord bot connection is not configured');
  let origin;
  try {
    const parsed = new URL(apiBase || '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.port) throw new Error('invalid');
    origin = parsed.origin;
  } catch { throw new BackendUnavailable('Bot HTTPS endpoint is not configured'); }
  if (!/^\/internal\/[a-z\d\-/]+$/i.test(path)) throw new BackendUnavailable('Invalid internal route');
  const rawBody = body === undefined ? '' : JSON.stringify(body);
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString('hex');
  const signed = [timestamp, nonce, method, path, rawBody].join('\n');
  const signature = createHmac('sha256', secret).update(signed).digest('hex');
  try {
    const response = await fetch(`${origin}${path}`, {
      method,
      redirect: 'error',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-AH-Timestamp': timestamp, 'X-AH-Nonce': nonce, 'X-AH-Signature': signature },
      body: body === undefined ? undefined : rawBody,
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  } catch { throw new BackendUnavailable('The Discord bot API is unreachable'); }
}
