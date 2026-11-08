import 'dotenv/config';
import {Client,GatewayIntentBits,Events,MessageFlags} from 'discord.js';
import {db,postHeartbeat} from './db.js';
import {commands} from './commands.js';
import {handleCommand} from './handlers.js';
import {processOutbox} from './outbox.js';
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DATABASE_URL','AH_HOME_GUILD_ID','SITE_URL']){if(!process.env[key])throw new Error(`Missing required setting ${key}`);}
const client=new Client({intents:[GatewayIntentBits.Guilds]});
let heartbeatTimer,queueTimer,shuttingDown=false;
client.once(Events.ClientReady,async()=>{
 console.log(`AdvertiseHERE online as ${client.user.tag}. ${client.guilds.cache.size} guild(s).`);
 const heartbeat=async()=>{try{await postHeartbeat(client,commands.length);}catch(e){console.warn('[heartbeat]',e.message);}};
 await heartbeat();heartbeatTimer=setInterval(heartbeat,30_000);
 queueTimer=setInterval(()=>processOutbox(client),12_000);
 processOutbox(client);
});
client.on(Events.InteractionCreate,async i=>{
 if(!i.isChatInputCommand())return;
 try{await handleCommand(i);}catch(error){
  console.error(`[command] ${i.commandName}`,error.message);
  const msg=error.message&&/^(Listing|No |You |Only |Bump |Your |Another |This |The )/.test(error.message)?error.message:'Something went wrong. Please try again or contact staff.';
  try{if(i.replied||i.deferred)await i.followUp({content:msg,flags:MessageFlags.Ephemeral});else await i.reply({content:msg,flags:MessageFlags.Ephemeral});}catch{}
 }
});
async function shutdown(signal){if(shuttingDown)return;shuttingDown=true;console.log('Shutting down:',signal);clearInterval(heartbeatTimer);clearInterval(queueTimer);client.destroy();await db.end().catch(()=>{});process.exit(0);}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('unhandledRejection',err=>console.error('[unhandledRejection]',err));
await db.query('SELECT 1');
await client.login(process.env.DISCORD_TOKEN);
