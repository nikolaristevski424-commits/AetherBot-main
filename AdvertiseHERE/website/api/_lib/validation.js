export const CATEGORIES = ['roleplay','design','development','community','bots','marketplace','hiring','other'];
export const BUMP_COOLDOWN_SECONDS = 7200;
export const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
export function parseInvite(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9-]{2,40}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase();
    const paths = url.pathname.split('/').filter(Boolean);
    if (host === 'discord.gg' && paths.length === 1 && /^[a-zA-Z0-9-]{2,40}$/.test(paths[0])) return paths[0];
    if ((host === 'discord.com' || host === 'www.discord.com') && paths.length === 2 && paths[0] === 'invite' && /^[a-zA-Z0-9-]{2,40}$/.test(paths[1])) return paths[1];
  } catch {}
  return null;
}
export function normalString(value,max,min=1){return typeof value === 'string' && value.trim().length>=min && value.trim().length<=max ? value.trim() : null;}
export function imageUrl(input){
  if (input === undefined || input === null || input === '') return null;
  if (typeof input !== 'string' || input.length > 500) return null;
  try {const u=new URL(input); return u.protocol==='https:'&&!u.username&&!u.password&&!u.port ? u.toString():null;} catch {return null;}
}
export function validateListing(body){
  const guildId=body?.guildId, name=normalString(body?.name,90,3), summary=normalString(body?.summary,220,10), description=normalString(body?.description,1600,20);
  const category=body?.category, invite=parseInvite(body?.invite), icon = imageUrl(body?.iconUrl), banner=imageUrl(body?.bannerUrl);
  if (!snowflake(guildId) || !name || !summary || !description || !CATEGORIES.includes(category) || !invite) return null;
  if ((body.iconUrl && !icon) || (body.bannerUrl && !banner)) return null;
  return {guildId,name,summary,description,category,invite,icon,banner};
}
export function secondsUntilBump(lastBumpedAt, now=Date.now()){
  if(!lastBumpedAt) return 0;
  const elapsed=(now-new Date(lastBumpedAt).getTime())/1000;
  return Math.max(0, Math.ceil(BUMP_COOLDOWN_SECONDS-elapsed));
}
export function isManagerPermission(bits){try {return (BigInt(bits)&0x20n)!==0n || (BigInt(bits)&0x8n)!==0n;}catch{return false;}}
