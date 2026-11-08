import {requiredSession} from './_lib/auth.js';
import {getPool} from './_lib/db.js';
import {only,fail} from './_lib/http.js';
export default async function handler(req,res){if(!only(req,res,'GET'))return;
 try{const session=await requiredSession(req);const db=getPool();const {rows}=await db.query('SELECT id,guild_id,name,summary,category,invite_code,status,rejected_reason,bump_count,last_bumped_at,updated_at FROM ah_listings WHERE owner_discord_id=$1 ORDER BY updated_at DESC LIMIT 100',[session.discord_id]);return res.json({listings:rows});}catch(e){return fail(res,e);}}
