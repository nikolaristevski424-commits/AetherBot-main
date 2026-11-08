import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { normalizeListing, bumpEligibility, visibleListings, DEFAULT_BUMP_COOLDOWN_MS } from './core.js';

export class ListingStore {
  constructor(filePath, cooldownMs = DEFAULT_BUMP_COOLDOWN_MS) {
    this.filePath = filePath;
    this.cooldownMs = cooldownMs;
    this.records = new Map();
    this.queue = Promise.resolve();
  }
  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!Array.isArray(payload.listings)) throw new Error('Invalid listings data structure.');
      for (const item of payload.listings) this.records.set(item.guildId, item);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error; // Never silently erase corrupt live data.
    }
  }
  async persist() {
    const temp = `${this.filePath}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temp, JSON.stringify({ schemaVersion: 1, listings: [...this.records.values()] }, null, 2), { flag: 'wx', mode: 0o600 });
    await rename(temp, this.filePath);
  }
  update(fn) {
    const operation = this.queue.then(async () => {
      const snapshot = new Map(this.records);
      try {
        const result = await fn();
        await this.persist();
        return result;
      } catch (error) { this.records = snapshot; throw error; }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  list() { return visibleListings([...this.records.values()]).map(x => ({ ...x })); }
  get(guildId) { const item = this.records.get(guildId); return item ? { ...item } : null; }
  stats() {
    const all = [...this.records.values()];
    return { approvedListings: all.filter(x=>x.status==='approved').length, pendingListings: all.filter(x=>x.status==='pending').length, totalBumps: all.reduce((n,x)=>n+(x.bumpCount||0),0) };
  }
  upsert(raw, actorId, guild) {
    const data = normalizeListing(raw);
    return this.update(() => {
      const previous = this.records.get(data.guildId);
      const now = Date.now();
      const next = { ...data, ownerId: actorId, memberCount: guild.memberCount || null,
        status: 'pending', bumpCount: previous?.bumpCount || 0, lastBumpAt: previous?.lastBumpAt || null,
        createdAt: previous?.createdAt || now, updatedAt: now };
      this.records.set(data.guildId, next);
      return { ...next };
    });
  }
  moderate(guildId, nextStatus, reviewerId) {
    if (!['approved', 'rejected'].includes(nextStatus)) throw new Error('Invalid moderation decision.');
    return this.update(() => {
      const listing = this.records.get(guildId);
      if (!listing) throw new Error('No listing found for this server.');
      const next = { ...listing, status: nextStatus, reviewedBy: reviewerId, reviewedAt: Date.now() };
      this.records.set(guildId, next);
      return { ...next };
    });
  }
  bump(guildId) {
    return this.update(() => {
      const listing = this.records.get(guildId);
      const eligibility = bumpEligibility(listing, Date.now(), this.cooldownMs);
      if (!eligibility.ok) return eligibility; // no mutation; persistence is still safe
      const next = { ...listing, lastBumpAt: Date.now(), bumpCount: (listing.bumpCount || 0) + 1 };
      this.records.set(guildId, next);
      return { ok: true, listing: { ...next }, availableAt: next.lastBumpAt + this.cooldownMs };
    });
  }
}
export function defaultStorePath() {
  return join(process.env.AD_DATA_DIR || process.env.DATA_DIR || './data', 'advertisehere-listings.json');
}
