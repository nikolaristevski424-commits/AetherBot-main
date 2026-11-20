import { createHmac, createHash, randomBytes } from 'node:crypto';
export function botOrigin() {
  const value = process.env.AETHER_BOT_ORIGIN || '';
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username || u.password || u.port) return null;
    // A fixed env-var origin, never a client-provided host.
    return u.origin;
  } catch { return null; }
}
export function bridgeReady() {
  return !!botOrigin() && (process.env.AETHER_BRIDGE_SECRET || '').length >= 32;
}
export function requestSignature({ method, path, userId, timestamp, nonce, body }, secret = process.env.AETHER_BRIDGE_SECRET) {
  const digest = createHash('sha256').update(body || '').digest('hex');
  const string = [method.toUpperCase(), path, userId, timestamp, nonce, digest].join('\n');
  return createHmac('sha256', secret).update(string).digest('base64url');
}
export function signBridge(method, path, userId, body = '') {
  const timestamp = String(Date.now());
  const nonce = randomBytes(20).toString('base64url');
  return { 'X-Aether-User': userId, 'X-Aether-Time': timestamp, 'X-Aether-Nonce': nonce, 'X-Aether-Signature': requestSignature({ method, path, userId, timestamp, nonce, body }) };
}
