import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION = '__Host-aether_session';
const STATE = '__Host-aether_oauth';
const SECURE = 'Path=/; Secure; HttpOnly; SameSite=Lax';
const MIN_SECRET_LENGTH = 32;
export const cookieNames = { SESSION, STATE };

export function configuredOrigin() {
  const raw = process.env.AETHER_SITE_ORIGIN || '';
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && url.origin === url.href.replace(/\/$/, '') && !url.username && !url.password) return url.origin;
  } catch { /* intentional */ }
  return null;
}
export function secretReady() {
  return typeof process.env.AETHER_SESSION_SECRET === 'string' && process.env.AETHER_SESSION_SECRET.length >= MIN_SECRET_LENGTH;
}
export function loginReady() {
  return !!(configuredOrigin() && secretReady() && /^[0-9]{17,20}$/.test(process.env.AETHER_DISCORD_CLIENT_ID || '')
    && (process.env.AETHER_DISCORD_CLIENT_SECRET || '').length > 10);
}
export function sessionKey() {
  if (!secretReady()) throw new Error('Aether session encryption is not configured');
  return createHash('sha256').update('aether-hq-session-v1\0' + process.env.AETHER_SESSION_SECRET).digest();
}
function b64(data) { return Buffer.from(data).toString('base64url'); }
export function seal(data, purpose = 'session') {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sessionKey(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const payload = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return [b64(iv), b64(payload), b64(cipher.getAuthTag())].join('.');
}
export function unseal(value, purpose = 'session') {
  if (typeof value !== 'string' || value.length > 4096) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, payload, tag] = parts.map(x => Buffer.from(x, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', sessionKey(), iv);
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(tag);
    const data = JSON.parse(Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch { return null; }
}
export function parseCookie(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const item of raw.split(';')) {
    const at = item.indexOf('=');
    if (at > 0 && item.slice(0, at).trim() === name) return item.slice(at + 1).trim();
  }
  return null;
}
export function setCookie(res, name, value, ttlSeconds) {
  res.setHeader('Set-Cookie', `${name}=${value}; ${SECURE}; Max-Age=${ttlSeconds}`);
}
export function clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; ${SECURE}; Max-Age=0`);
}
export function session(req) {
  if (!secretReady()) return null;
  const data = unseal(parseCookie(req, SESSION), 'session');
  if (!data || !/^[0-9]{17,20}$/.test(data.userId || '') || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now()) return null;
  return { userId: data.userId, username: String(data.username || 'Discord user').slice(0, 80), avatar: String(data.avatar || '').slice(0, 200), expiresAt: data.expiresAt };
}
export function authResponse(res, status, data) { res.statusCode = status; res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); }
export function ensureOrigin(req) {
  const expected = configuredOrigin();
  return !!expected && req.headers.origin === expected;
}
export function newNonce() { return randomBytes(24).toString('base64url'); }
