// fileStorage.js
//
// Drop-in replacement for postgresDatabase.js / memoryStorage.js implementing
// the same interface (get/set/delete/list/exists/increment/decrement/clear),
// but persisted to plain JSON files on disk — no external database required.
// Built for panel hosts (Wispbyte and similar) that give you a Node.js
// process and a persistent disk, but no managed Postgres.
//
// Design:
// - Data is sharded into one JSON file per guild (guild_<id>.json), plus a
//   single _global.json for the handful of keys that aren't guild-scoped
//   (giveaway entries, verification audit log). This keeps any one file
//   small and means a write only has to serialize the shard that changed,
//   not the whole dataset.
// - Shards are lazily loaded into memory on first access and kept there;
//   writes are debounced and flushed to disk a short time after the last
//   write to that shard, using a write-to-temp-then-rename so a crash
//   mid-write can never leave a corrupt file in place.
// - flushAll() is called from the bot's graceful shutdown path so nothing
//   pending is lost on a clean restart.

import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), 'data');

const FLUSH_DELAY_MS = 250;

function shardNameForKey(key) {
    const parts = String(key).split(':');
    if (parts[0] === 'guild' && parts[1]) {
        return `guild_${parts[1]}`;
    }
    return '_global';
}

class FileStorage {
    constructor(dataDir = DATA_DIR) {
        this.dataDir = dataDir;
        this.shards = new Map();          // shardName -> Map(key -> value)
        this.expirationTimes = new Map(); // key -> epoch ms (across all shards)
        this.loadedShards = new Set();
        this.dirtyShards = new Set();
        this.flushTimers = new Map();     // shardName -> Timeout

        fs.mkdirSync(this.dataDir, { recursive: true });
    }

    _shardPath(shardName) {
        return path.join(this.dataDir, `${shardName}.json`);
    }

    _ensureShardLoaded(shardName) {
        if (this.loadedShards.has(shardName)) {
            return this.shards.get(shardName);
        }

        const map = new Map();
        const filePath = this._shardPath(shardName);

        try {
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf8');
                const parsed = raw.trim() ? JSON.parse(raw) : { data: {} };
                for (const [key, entry] of Object.entries(parsed.data || {})) {
                    map.set(key, entry.value);
                    if (typeof entry.expiresAt === 'number') {
                        this.expirationTimes.set(key, entry.expiresAt);
                    }
                }
            }
        } catch (error) {
            logger.error(`[FileStorage] Shard "${shardName}" failed to load (${error.message}); starting empty and backing up the bad file.`);
            try {
                if (fs.existsSync(filePath)) {
                    fs.renameSync(filePath, `${filePath}.corrupt-${Date.now()}`);
                }
            } catch (renameError) {
                logger.error(`[FileStorage] Could not back up corrupt shard "${shardName}":`, renameError.message);
            }
        }

        this.shards.set(shardName, map);
        this.loadedShards.add(shardName);
        return map;
    }

    _loadAllShardsFromDisk() {
        try {
            const files = fs.readdirSync(this.dataDir).filter((f) => f.endsWith('.json'));
            for (const file of files) {
                this._ensureShardLoaded(file.slice(0, -'.json'.length));
            }
        } catch (error) {
            logger.error('[FileStorage] Failed to scan data directory:', error.message);
        }
    }

    _isExpired(key) {
        const expiresAt = this.expirationTimes.get(key);
        return typeof expiresAt === 'number' && Date.now() > expiresAt;
    }

    _scheduleFlush(shardName) {
        this.dirtyShards.add(shardName);
        if (this.flushTimers.has(shardName)) return;

        const timer = setTimeout(() => {
            this.flushTimers.delete(shardName);
            this._flushShard(shardName);
        }, FLUSH_DELAY_MS);
        timer.unref?.();
        this.flushTimers.set(shardName, timer);
    }

    _flushShard(shardName) {
        const map = this.shards.get(shardName);
        if (!map) return;

        const out = { data: {} };
        for (const [key, value] of map.entries()) {
            const entry = { value };
            if (this.expirationTimes.has(key)) {
                entry.expiresAt = this.expirationTimes.get(key);
            }
            out.data[key] = entry;
        }

        const filePath = this._shardPath(shardName);
        const tmpPath = `${filePath}.tmp-${process.pid}`;

        try {
            fs.writeFileSync(tmpPath, JSON.stringify(out));
            fs.renameSync(tmpPath, filePath);
            this.dirtyShards.delete(shardName);
        } catch (error) {
            logger.error(`[FileStorage] Failed to write shard "${shardName}":`, error.message);
        }
    }

    // Flush every dirty (and, to be safe, every loaded) shard synchronously.
    // Call this on graceful shutdown.
    flushAll() {
        for (const timer of this.flushTimers.values()) {
            clearTimeout(timer);
        }
        this.flushTimers.clear();

        const shardsToFlush = new Set([...this.dirtyShards, ...this.shards.keys()]);
        for (const shardName of shardsToFlush) {
            this._flushShard(shardName);
        }
    }

    async get(key, defaultValue = null) {
        const map = this._ensureShardLoaded(shardNameForKey(key));

        if (this._isExpired(key)) {
            map.delete(key);
            this.expirationTimes.delete(key);
            this._scheduleFlush(shardNameForKey(key));
            return defaultValue;
        }

        const value = map.get(key);
        return value !== undefined ? value : defaultValue;
    }

    async set(key, value, ttl = null) {
        const shardName = shardNameForKey(key);
        const map = this._ensureShardLoaded(shardName);

        map.set(key, value);
        if (ttl && ttl > 0) {
            this.expirationTimes.set(key, Date.now() + ttl * 1000);
        } else {
            this.expirationTimes.delete(key);
        }

        this._scheduleFlush(shardName);
        return true;
    }

    async delete(key) {
        const shardName = shardNameForKey(key);
        const map = this._ensureShardLoaded(shardName);

        const existed = map.delete(key);
        this.expirationTimes.delete(key);
        if (existed) {
            this._scheduleFlush(shardName);
        }
        return true;
    }

    async list(prefix) {
        const prefixStr = String(prefix);
        const parts = prefixStr.split(':');
        const results = [];

        // Guild-scoped prefix: only that one shard needs to be touched.
        if (parts[0] === 'guild' && parts[1]) {
            const map = this._ensureShardLoaded(`guild_${parts[1]}`);
            for (const key of map.keys()) {
                if (key.startsWith(prefixStr) && !this._isExpired(key)) {
                    results.push(key);
                }
            }
            return results;
        }

        // Anything broader has to scan every shard on disk.
        this._loadAllShardsFromDisk();
        for (const map of this.shards.values()) {
            for (const key of map.keys()) {
                if (key.startsWith(prefixStr) && !this._isExpired(key)) {
                    results.push(key);
                }
            }
        }
        return results;
    }

    async exists(key) {
        const map = this._ensureShardLoaded(shardNameForKey(key));
        if (this._isExpired(key)) return false;
        return map.has(key);
    }

    async increment(key, amount = 1) {
        const current = await this.get(key, 0);
        const newValue = (typeof current === 'number' ? current : 0) + amount;
        await this.set(key, newValue);
        return newValue;
    }

    async decrement(key, amount = 1) {
        return this.increment(key, -amount);
    }

    async clear() {
        this._loadAllShardsFromDisk();
        for (const shardName of this.shards.keys()) {
            this.shards.set(shardName, new Map());
            this._scheduleFlush(shardName);
        }
        this.expirationTimes.clear();
        return true;
    }

    getInfo() {
        return {
            type: 'file',
            dataDir: this.dataDir,
            loadedShards: this.loadedShards.size,
        };
    }
}

export { FileStorage, DATA_DIR };
