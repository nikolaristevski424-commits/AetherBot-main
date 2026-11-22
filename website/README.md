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

## Release checklist — Vercel and Wispbyte

### Vercel settings
- Project **aetherbot-hq**, root directory **website**, Framework Preset **Other**, output directory empty, no custom build command.
- Use the GitHub repository **nikolaristevski424-commits/AetherBot-main**.
- Recommended Node.js runtime 22.x or 24.x when supported. The `website/package.json` requires Node >=22.12.0.
- Assign `aetherbot-hq.vercel.app` as the canonical production domain (or update every canonical setting if you use a custom domain).
- The Vercel project must deploy from the `website/` directory, not the Discord bot root. Wispbyte hosts the persistent Discord bot.

### Vercel Production environment variables
```dotenv
AETHER_SITE_ORIGIN=https://aetherbot-hq.vercel.app
AETHER_DISCORD_CLIENT_ID=<public Discord application client ID>
AETHER_DISCORD_CLIENT_SECRET=<Discord OAuth2 client secret>
AETHER_SESSION_SECRET=<random value, 32+ characters; unique>
AETHER_BOT_ORIGIN=https://<PUBLIC HTTPS bot proxy host; no path or port>
AETHER_BRIDGE_SECRET=<random value, 32+ characters; shared exactly with Wispbyte>
```
Only set secrets in Vercel Settings > Environment Variables. Never commit real values. Never set `DISCORD_TOKEN` or an ER:LC private-server key on Vercel. If preview deployments use a different domain, they require their **own** exact `AETHER_SITE_ORIGIN` and an OAuth callback allowlist entry; previews cannot reuse the production origin unchanged.

### Wispbyte persistent bot
- Deploy the matching **same release** of the repository's bot code and keep the existing bot/database settings.
- Add `AETHER_BRIDGE_SECRET` with exactly the same value as Vercel; leave `DISCORD_TOKEN`, `CLIENT_ID`, the database configuration and your ER:LC key on Wispbyte.
- Expose the bot's HTTP service through an actual verified HTTPS reverse proxy. `AETHER_BOT_ORIGIN` rejects an explicit port, HTTP, path and credentials.
- Verify `https://<bot-host>/health` responds with the expected health JSON before enabling the website bridge.
- For ER:LC moderation, the bot needs a valid server API key set through `/erlc setup`; the staff member needs the site's configured Discord permissions, and player snapshots must be fresh.

### Discord developer portal
- Use the **existing Aether application**, not a new bot.
- In OAuth2 > Redirects add exactly `https://aetherbot-hq.vercel.app/api/auth/callback`.
- Confirm OAuth Client ID/Secret correspond to the existing Aether bot; enable the necessary bot permissions on each guild.

### Verify before production
Run `node --test website/tests/*.test.js` and the repository root tests. Verify login/logout, unauthorized access, role revocation, config updates, map data, calls, case search, and the PWA installation in Chrome/Edge. Test warn, kick and ban with test Roblox accounts on a test private server first. Audit actual logs and platform permissions. Enforce reviews on any release that can perform moderation. Never use production accounts as test targets.

### Theme system
`/assets/theme.js` and `/assets/theme.css` enable light/dark mode across all public and staff pages. Preference is local to the browser; it is not transmitted to the server and is not an authentication setting. The installable ER:LC companion also uses the shared theme.

## Additional operations enhancements

- **Quick jump (Ctrl/Cmd+K):** Searchable keyboard navigation to Dashboard, Dispatch, Officer MDT, BOLOs, Companion, Moderation, Status, Docs and FAQ. This only navigates; it never grants access or executes staff commands.
- **Dispatch triage:** Authorized call data powers urgent call count, unassigned active calls, oldest waiting incident, and combined search by title, postal, details or reporter name. These numbers do not appear until real CAD data loads.
- **Staff/dispatch CSV exports:** Users with current in-page permission checks can export only the already-loaded moderation cases or dispatch audit events. CSV is sanitized against spreadsheet formula injection and capped at 500 rows; no data goes to another service. Server-side Discord permissions still control all fetched records.
- **Deployment readiness:** Dashboard shows actual configured OAuth, configured gateway, and HTTPS bot health states separately. It does not fake historical uptime or expose credentials.
- **Small-screen operations:** Responsive navigation and layout preserved for touchscreen use. Export buttons and menus have semantic labels and disabled states until data is ready.

### Additional verification
- Run `node --test website/tests/*.test.js` including `website/tests/exports.test.js` for CSV formula-injection, allowlist and row-bound tests.
- Test `Ctrl+K` on Windows and `Cmd+K` on macOS, arrow navigation, Escape and mobile focus.
- Verify CSV import behavior using spreadsheet software, including tricky quote/newline/formula values.
- Check dashboard readiness when OAuth, bot bridge or Wispbyte HTTPS are intentionally unavailable.
- Perform end-to-end tests on an authorized Discord test guild and ER:LC private server before production deployment.

## Wispbyte subdomain connection & truthful current uptime
The Wispbyte Subdomains panel has assigned the Aether application `aether.wispbyte.app:13017`. For the Vercel `AETHER_BOT_ORIGIN`, use the **HTTPS reverse proxy origin without the allocated port**: `https://aether.wispbyte.app`.
- Set Wispbyte `PORT` to the assigned `13017` if it is the app's primary port; use `WEB_HOST=0.0.0.0`.
- Test `https://aether.wispbyte.app/health` in a browser. A Wispbyte 'Active' subdomain is not proof the proxy is correctly serving HTTPS.
- Test `https://aether.wispbyte.app/ready`: status 200 and `ready:true` means the bot's Discord gateway and persistent database are ready; HTTP 503 means it is not ready.
- The website's `/api/status` now checks both endpoints on each status refresh and reports **HTTPS reachability**, **Discord/database readiness**, and the current process uptime since the last restart. This is a snapshot, not 24/7 history or an uptime percentage.
- A true historical uptime chart/percentage requires scheduled probes and durable external storage. Never infer a 30-day uptime percentage from one request.
- `AETHER_BRIDGE_SECRET` is a random 32+-character signing secret. Generate it once, store the **exact same value** on Vercel and Wispbyte, and never put it in website source, GitHub, browser code or support tickets.

## Design refresh — Aether Studio UI (November 2026)
The design-only `website/assets/refined.css` layer is imported *after* `site.css` and `theme.css` on all 14 site pages. It keeps original templates and form/JS IDs in place while giving the pages a consistent visual system: editorial dark product homepage, navy operations rail, deliberate card density, typography, accessible forms, responsive layouts, and coordinated light/dark palettes.
The homepage remains explicitly **illustrative** (not fake live usage statistics); the authenticated CAD and staff modules still request real data and preserve all original permission checks.
The installable ER:LC companion PWA caches the refined design layer with a bumped service-worker version. No client-side bridge keys or tokens are added.
Review layout at desktop, laptop and narrow mobile widths with both theme modes; inspect loaded UI while authenticated as an authorized staff member. Automated HTML/DOM-contract tests are in `website/tests/design-integrity.test.js`.
