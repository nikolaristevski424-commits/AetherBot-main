export const CATEGORIES = Object.freeze(['roleplay', 'gaming', 'creative', 'development', 'social', 'other']);
export const DEFAULT_BUMP_COOLDOWN_MS = 2 * 60 * 60 * 1000;
export const isSnowflake = (id) => typeof id === 'string' && /^\d{17,20}$/.test(id);

export function normalizeInvite(raw) {
  if (typeof raw !== 'string') throw new Error('A Discord invite URL is required.');
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error('Enter a valid Discord invite URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Only secure Discord invite URLs are allowed.');
  const host = url.hostname.toLowerCase();
  const bits = url.pathname.split('/').filter(Boolean);
  const code = host === 'discord.gg' && bits.length === 1 ? bits[0]
    : ['discord.com', 'www.discord.com', 'discordapp.com'].includes(host) && bits.length === 2 && bits[0] === 'invite' ? bits[1] : null;
  if (!code || !/^[A-Za-z0-9-]{2,64}$/.test(code)) throw new Error('Use a standard discord.gg or discord.com/invite link.');
  return `https://discord.gg/${code}`;
}

function cleanText(value, label, min, max) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const result = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (result.length < min || result.length > max) throw new Error(`${label} must contain ${min}–${max} characters.`);
  return result;
}
export function normalizeListing(raw) {
  if (!raw || !isSnowflake(String(raw.guildId))) throw new Error('Invalid Discord server ID.');
  if (!CATEGORIES.includes(raw.category)) throw new Error('Choose one of the available categories.');
  return {
    guildId: String(raw.guildId),
    title: cleanText(raw.title, 'Server name', 3, 70),
    description: cleanText(raw.description, 'Description', 20, 600),
    category: raw.category,
    invite: normalizeInvite(raw.invite),
  };
}
export function bumpEligibility(listing, now = Date.now(), cooldown = DEFAULT_BUMP_COOLDOWN_MS) {
  if (!listing || listing.status !== 'approved') return { ok: false, error: 'Your listing must be approved before bumping.' };
  const availableAt = Number(listing.lastBumpAt || 0) + cooldown;
  return now >= availableAt ? { ok: true, availableAt: now } : { ok: false, error: 'Your server is on bump cooldown.', availableAt };
}
export function visibleListings(listings) {
  return listings.filter(item => item.status === 'approved').sort((a, b) => (b.lastBumpAt || 0) - (a.lastBumpAt || 0) || (b.createdAt || 0) - (a.createdAt || 0));
}
