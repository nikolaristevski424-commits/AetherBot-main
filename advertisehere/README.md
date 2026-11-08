# AdvertiseHERE — Website + Discord bot

**Aether is being replaced with AdvertiseHERE in this same GitHub repository and Discord application.** AdvertiseHERE is a directory/advertising platform for Discord communities, including ER:LC servers. It uses the supplied red **AD** logo. The old Aether code is retained under `src/` for rollback only; after merging this branch, the root `npm start` launches the new bot.

## Architecture

- **Website** (Vercel): `advertisehere/site/`, static premium responsive homepage, browse/search, dashboard, pricing and honest status UI, plus serverless auth and signed API proxy.
- **Discord bot** (Wispbyte or other always-on Node host): `advertisehere/bot/index.js`, `discord.js` v14, Express API, shared persistent listing store.
- **Data**: one JSON file on a persistent Wispbyte directory, written atomically and serialized by a single Node process. Suitable for first launch on **one** bot instance. Before large-scale launch or horizontal scaling, migrate to Postgres transactions.
- **Security**: bot token stays **only on Wispbyte**; Discord OAuth client secret stays **only on Vercel**; dashboard session is signed, HttpOnly/Secure/SameSite=Lax; CSRF origin check for writes; each action is re-authorized against bot guild permissions; private bot API uses HMAC-SHA256, nonce and timestamp replay protection. Client does not receive secrets.

## What currently works in source

- `GET /api/listings` from website proxies to bot, returning *approved only*.
- Owner dashboard signs in with Discord using OAuth `identify`, lists bot-connected guilds the user can manage and submits listing edits for review.
- Website bump button calls the **same store and two-hour cooldown** as the bot `/bump` command.
- Website browse page filters real approved listings; shows an explicit empty/connection state until bot is running.
- Bot commands: `/list-server`, `/bump`, `/listing`, `/top-servers`, `/ad-review`, `/ad-help`.
- Staff approval via `/ad-review` only for IDs in `AD_OWNER_IDS`.
- Invite validation checks the invite's actual Discord guild before saving.
- Status reports connection truthfully; no invented listings, paid placements, or uptime history.

## Wispbyte — bot host configuration

Start command after merging the new entrypoint: `npm start` (or `node advertisehere/bot/index.js`). Set:

```dotenv
DISCORD_TOKEN=                              # Keep existing Aether bot token if reusing the same Discord application — never send in chat
CLIENT_ID=                                  # Existing Aether application ID (same bot, rebranded)
PORT=13017                                  # use your actual Wispbyte assigned port, if different
WEB_HOST=0.0.0.0
AD_PUBLIC_ORIGIN=https://advertisehere.vercel.app
AD_SHARED_SECRET=                           # optional at bot startup; required to connect website (>=32 characters)
AD_OWNER_IDS=                               # comma-separated Discord user IDs of platform reviewers
AD_DATA_DIR=./data                         # must be persistent writable storage
AD_REGISTER_COMMANDS=true
```

**Wispbyte networking:** The website needs a *working public HTTPS origin* that forwards to this HTTP API. `aether.wispbyte.app:13017` is not by itself evidence of an HTTPS reverse proxy. Configure/test HTTPS and then supply its **origin without a port** as `AH_BOT_API_ORIGIN` in Vercel. Vercel's backend intentionally rejects non-HTTPS or port-bearing bot URLs. A future custom domain like `https://api.advertisehere.example` is ideal.

## Vercel — website settings

Project: `advertisehere`, root directory `advertisehere/site/` if linked to Git, framework **Other**. For direct file deployments, deploy the contents of the `site` directory as root. Under **Settings → Environment Variables**, set:

```dotenv
AH_PUBLIC_ORIGIN=https://advertisehere.vercel.app
AH_DISCORD_CLIENT_ID=                      # Same existing Discord application ID as Wispbyte CLIENT_ID
AH_DISCORD_CLIENT_SECRET=                  # OAuth2 Client Secret (NOT bot token)
AH_COOKIE_SECRET=                          # separate random >=32-character value
AH_BOT_API_ORIGIN=https://YOUR-PUBLIC-HTTPS-BOT-API-HOST
AH_SHARED_SECRET=                          # must match Wispbyte value exactly
```

Use encrypted variables. Redeploy Vercel after changing them. Do not add `DISCORD_TOKEN` to Vercel.

### Exact Discord OAuth redirect

Add this under your new AdvertiseHERE Discord application → OAuth2 → Redirects:

`https://advertisehere.vercel.app/api/auth/callback`

The serverless Vercel callback is **implemented** and uses OAuth authorization code, state validation and signed session cookies. The OAuth client ID/secret must belong to the *same Discord application* as the running bot. Add Guilds intent only if you need it; current bot uses the nonprivileged `Guilds` gateway intent.

### Rebrand the existing Aether Discord application (no new bot required)

Reuse the existing Aether `DISCORD_TOKEN` and `CLIENT_ID` from Wispbyte. Rename the existing Discord application and upload the red AdvertiseHERE logo in the Discord Developer Portal; this keeps your existing server installations and bot permissions. Vercel OAuth `AH_DISCORD_CLIENT_ID` and `AH_DISCORD_CLIENT_SECRET` must be from that **same** application. On successful startup, the new bot's global slash-command registration **replaces the old Aether slash commands** with the AdvertiseHERE command set. Existing Aether commands and CAD no longer run under `npm start`. The old `src/` code and `start:aether-legacy` script are retained for rollback, not as active features.

### Test procedure

1. `node --test advertisehere/tests/core.test.js` and `node --check advertisehere/bot/index.js`. Back up your current Wispbyte data and environment before changing the running service.
2. On Wispbyte, configure env vars, deploy and verify `GET https://YOUR-BOT-API/health` returns `{ready:true}`.
3. On Vercel, configure encrypted env vars, redeploy, check `/api/health` shows the bot connected.
4. Register the exact OAuth callback, sign in via `/dashboard/`, confirm your guild shows only with Manage Server permission.
5. Submit a real Discord invite, confirm **pending** listing is not public; use `/ad-review` to approve.
6. Run `/bump` once, verify it moves up `/browse/`; try bump on website before two hours and confirm cooldown is enforced.
7. Review rate limiting, content moderation and persistence on Wispbyte restart before opening to the public.

## Rollback

Until final launch the previous Aether app is preserved as `npm run start:aether-legacy` (`node src/app.js`). This is intentionally not a production deletion/migration; keep a backup of your old Wispbyte environment and data before switching the live startup command.

### Startup with existing Wispbyte environment

The Discord bot starts with the existing `DISCORD_TOKEN`/`CLIENT_ID` even before `AD_SHARED_SECRET` is set. In that case, `/internal/*` is disabled with HTTP 503 and only Discord commands are available. Once you add the same 32+-character shared secret to Wispbyte (`AD_SHARED_SECRET`) and Vercel (`AH_SHARED_SECRET`) and verify public HTTPS forwarding, the website can list and bump through its signed backend. Never expose secrets in client-side scripts or chat.
