import { clearCookie, cookieNames, authResponse, ensureOrigin } from '../../lib/auth.js';
export default function handler(req, res) {
  if (req.method !== 'POST') return authResponse(res, 405, { error: 'Method not allowed' });
  if (!ensureOrigin(req)) return authResponse(res, 403, { error: 'Request origin not allowed' });
  clearCookie(res, cookieNames.SESSION);
  return authResponse(res, 200, { signedOut: true });
}
