import { requireSameOrigin, clearCookie, SESSION_COOKIE, json } from '../_lib/security.js';
export default function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!requireSameOrigin(req)) return json(res, 403, { error: 'Origin verification failed' });
  res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE));
  return json(res, 200, { ok: true });
}
