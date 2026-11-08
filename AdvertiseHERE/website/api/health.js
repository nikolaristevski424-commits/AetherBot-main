import {getPool} from './_lib/db.js';
import {only} from './_lib/http.js';
export default async function handler(req,res){if(!only(req,res,'GET'))return;
 const db=getPool();if(!db)return res.status(200).json({website:'operational',database:'not_configured',bot:'not_connected'});
 try {await db.query('SELECT 1');const {rows}=await db.query("SELECT last_seen_at,guild_count,ping_ms,command_count,version FROM ah_runtime_heartbeat WHERE service='discord_bot'");
  const bot=rows[0];const fresh=bot&&(Date.now()-new Date(bot.last_seen_at).getTime()<=120000);
  return res.json({website:'operational',database:'connected',bot:fresh?'online':'unreachable',lastSeenAt:bot?.last_seen_at||null,discordGuilds:fresh?bot.guild_count:null,gatewayPingMs:fresh?bot.ping_ms:null,commands:fresh?bot.command_count:null,version:fresh?bot.version:null});
 }catch {return res.status(503).json({website:'operational',database:'unreachable',bot:'unknown'});}}
