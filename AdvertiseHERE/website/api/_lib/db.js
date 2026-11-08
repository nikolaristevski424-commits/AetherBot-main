import pg from 'pg';
let pool;
export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 4000, idleTimeoutMillis: 10000 });
    pool.on('error', (error) => console.error('[database] idle client error:', error?.message));
  }
  return pool;
}
export async function withClient(fn) {
  const db = getPool();
  if (!db) { const error = new Error('Directory database is not configured'); error.status = 503; throw error; }
  const client = await db.connect();
  try { return await fn(client); } finally { client.release(); }
}
export async function transaction(fn) {
  return withClient(async client => {
    await client.query('BEGIN');
    try { const value = await fn(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
  });
}
