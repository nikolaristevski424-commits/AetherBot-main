import {getPool} from './_lib/db.js';
import {only,fail} from './_lib/http.js';
export default async function handler(req,res){if(!only(req,res,'GET'))return;const db=getPool();if(!db)return res.json({configured:false});
 try{const {rows}=await db.query(`SELECT (SELECT COUNT(*)::int FROM ah_listings WHERE status='approved') AS listings,
 (SELECT COUNT(*)::int FROM ah_bumps) AS bumps,
 (SELECT COUNT(*)::int FROM ah_listings WHERE status='approved' AND created_at > NOW()-INTERVAL '7 days') AS new_this_week,
 (SELECT COUNT(DISTINCT category)::int FROM ah_listings WHERE status='approved') AS categories`);
 return res.json({configured:true,...rows[0]});}catch(error){return fail(res,error);}}
