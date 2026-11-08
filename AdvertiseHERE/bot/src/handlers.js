import {MessageFlags,PermissionFlagsBits,EmbedBuilder} from 'discord.js';
import {db,bumpListing,transaction} from './db.js';
import {parseInvite,trimText,cooldownSeconds,snowflake} from './validation.js';
const home=()=>process.env.AH_HOME_GUILD_ID;
const site=()=>process.env.SITE_URL||'https://advertisehere.vercel.app';
const safe=(v)=>String(v||'').replaceAll('@','＠').replaceAll('`','\u02cb').slice(0,400);
const reply=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
const canManage=(i)=>i.inGuild()&&i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
const staff=(i)=>i.inGuild()&&i.guildId===home()&&(
 process.env.AH_OWNER_IDS?.split(',').map(s=>s.trim()).includes(i.user.id)
 ||i.memberPermissions?.has(PermissionFlagsBits.Administrator)
 ||(snowflake(process.env.AH_STAFF_ROLE_ID)&&i.member?.roles?.cache?.has(process.env.AH_STAFF_ROLE_ID))
);
export async function handleCommand(i){
 const name=i.commandName;
 if(name==='directory')return reply(i,`🌐 Explore communities: ${site()}`);
 if(name==='listing')return listingCommand(i);
 if(name==='bump')return bumpCommand(i);
 if(name==='review')return reviewCommand(i);
 if(name==='leaderboard'){
  const {rows}=await db.query("SELECT id,name,bump_count FROM ah_listings WHERE status='approved' ORDER BY bump_count DESC, created_at ASC LIMIT 10");
  const body=rows.length?rows.map((r,n)=>`${n+1}. **${safe(r.name)}** · ${r.bump_count} bumps · ID ${r.id}`).join('\n'):'No approved listings yet.';
  return i.reply({embeds:[new EmbedBuilder().setTitle('🏆 AdvertiseHERE leaderboard').setDescription(body).setColor(0x22c0ff)],allowedMentions:{parse:[]}});
 }
 if(name==='stats'){
  const {rows}=await db.query("SELECT (SELECT COUNT(*)::int FROM ah_listings WHERE status='approved') listings,(SELECT COUNT(*)::int FROM ah_listings WHERE status='pending') pending,(SELECT COUNT(*)::int FROM ah_bumps) bumps");
  return reply(i,`📈 **AdvertiseHERE Stats**\nPublished: **${rows[0].listings}** | Pending: **${rows[0].pending}** | Bumps: **${rows[0].bumps}**`);
 }
}
async function listingCommand(i){
 const sub=i.options.getSubcommand();
 if(!canManage(i))return reply(i,'You need **Manage Server** permission to manage a listing. Use the website to list other servers you manage.');
 if(sub==='status'){
  const {rows}=await db.query('SELECT id,name,status,rejected_reason,bump_count,last_bumped_at FROM ah_listings WHERE guild_id=$1',[i.guildId]);
  const r=rows[0];return reply(i,r?`**${safe(r.name)}** · ID ${r.id}\nStatus: **${r.status}**\nBumps: ${r.bump_count}\n${r.rejected_reason?'Reason: '+safe(r.rejected_reason):''}`:'This server has not been submitted yet. Use `/listing submit`.');
 }
 if(sub==='remove'){
  const {rowCount}=await db.query("UPDATE ah_listings SET status='suspended',updated_at=NOW() WHERE guild_id=$1",[i.guildId]);
  return reply(i,rowCount?'Your listing is now hidden.':'No listing found for this server.');
 }
 const data={name:trimText(i.options.getString('name'),90,3),summary:trimText(i.options.getString('summary'),220,10),description:trimText(i.options.getString('description'),1600,20),category:i.options.getString('category'),invite:parseInvite(i.options.getString('invite'))};
 if(Object.values(data).some(x=>!x))return reply(i,'Invalid details or invite. Only Discord invite links are accepted.');
 const id=await transaction(async c=>{
  const prev=await c.query('SELECT id,owner_discord_id FROM ah_listings WHERE guild_id=$1 FOR UPDATE',[i.guildId]);
  if(prev.rows.length&&prev.rows[0].owner_discord_id!==i.user.id)throw new Error('Another account owns this listing. Contact staff to transfer ownership.');
  const {rows}=await c.query(`INSERT INTO ah_listings(guild_id,owner_discord_id,name,summary,description,category,invite_code)
   VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(guild_id) DO UPDATE SET name=EXCLUDED.name,summary=EXCLUDED.summary,description=EXCLUDED.description,category=EXCLUDED.category,invite_code=EXCLUDED.invite_code,status='pending',rejected_reason=NULL,updated_at=NOW() RETURNING id`,[i.guildId,i.user.id,data.name,data.summary,data.description,data.category,data.invite]);
  await c.query('INSERT INTO ah_outbox(event_type,payload) VALUES($1,$2)',['listing_submitted',JSON.stringify({listingId:rows[0].id})]);
  await c.query('INSERT INTO ah_audit(actor_discord_id,action,listing_id) VALUES($1,$2,$3)',[i.user.id,'listing.submitted',rows[0].id]);
  return rows[0].id;
 });
 return reply(i,`✅ Listing **#${id}** submitted! Staff will review it before it appears on the website.\n${site()}`);
}
async function bumpCommand(i){
 const id=i.options.getInteger('listing_id');
 let listing;
 if(id){
  const {rows}=await db.query('SELECT id,owner_discord_id FROM ah_listings WHERE id=$1',[id]); listing=rows[0];
  if(!listing)return reply(i,'Listing not found.');
  if(listing.owner_discord_id!==i.user.id)return reply(i,'Only the listing owner may bump by listing ID.');
 }else{
  if(!canManage(i))return reply(i,'Use `/bump listing_id:<your ID>` as the listing owner, or run `/bump` in your own Discord server with Manage Server.');
  const {rows}=await db.query('SELECT id FROM ah_listings WHERE guild_id=$1',[i.guildId]);listing=rows[0];
  if(!listing)return reply(i,'No listing found for this server. Submit it first.');
 }
 const result=await bumpListing({listingId:listing.id,actorId:i.user.id});
 return reply(i,`🚀 **Bump successful!** Your listing is now refreshed. Total bumps: **${result.bumpCount}**.\nNext bump in **2 hours**.\n${site()}#discover`);
}
async function reviewCommand(i){
 if(!staff(i))return reply(i,'Staff moderation is only available in the AdvertiseHERE hub to authorized moderators.');
 const sub=i.options.getSubcommand(),id=i.options.getInteger('id'),reason=sub==='reject'?i.options.getString('reason'):null;
 const result=await transaction(async c=>{
  const {rows}=await c.query('SELECT id,status,name FROM ah_listings WHERE id=$1 FOR UPDATE',[id]);
  if(!rows[0])throw new Error('Listing not found.');
  if(rows[0].status!=='pending')throw new Error(`Listing is ${rows[0].status}, not pending.`);
  const next=sub==='approve'?'approved':'rejected';
  await c.query('UPDATE ah_listings SET status=$1,rejected_reason=$2,updated_at=NOW() WHERE id=$3',[next,reason,id]);
  await c.query('INSERT INTO ah_audit(actor_discord_id,action,listing_id,metadata) VALUES($1,$2,$3,$4)',[i.user.id,`review.${next}`,id,JSON.stringify({reason:reason||null})]);
  if(next==='approved')await c.query('INSERT INTO ah_outbox(event_type,payload) VALUES($1,$2)',['listing_approved',JSON.stringify({listingId:id})]);
  return next;
 });
 return reply(i,`✅ Listing **#${id}** ${result}. ${reason?`Reason: ${safe(reason)}`:''}`);
}
