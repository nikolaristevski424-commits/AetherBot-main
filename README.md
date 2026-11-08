# AdvertiseHERE

**The Discord server-discovery and advertising platform.**

- **Public website:** https://advertisehere.vercel.app
- **Discovery:** https://advertisehere.vercel.app/browse/
- **Owner dashboard:** https://advertisehere.vercel.app/dashboard/
- **Moderator review desk:** https://advertisehere.vercel.app/staff/
- **Health:** https://advertisehere.vercel.app/status/

AdvertiseHERE replaces the former Aether bot. Its former source is no longer present in this active branch; it is archived at [`archive/aether-original-2026-11-08`](https://github.com/nikolaristevski424-commits/AetherBot-main/tree/archive/aether-original-2026-11-08).

## Repository

```text
advertisehere/
  bot/             # Discord slash commands and authenticated API (Wispbyte)
  site/            # Vercel website and secure serverless endpoints
  tests/           # Listing store and moderation tests
.github/workflows/ # CI checks
```

**Bot commands:** `/list-server`, `/bump`, `/listing`, `/top-servers`, `/ad-review`, `/ad-pending`, `/ad-stats`, `/ad-help`.

Owner listings and Discord bumps share one persistent database and a two-hour cooldown; only approved listings appear in discovery. Submissions require an actual server invite and platform moderator review. The website allows server managers to submit and bump, while platform staff can approve or reject from the review desk.

## Running the bot on Wispbyte

- Node.js 22 or later recommended.
- Use the existing Discord bot `DISCORD_TOKEN` and `CLIENT_ID`; **do not paste either token or OAuth secret into the site or public GitHub repository**.
- Run `npm ci` and `npm start`.
- Set `AD_OWNER_IDS` to authorized staff Discord IDs.
- Set `AD_DATA_DIR` to a persistent writable directory; backup `advertisehere-listings.json` periodically.
- Set `AD_SHARED_SECRET` to a unique random secret (at least 32 characters). Without it, Discord commands can operate but website API access remains disabled.
- Set `PORT` to the assigned Wispbyte port, and confirm your HTTPS proxy actually exposes `/health`.

Copy keys from [`.env.example`](.env.example) to your private host environment.

## Connecting the Vercel website

The Vercel project uses `advertisehere/site/`, served as an independent website. Set the following secure environment variables in the Vercel project settings:

| Variable | Value |
| --- | --- |
| `AH_PUBLIC_ORIGIN` | `https://advertisehere.vercel.app` |
| `AH_DISCORD_CLIENT_ID` | Same bot application ID as Wispbyte `CLIENT_ID` |
| `AH_DISCORD_CLIENT_SECRET` | Discord OAuth client secret for that application |
| `AH_COOKIE_SECRET` | Separate random 32+ character secret |
| `AH_SHARED_SECRET` | Must **exactly match** Wispbyte `AD_SHARED_SECRET` |
| `AH_BOT_API_ORIGIN` | Verified HTTPS origin of Wispbyte bot API, **without** a port or path |

Register this **exact OAuth redirect** in the Discord Developer Portal for the existing application:

```
https://advertisehere.vercel.app/api/auth/callback
```

**Never store the bot token on Vercel.** The browser receives only safe public listing data. Vercel serverless functions sign private HMAC requests to Wispbyte, which checks authorization for each actor.

## Local checks

```bash
npm ci
npm test
npm run check
```

The live bot requires a real Discord login and writable directory; its integration must be tested on Wispbyte after deploying. Tests do not prove live Discord OAuth, public Wispbyte HTTPS routing or cross-service connectivity.

## Original Aether download

The original Aether repository is preserved at [the original source archive](https://github.com/nikolaristevski424-commits/AetherBot-main/archive/3685ccb834a4306c07d0c5d749851feb8a2a717f.zip). Existing Aether CAD, moderation and economy data are **not** automatically converted into AdvertiseHERE listings.
