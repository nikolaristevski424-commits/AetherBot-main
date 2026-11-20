# Aether HQ — Vercel website for the existing Aether Discord bot

An original animated website inspired by the polished product storytelling and section flow of Seshy. It **does not** reuse their art or source. Aether retains its blue/violet identity and the user's Aether logo.

## Operations release (development branch)
- Dispatch call priority/status filtering, unit assignment (up to 8 available units per call), and an audited call history.
- Searchable MDT with a full safe-text detail inspector for fictional records.
- Staff-case searching/filtering, plus Manage Server-only dispatch and ER:LC command role configuration.
- Installable browser-based ER:LC companion at `/companion/`, including an authorized online player selector and confirmation-gated warn-message, kick and private-server ban actions. This is a PWA, not a Roblox plugin or native Windows executable.
- The companion uses an existing encrypted Discord session and the server-side signed bot bridge. No ER:LC API key is ever delivered to the browser.
- ER:LC actions require Manage Server, a configured server key, a fresh player snapshot, and a 12-second cooldown. The warn control sends a fixed in-game private warning message (`:pm`), not a permanent game-native warning record. Actions are audited by CAD.
- Browser UI and backend syntax were checked; integration and real ER:LC command tests are still required before production release.

## What works from the website

- Public homepage, features, commands, setup documentation, FAQ, Terms, Privacy and status.
- Role-aware Discord sign-in (OAuth2 `identify` scope only) and encrypted HttpOnly cookies.
- Authenticated guild picker and real server metrics.
- Built-in dispatch console: calls, units, Liberty County player-position snapshots, CAD MDT searches and fictional records, BOLOs.
- Staff panel: real moderation case history and role hierarchy-enforced warning/timeout actions.
- Server-to-server **HMAC-signed website bridge** to the existing Wispbyte Node bot. Neither the Discord bot token nor the ER:LC API key ever goes to the browser or Vercel.
- Accessible responsive layouts, keyboard-friendly feature tabs and reduced-motion support.

**Live CAD and staff operations will not be available until the Wispbyte HTTPS proxy and secrets are configured.** The website reports setup limitations accurately and does not fabricate live data.

## Recommended public URL

`https://aetherbot-hq.vercel.app` (primary) or a custom branded domain once owned and configured.

### Discord Developer Portal > Your existing Aether application > OAuth2 > Redirects

```
https://aetherbot-hq.vercel.app/api/auth/callback
```

This is the **new website OAuth callback**. The old Wispbyte CAD OAuth callback (`/cad/auth/callback`) continues to work separately, but the public website uses the Vercel callback above. No new Discord bot application is needed.

## Vercel environment variables

```
AETHER_SITE_ORIGIN=https://aetherbot-hq.vercel.app
AETHER_DISCORD_CLIENT_ID=<existing Aether application's public ID>
AETHER_DISCORD_CLIENT_SECRET=<Discord OAuth CLIENT secret; not the bot token>
AETHER_SESSION_SECRET=<new random string of at least 32 characters>
AETHER_BOT_ORIGIN=https://<your verified public HTTPS Wispbyte reverse proxy>
AETHER_BRIDGE_SECRET=<same 32+ character random value used on Wispbyte>
```

Add the private values only in **Vercel > Project > Settings > Environment Variables** with the sensitive/encrypted type. `AETHER_SITE_ORIGIN` must match the public URL exactly. Redeploy after changing env vars.

### Wispbyte bot environment

Keep your existing `DISCORD_TOKEN`, `CLIENT_ID`, database settings, `CAD_DISCORD_CLIENT_SECRET`, `CAD_SESSION_SECRET`, `CAD_REDIRECT_URI`, and ER:LC settings. **Do not copy the bot token to Vercel.** Add only:

```
AETHER_BRIDGE_SECRET=<exact same value as Vercel AETHER_BRIDGE_SECRET>
```

The bot source adds `src/web/siteBridgeRouter.js` and mounts `/api/site-bridge` inside `src/app.js`. It fails closed if the secret is missing, while the rest of Aether remains operational.

**Wispbyte address:** `aether.wispbyte.app:13017` is an assigned *host and port*, not proof that public HTTPS is available. Before setting `AETHER_BOT_ORIGIN`, verify `https://YOUR-HTTPS-HOST/health` returns the bot's JSON response. If Wispbyte doesn't support HTTPS forwarding on that address, use an HTTPS reverse proxy/custom domain. Never set a plain HTTP bot origin in Vercel.

## Authentication and authorization design

1. Discord's OAuth2 server verifies the person using the public site. Only `identify` is requested; the OAuth access token is discarded after verifying identity.
2. The site stores an AES-256-GCM-encrypted 12-hour session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`). OAuth state uses a separate short-lived encrypted cookie.
3. Vercel signs each private request with a timestamp, nonce and SHA-256 body digest using `AETHER_BRIDGE_SECRET`.
4. The bot validates the signature, rejects replays, loads the user's **current guild member and permissions** from Discord, and only then reads or mutates that server's records.
5. Moderation actions invoke the existing Aether `WarningService` and `ModerationService`, which enforce real Discord role hierarchy and bot permissions. Actions are audited.

The HMAC nonce cache assumes **one active Wispbyte bot process**. Multi-process deployment would require shared nonce tracking and atomic database mutations.

## Commands and roleplay notice

The Discord `/911`, `/cad`, `/cad mdt`, `/cad bolo`, and `/cad base` functionality continues to run on Wispbyte and uses the same backend records as the website. The new web map reads recent API snapshots (not continuous GPS). Every emergency screen is **for Roblox ER:LC roleplay only** and is not a real emergency service. Do not add real personal identities or sensitive records to the fictional MDT.

## Tests

From `website/`:

```sh
node --test tests/*.test.js
node --check api/gateway.js
node --check assets/console.js
```

From repository root after the bot patch is merged:

```sh
npm ci
npm test
```

For deployment validation: sign into the website; compare available guilds with actual Discord membership; verify a non-dispatch member cannot read the CAD; create and close a roleplay call; issue/clear a BOLO; create a fictional record; issue a staff warning/timeout using a test member; inspect moderation audit history; check that access is revoked when the user's Discord role is removed; verify Wispbyte `/health`; ensure no tokens appear in browser network responses.

## Status transparency

The status page shows current Vercel reachability and whether the Wispbyte HTTPS endpoint responds. It never invents 30-day uptime or activity totals. If the origin is not configured it reports **unmonitored**, not **offline**.

---
Aether is an independent Discord bot project, not affiliated with Discord, Roblox or Police Roleplay Community. The legal pages are project policy drafts and should be reviewed before announcing a formal public release.
