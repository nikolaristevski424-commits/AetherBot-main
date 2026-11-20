# Aether CAD v3 — ER:LC dispatch integration

This is an additive upgrade to the existing Aether Discord bot. It keeps the existing CAD OAuth server, moderation/tickets/automod, ER:LC integration and database. It is not a standalone bot.

## Commands

- `/911 incident: location: details: [x:] [z:]` — creates a **roleplay-only** emergency call in the server's CAD. All members may submit up to two reports within five minutes. Optional world X/Z are used only when both provided and within the official map bounds. The bot never calls real emergency services.
- `/cad dashboard` — authenticated dashboard URL (server managers and dispatch members).
- `/cad map` — open the authenticated live-map section.
- `/cad calls` — show up to ten active cases, sorted by urgency.
- `/cad unit status: [callsign:]` — register your dispatch unit and set duty status.
- `/cad respond case:` — add yourself to an active call (must be on duty).
- `/cad assign case: officer:` — assign a registered unit to an active call.
- `/cad close case:` — close a finished call.
- `/cad dispatch-channel channel:` — server managers choose a text channel for roleplay `/911` notifications.

Dispatch permissions use the CAD's existing role mapping and Manage Server permission. A member without a dispatch role cannot browse the map or manipulate cases. Server managers can configure access in the existing `/cad/` settings panel. The dispatch channel is optional; reports are always persisted even when a channel isn't configured.

## Live ER:LC map

Aether reuses its existing 30-second private-server sync to read **Players, Staff, JoinLogs and EmergencyCalls** in one v2 request per guild. Player positions from `Location.LocationX / LocationZ` are rendered on the official PRC map image, based on the published 5355×5355 coordinate system with origin in the center, +X right, +Z down. In-game 911 emergencies contain `Position:[x,z]`; these are imported **once**, carry their location onto the map and stay in the dispatch queue until closed.

The map hides player markers older than 90 seconds and reports stale/offline state. Movement is periodic API snapshots, not instant gameplay streaming. Players who have no coordinate data cannot be plotted accurately. The map image is loaded from PRC's published image URL and requires outbound browser access; only the image hosts were added to CAD's image CSP.

## Deploy on Wispbyte

1. Install dependencies: `npm ci`.
2. Keep your existing `DISCORD_TOKEN`, `CLIENT_ID` and persistent DB configuration.
3. `npm start` launches the normal Aether bot and registers `/911` and `/cad` in addition to existing commands.
4. For ER:LC v2 player coordinates and in-game 911 calls, purchase/enable the ER:LC private-server API pack, then run `/erlc setup` using the server key. Keep the key in the bot backend, never in front-end JavaScript.
5. For CAD browser login, set `CAD_DISCORD_CLIENT_SECRET`, `CAD_REDIRECT_URI=https://your-https-bot-host/cad/auth/callback`, `CAD_SESSION_SECRET` (>=32 random chars), and optionally `CAD_PUBLIC_URL=https://your-https-bot-host`.
6. Add that exact OAuth callback URL in your existing Discord application's OAuth2 Redirects. Ensure Wispbyte's HTTPS proxy works; `:13017` by itself does not establish an HTTPS route.
7. Optionally configure a dispatch channel with `/cad dispatch-channel`, then have officers set their units with `/cad unit`.

## Tests and maintenance

```sh
npm ci
node --test test/dispatch-core.test.js test/cad.test.js
node --check src/commands/ERLC/911.js
node --check src/commands/ERLC/cad.js
```

The original Aether CAD data and server-specific role permissions are preserved. The API key stays server-side, and the map requires authenticated dispatch access. New call history is part of the existing CAD database backup process; don't run multiple bot instances with a process-local write queue against the same guild without transactional database support.

## Source of ER:LC location semantics

- https://apidocs.erlc.gg/how-do-i-interpret-the-xyz
- https://apidocs.erlc.gg/api-reference/fetch-server-information
- https://apidocs.erlc.gg/rate-limits
