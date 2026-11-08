import { transaction } from './db.js';
import { secondsUntilBump } from './validation.js';
export async function bumpListing({listingId,actorId,source}){
  return transaction(async db => {
    const r=await db.query('SELECT id, guild_id, name, invite_code, icon_url, status, last_bumped_at FROM ah_listings WHERE id=$1 FOR UPDATE',[listingId]);
    const listing=r.rows[0];
    if(!listing){const e=new Error('Listing not found');e.status=404;throw e;}
    if(listing.status!=='approved'){const e=new Error('Only approved listings can be bumped');e.status=403;throw e;}
    const remaining=secondsUntilBump(listing.last_bumped_at);
    if(remaining){const e=new Error(`Bump available in ${Math.ceil(remaining/60)} minute(s)`);e.status=429;e.remainingSeconds=remaining;throw e;}
    const updated=await db.query('UPDATE ah_listings SET last_bumped_at=NOW(), bump_count=bump_count+1, updated_at=NOW() WHERE id=$1 RETURNING bump_count,last_bumped_at',[listingId]);
    await db.query('INSERT INTO ah_bumps(listing_id,actor_discord_id,source) VALUES($1,$2,$3)',[listingId,actorId,source]);
    await db.query('INSERT INTO ah_outbox(event_type,payload) VALUES($1,$2)', ['listing_bumped',JSON.stringify({listingId,actorId})]);
    return {listingId, bumpCount:updated.rows[0].bump_count,lastBumpedAt:updated.rows[0].last_bumped_at,remainingSeconds:0};
  });
}
