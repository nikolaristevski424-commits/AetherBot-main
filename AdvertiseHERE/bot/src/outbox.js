import {EmbedBuilder} from 'discord.js';
import {db} from './db.js';
let running=false;
const invite=code=>`https://discord.gg/${code}`;
async function sendTo(client,channelId,embed){
 if(!/^\d{17,20}$/.test(channelId||''))return false;
 const channel=await client.channels.fetch(channelId).catch(()=>null);
 if(!channel?.isTextBased?.()||typeof channel.send!=='function')throw new Error('Configured channel not found or not text-based');
 await channel.send({embeds:[embed],allowedMentions:{parse:[]}});return true;
}
export async function processOutbox(client){
 if(running)return;running=true;
 try {
  const {rows}=await db.query(`UPDATE ah_outbox SET locked_until=NOW()+INTERVAL '90 seconds', attempts=attempts+1
   WHERE id IN (SELECT id FROM ah_outbox WHERE processed_at IS NULL AND (locked_until IS NULL OR locked_until<NOW()) AND attempts<12 ORDER BY id LIMIT 5 FOR UPDATE SKIP LOCKED)
   RETURNING id,event_type,payload`);
  for(const event of rows){
   try{
    const id=Number(event.payload?.listingId);
    const details=await db.query('SELECT id,name,summary,category,invite_code,status,bump_count,icon_url FROM ah_listings WHERE id=$1',[id]);
    const l=details.rows[0];
    if(!l){await db.query('UPDATE ah_outbox SET processed_at=NOW(),locked_until=NULL WHERE id=$1',[event.id]);continue;}
    if(event.event_type==='listing_submitted'){
     const e=new EmbedBuilder().setTitle('New listing for review').setColor(0xffa349).setDescription(`**${l.name}** · ID ${l.id}\nCategory: ${l.category}\nStatus: ${l.status}\n\nUse \`/review approve id:${l.id}\` or \`/review reject\`.`).setTimestamp();
     await sendTo(client,process.env.AH_REVIEW_CHANNEL_ID,e);
    }else if((event.event_type==='listing_bumped'||event.event_type==='listing_approved')&&l.status==='approved'){
     const e=new EmbedBuilder().setTitle(event.event_type==='listing_bumped'?'🚀 Freshly bumped on AdvertiseHERE':'✨ Newly approved on AdvertiseHERE').setColor(0x00bcff)
      .setDescription(`**${l.name.replaceAll('@','＠')}**\n${l.summary.replaceAll('@','＠')}\n\n[Join this server](${invite(l.invite_code)}) · [See directory](${process.env.SITE_URL||'https://advertisehere.vercel.app'})`)
      .addFields({name:'Category',value:l.category,inline:true},{name:'Bumps',value:String(l.bump_count),inline:true}).setTimestamp();
     if(l.icon_url?.startsWith('https://'))e.setThumbnail(l.icon_url);
     await sendTo(client,process.env.AH_BUMP_CHANNEL_ID,e);
    }
    await db.query('UPDATE ah_outbox SET processed_at=NOW(),locked_until=NULL,last_error=NULL WHERE id=$1',[event.id]);
   }catch(err){
    console.warn(`[outbox] event ${event.id} failed:`,err.message);
    await db.query("UPDATE ah_outbox SET last_error=$2,locked_until=NOW()+INTERVAL '3 minutes' WHERE id=$1",[event.id,String(err.message).slice(0,250)]).catch(()=>{});
   }
  }
 }catch(err){console.warn('[outbox] worker error',err.message);}finally{running=false;}
}
