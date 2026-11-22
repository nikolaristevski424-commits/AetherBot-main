import { createHmac, createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';

export function botOrigin() {
  const value = process.env.AETHER_BOT_ORIGIN || '';
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username || u.password || u.port) return null;
    return u.origin;
  } catch { return null; }
}

function signingKey() {
  try {
    const key = createPrivateKey({ key: Buffer.from(process.env.AETHER_BRIDGE_PRIVATE_KEY || '', 'base64url'), format: 'der', type: 'pkcs8' });
    return key.asymmetricKeyType === 'ed25519' ? key : null;
  } catch { return null; }
}

export function bridgeReady() {
  if (!botOrigin()) return false;
  if (process.env.AETHER_BRIDGE_PRIVATE_KEY) return Boolean(signingKey());
  return (process.env.AETHER_BRIDGE_SECRET || '').length >= 32;
}

function canonical({ method, path, userId, timestamp, nonce, body }) {
  const digest = createHash('sha256').update(body || '').digest('hex');
  return [method.toUpperCase(), path, userId, timestamp, nonce, digest].join('\n');
}

export function requestSignature(request, secret = process.env.AETHER_BRIDGE_SECRET) {
  return createHmac('sha256', secret).update(canonical(request)).digest('base64url');
}

export function signBridge(method, path, userId, body = '') {
  const timestamp = String(Date.now());
  const nonce = randomBytes(20).toString('base64url');
  const request = { method, path, userId, timestamp, nonce, body };
  const key = signingKey();
  const signature = key
    ? 'v2.' + sign(null, Buffer.from('aether-site-bridge-v2\n' + canonical(request)), key).toString('base64url')
    : requestSignature(request);
  return { 'X-Aether-User': userId, 'X-Aether-Time': timestamp, 'X-Aether-Nonce': nonce, 'X-Aether-Signature': signature };
}
