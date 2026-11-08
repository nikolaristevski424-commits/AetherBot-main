import {getPool,withClient,transaction} from './_lib/db.js';
import {validateListing,CATEGORIES} from './_lib/validation.js';
import {requiredSession,authorizedGuilds} from './_lib/auth.js';
import {setSecurity,originGuard,parseBody,fail} from './_lib/http.js';
export default async function handler(req,res){setSecurity(res);
 if(req.method==='GET'){
  const db=getPool();if(!db)return res.status(200).json({configured:false,listings:[],total:0});
  const category=typeof req.query?.category==='string'&&CATEGORIES.includes(req.query.category)?req.query.category:null;
  const q=typeof req.query?.q==='string'?req.query.q.slice(0,70).trim():'';
  const sort=req.query?.sort==='newest'?'newest':req.query?.sort==='top'?'top':'bumped';
  const limit=24;const page=Math.min(100,Math.max(1,parseInt(req.query?.page||'1',10)||1));
  try{const params=[];let where="WHERE status='approved'";
   if(category){params.push(category);where+=` AND category=$${params.length}`;}
   if(q){params.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');where+=` AND (name ILIKE $${params.length} ESCAPE '\\' OR summary ILIKE $${params.length} ESCAPE '\\')`;}
   const order=sort==='newest'?'created_at DESC':sort==='top'?'bump_count DESC, last_bumped_at DESC NULLS LAST':'last_bumped_at DESC NULLS LAST, created_at DESC';
   const count=await db.query(`SELECT COUNT(*)::integer AS count FROM ah_listings ${where}`,params);
   const rows=await db.query(`SELECT id,guild_id,name,summary,description,category,invite_code,icon_url,banner_url,featured_until,last_bumped_at,bump_count,created_at FROM ah_listings ${where} ORDER BY (featured_until > NOW()) DESC, ${order} LIMIT ${limit} OFFSET $${params.length+1}`,[...params,(page-1)*limit]);
   return res.json({configured:true,total:count.rows[0].count,listings:rows.rows,page,perPage:limit});
  }catch(error){return fail(res,error);}
 }
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(!originGuard(req,res))return;
 try{
  const data=validateListing(parseBody(req));if(!data){const e=new Error('Please provide valid listing details, invite, and category');e.status=400;throw e;}
  const session=await requiredSession(req);
  const guilds=await authorizedGuilds(session.accessToken);
  if(!guilds.some(g=>g.id===data.guildId)){const e=new Error('Manage Server permission is required for this server');e.status=403;throw e;}
  const result=await transaction(async db=>{
   const recent=await db.query("SELECT COUNT(*)::int AS count FROM ah_audit WHERE actor_discord_id=$1 AND action IN ('listing.submitted','listing.updated') AND created_at>NOW()-INTERVAL '1 hour'",[session.discord_id]);
   if(recent.rows[0].count>=6){const e=new Error('You have reached the submission limit (6 per hour)');e.status=429;throw e;}
   const existing=await db.query('SELECT id,owner_discord_id FROM ah_listings WHERE guild_id=$1 FOR UPDATE',[data.guildId]);
   if(existing.rows.length&&existing.rows[0].owner_discord_id!==session.discord_id){const e=new Error('Another account owns this listing. Contact staff.');e.status=403;throw e;}
   const r=await db.query(`INSERT INTO ah_listings(guild_id,owner_discord_id,name,summary,description,category,invite_code,icon_url,banner_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT(guild_id) DO UPDATE SET name=EXCLUDED.name, summary=EXCLUDED.summary, description=EXCLUDED.description, category=EXCLUDED.category, invite_code=EXCLUDED.invite_code, icon_url=EXCLUDED.icon_url, banner_url=EXCLUDED.banner_url, status='pending', rejected_reason=NULL, updated_at=NOW()
    RETURNING id,status`,[data.guildId,session.discord_id,data.name,data.summary,data.description,data.category,data.invite,data.icon,data.banner]);
   await db.query('INSERT INTO ah_audit(actor_discord_id,action,listing_id) VALUES($1,$2,$3)',[session.discord_id,existing.rows.length?'listing.updated':'listing.submitted',r.rows[0].id]);
   await db.query('INSERT INTO ah_outbox(event_type,payload) VALUES($1,$2)',['listing_submitted',JSON.stringify({listingId:r.rows[0].id})]);
   return r.rows[0];
  });
  return res.status(201).json({listingId:result.id,status:result.status});
 }catch(error){return fail(res,error);}
}
