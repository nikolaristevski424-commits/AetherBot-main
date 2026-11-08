import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'ah_session';
export const STATE_COOKIE = 'ah_oauth_state';
const SESSION_SECONDS = 24 * 60 * 60;

function b64(value) { return Buffer.from(value).toString('base64url'); }
function sign(payload, secret) {
  const content = b64(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(content).digest('base64url');
  return `${content}.${signature}`;
}
function verify(token, secret) {
  if (!token || !secret || secret.length < 32 || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], 'base64url'); } catch { return null; }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const obj = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return Number.isSafeInteger(obj.exp) && obj.exp > Date.now() ? obj : null;
  } catch { return null; }
}
export function cookies(request) {
  const source = String(request.headers.cookie || '');
  const output = {};
  for (const part of source.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const key = part.slice(0, i).trim();
    try { output[key] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignored */ }
  }
  return output;
}
export function cookie(name, value, seconds, path = '/') {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
export function clearCookie(name, path = '/') { return cookie(name, '', 0, path); }
export function sessionUser(request) {
  const payload = verify(cookies(request)[SESSION_COOKIE], process.env.AH_COOKIE_SECRET);
  return payload?.kind === 'session' && /^\d{17,20}$/.test(payload.id) ? { id: payload.id, username: payload.username, avatar: payload.avatar } : null;
}
export function createSession(user) {
  return cookie(SESSION_COOKIE, sign({ kind: 'session', id: String(user.id), username: String(user.global_name || user.username || 'Member').slice(0, 64), avatar: user.avatar || null, exp: Date.now() + SESSION_SECONDS * 1000 }, process.env.AH_COOKIE_SECRET), SESSION_SECONDS);
}
export function createState() {
  const state = randomBytes(32).toString('base64url');
  return { state, cookie: cookie(STATE_COOKIE, sign({ kind: 'oauth-state', state, exp: Date.now() + 10 * 60 * 1000 }, process.env.AH_COOKIE_SECRET), 600, '/api/auth') };
}
export function validateState(request, state) {
  const parsed = verify(cookies(request)[STATE_COOKIE], process.env.AH_COOKIE_SECRET);
  return Boolean(parsed?.kind === 'oauth-state' && parsed.state === state);
}
export function configuredAuth() {
  return /^\d{17,20}$/.test(process.env.AH_DISCORD_CLIENT_ID || '')
    && Boolean(process.env.AH_DISCORD_CLIENT_SECRET)
    && Boolean(process.env.AH_COOKIE_SECRET?.length >= 32)
    && /^https:\/\/[a-zA-Z0-9.-]+$/.test(process.env.AH_PUBLIC_ORIGIN || '');
}
export function requireSameOrigin(request) {
  const origin = String(request.headers.origin || '');
  return request.method === 'GET' || (origin && origin === process.env.AH_PUBLIC_ORIGIN);
}
export function json(response, code, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(code).json(body);
}
