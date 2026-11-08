-- AdvertiseHERE database schema, PostgreSQL 14+
-- Apply once through your database provider; this does not touch Aether's existing tables.
CREATE TABLE IF NOT EXISTS ah_listings (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 guild_id VARCHAR(20) NOT NULL UNIQUE CHECK (guild_id ~ '^[0-9]{17,20}$'),
 owner_discord_id VARCHAR(20) NOT NULL CHECK (owner_discord_id ~ '^[0-9]{17,20}$'),
 name VARCHAR(90) NOT NULL,
 summary VARCHAR(220) NOT NULL,
 description VARCHAR(1600) NOT NULL,
 category VARCHAR(24) NOT NULL CHECK (category IN ('roleplay','design','development','community','bots','marketplace','hiring','other')),
 invite_code VARCHAR(40) NOT NULL CHECK (invite_code ~ '^[A-Za-z0-9-]{2,40}$'),
 icon_url TEXT,
 banner_url TEXT,
 status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
 rejected_reason VARCHAR(500),
 featured_until TIMESTAMPTZ,
 last_bumped_at TIMESTAMPTZ,
 bump_count INTEGER NOT NULL DEFAULT 0 CHECK (bump_count >= 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ah_listings_directory ON ah_listings(status, last_bumped_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ah_listings_owner ON ah_listings(owner_discord_id);
CREATE TABLE IF NOT EXISTS ah_bumps (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 listing_id BIGINT NOT NULL REFERENCES ah_listings(id) ON DELETE CASCADE,
 actor_discord_id VARCHAR(20) NOT NULL,
 source VARCHAR(16) NOT NULL CHECK(source IN ('website','discord')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ah_bumps_recent ON ah_bumps(created_at DESC);
CREATE INDEX IF NOT EXISTS ah_bumps_listing ON ah_bumps(listing_id, created_at DESC);
CREATE TABLE IF NOT EXISTS ah_sessions (
 session_hash CHAR(64) PRIMARY KEY,
 discord_id VARCHAR(20) NOT NULL,
 username VARCHAR(100) NOT NULL,
 avatar VARCHAR(200),
 encrypted_access_token TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ah_sessions_expiry ON ah_sessions(expires_at);
CREATE TABLE IF NOT EXISTS ah_outbox (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_type VARCHAR(24) NOT NULL,
 payload JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 locked_until TIMESTAMPTZ,
 attempts INTEGER NOT NULL DEFAULT 0,
 processed_at TIMESTAMPTZ,
 last_error VARCHAR(250)
);
CREATE INDEX IF NOT EXISTS ah_outbox_ready ON ah_outbox(processed_at, locked_until, id);
CREATE TABLE IF NOT EXISTS ah_audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_discord_id VARCHAR(20),
 action VARCHAR(50) NOT NULL,
 listing_id BIGINT REFERENCES ah_listings(id) ON DELETE SET NULL,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ah_runtime_heartbeat (
 service VARCHAR(32) PRIMARY KEY,
 last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 guild_count INTEGER,
 ping_ms INTEGER,
 command_count INTEGER,
 version VARCHAR(30)
);
