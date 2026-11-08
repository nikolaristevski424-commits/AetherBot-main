# AdvertiseHERE source

The active Discord bot is in `bot/`, the Vercel website and its API routes are in `site/`, and the automated store tests are in `tests/`.

**Use the repository root README for Wispbyte deployment, Discord OAuth, and Vercel environment setup.** The existing Discord application can be renamed without creating a new bot. The original Aether repository is preserved in Git branch `archive/aether-original-2026-11-08` and at the original commit ZIP link in the root README.

## Product behavior

- `/list-server` verifies the submitted Discord invite belongs to the current guild and queues the listing for review.
- `/ad-pending` and `/ad-review` give authorized staff a moderation queue in Discord. The website `/staff/` uses those same server-side permissions.
- `/bump` and website bumping use the same persisted two-hour cooldown.
- `/ad-stats` shows measured approved, pending and bump totals.
- Server removal automatically suspends its directory listing.
- Only approved communities appear in the public directory; visitor statistics are not fabricated.

## Production safeguards

One Wispbyte Node process writes the listing database atomically. Point `AD_DATA_DIR` at persistent storage and back it up routinely. Multi-process deployments require database transactions instead of a local JSON file. Never expose `DISCORD_TOKEN`, `AH_DISCORD_CLIENT_SECRET`, `AH_COOKIE_SECRET` or the shared HMAC key in the browser.
