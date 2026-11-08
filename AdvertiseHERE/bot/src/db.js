import pg from 'pg';
export const db = new pg.Pool({ connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000 });
db.on('error',error=>console.error('[database] idle client:',error.message));
export async function transaction(callback){const c=await db.connect();try{await c.query('BEGIN');const value=await callback(c);await c.query('COMMIT');return value;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
export async function bumpListing({listingId,actorId}){
 return transaction(async c=>{
  const {rows}=await c.query('SELECT id,guild_id,status,last_bumped_at FROM ah_listings WHERE id=$1 FOR UPDATE',[listingId]);
  const listing=rows[0];if(!listing)throw new Error('Listing not found');
  if(listing.status!=='approved')throw new Error('Listing must be approved before bumping');
  const remaining=Math.max(0,Math.ceil(7200-(Date.now()-new Date(listing.last_bumped_at||0).getTime())/1000));
  if(listing.last_bumped_at&&remaining>0)throw new Error(`You can bump again in ${Math.ceil(remaining/60)} minute(s).`);
  const changed=await c.query('UPDATE ah_listings SET bump_count=bump_count+1,last_bumped_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING bump_count',[listingId]);
  await c.query('INSERT INTO ah_bumps(listing_id,actor_discord_id,source) VALUES($1,$2,$3)',[listingId,actorId,'discord']);
  await c.query('INSERT INTO ah_outbox(event_type,payload) VALUES($1,$2)', ['listing_bumped',JSON.stringify({listingId,actorId})]);
  return {bumpCount:changed.rows[0].bump_count};
 });
}
export async function postHeartbeat(discord,commandCount){
 await db.query(`INSERT INTO ah_runtime_heartbeat(service,last_seen_at,guild_count,ping_ms,command_count,version)
 VALUES('discord_bot',NOW(),$1,$2,$3,'0.1.0') ON CONFLICT(service) DO UPDATE SET last_seen_at=NOW(),guild_count=EXCLUDED.guild_count,ping_ms=EXCLUDED.ping_ms,command_count=EXCLUDED.command_count,version=EXCLUDED.version`,[discord.guilds.cache.size,Math.max(0,Math.round(discord.ws.ping||0)),commandCount]);
}
