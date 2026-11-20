import { session, authResponse } from '../../lib/auth.js';
export default function handler(req, res) {
  if (req.method !== 'GET') return authResponse(res, 405, { error: 'Method not allowed' });
  const user = session(req);
  return authResponse(res, 200, { authenticated: !!user, user: user ? { id: user.userId, username: user.username, avatar: user.avatar } : null });
}
