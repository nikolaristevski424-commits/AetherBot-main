export const CATEGORIES = ['roleplay','design','development','community','bots','marketplace','hiring','other'];
export const snowflake = value => typeof value==='string'&&/^\d{17,20}$/.test(value);
export function parseInvite(input) {
 if(typeof input!=='string')return null;const trimmed=input.trim();
 if(/^[A-Za-z0-9-]{2,40}$/.test(trimmed))return trimmed;
 try{const u=new URL(trimmed);const path=u.pathname.split('/').filter(Boolean);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)return null;
  if(u.hostname==='discord.gg'&&path.length===1&&/^[A-Za-z0-9-]{2,40}$/.test(path[0]))return path[0];
  if(['discord.com','www.discord.com'].includes(u.hostname)&&path.length===2&&path[0]==='invite'&&/^[A-Za-z0-9-]{2,40}$/.test(path[1]))return path[1];
 }catch{}return null;
}
export function trimText(value,max,min=1){return typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max?value.trim():null;}
export function cooldownSeconds(value){if(!value)return 0;return Math.max(0,Math.ceil(7200-(Date.now()-new Date(value).getTime())/1000));}
