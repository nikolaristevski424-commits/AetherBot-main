# AdvertiseHERE
**AdvertiseHERE is the replacement for the former Aether Discord bot in this repository.** The default `npm start` now starts the advertising and discovery bot, not the former Aether moderation/CAD bot.

**Website:** https://advertisehere.vercel.app/ · [Browse servers](https://advertisehere.vercel.app/browse/) · [Owner dashboard](https://advertisehere.vercel.app/dashboard/) · [Status](https://advertisehere.vercel.app/status/)

## Active bot

The new bot is at `advertisehere/bot/index.js` and includes:
- `/list-server`: submit the current Discord server and verify the invite belongs to it.
- `/bump`: bump an approved listing (shared **two-hour cooldown** with the website).
- `/listing`: show current listing status.
- `/top-servers`: show approved listings.
- `/ad-review`: platform staff moderation, restricted by `AD_OWNER_IDS`.
- `/ad-help`: documentation and website links.

The website and Discord commands share one persisted listing store on the Wispbyte host. Listings are reviewed before appearing publicly. The website uses Discord login and authenticated, signed backend requests; it **never** receives the Discord bot token.

## Rebrand your existing Discord application — do not create another bot

You can keep your current Aether Discord bot application, token, client ID, and existing server installations. Rename the existing application **AdvertiseHERE** and change its icon in the [Discord Developer Portal](https://discord.com/developers/applications). The code replaces the old global slash command set on startup; old Aether commands will stop working. Configure `AD_OWNER_IDS` to enable listing approvals.

**Important:** Back up the Wispbyte data directory and environment before updating your live service. Existing Aether server settings, CAD records, and economy data are **not** migrated to the new advertising-listing format.

## Wispbyte

Install existing dependencies with `npm ci` and run `npm start`. Keep `DISCORD_TOKEN` and `CLIENT_ID` from the current application; copy the other keys in [`.env.example`](.env.example). Set `PORT` to the port Wispbyte assigns (previously **13017**), and set `AD_DATA_DIR` to a writable persistent folder. The bot can run Discord commands before website integration is configured; `/internal/*` stays disabled until `AD_SHARED_SECRET` is provided.

## Vercel website and OAuth

Keep the existing `advertisehere` Vercel project. The production site source is at `advertisehere/site/`, with its own `api/` routes.

Discord OAuth2 redirect URI (register on the **same existing Discord application**):

```text
https://advertisehere.vercel.app/api/auth/callback
```

Vercel environment variables:
- `AH_PUBLIC_ORIGIN=https://advertisehere.vercel.app`
- `AH_DISCORD_CLIENT_ID` = same `CLIENT_ID` used on Wispbyte.
- `AH_DISCORD_CLIENT_SECRET` = that application's **OAuth client secret**.
- `AH_COOKIE_SECRET` = a separate secure random secret of 32+ characters.
- `AH_SHARED_SECRET` = exactly the same 32+ character value as Wispbyte `AD_SHARED_SECRET`.
- `AH_BOT_API_ORIGIN` = the public **HTTPS origin** of the Wispbyte API, without a path or port.

`aether.wispbyte.app:13017` is a host-and-port allocation, **not proof of a public HTTPS reverse proxy**. Verify that `https://aether.wispbyte.app/health` reaches the running bot before using that HTTPS origin in Vercel. Do not point Vercel at a plain HTTP origin, or paste the Discord token into Vercel.

After entering Vercel environment variables, redeploy the website. Test Discord login, a pending submission, staff approval, website bump, Discord bump, and the shared cooldown.

## Development, tests, rollback

```bash
npm ci
npm run test:advertisehere
node --check advertisehere/bot/index.js
npm start
```

The former Aether implementation is retained under `src/` for rollback only, and can be invoked with `npm run start:aether-legacy`. It is not part of the AdvertiseHERE bot's active startup. Keep the legacy code only until this replacement is validated on Wispbyte. See [full setup and security notes](advertisehere/README.md).
