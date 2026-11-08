import {requiredSession,authorizedGuilds} from './_lib/auth.js';
import {getPool} from './_lib/db.js';
import {bumpListing} from './_lib/bump.js';
import {only,originGuard,parseBody,fail} from './_lib/http.js';
export default async function handler(req,res){if(!only(req,res,'POST')||!originGuard(req,res))return;
 try{const body=parseBody(req);const listingId=Number(body.listingId);if(!Number.isSafeInteger(listingId)||listingId<=0){const e=new Error('Invalid listing ID');e.status=400;throw e;}
  const session=await requiredSession(req);const db=getPool();const {rows}=await db.query('SELECT guild_id,owner_discord_id FROM ah_listings WHERE id=$1',[listingId]);
  if(!rows.length){const e=new Error('Listing not found');e.status=404;throw e;}
  if(rows[0].owner_discord_id!==session.discord_id){const e=new Error('Only the listing owner can bump it on the website');e.status=403;throw e;}
  const guilds=await authorizedGuilds(session.accessToken);if(!guilds.some(g=>g.id===rows[0].guild_id)){const e=new Error('You no longer manage this Discord server');e.status=403;throw e;}
  return res.json(await bumpListing({listingId,actorId:session.discord_id,source:'website'}));
 }catch(error){return fail(res,error);}}
