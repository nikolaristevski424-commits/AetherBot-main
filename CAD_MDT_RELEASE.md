# Aether CAD v4 — Officer MDT, BOLOs, map calibration and Base Dispatch

This extends the existing Aether CAD and Discord bot. Existing moderation, tickets, automod, ER:LC server setup, OAuth, CAD incidents and live player snapshots are not replaced.

## What's new

- **Officer MDT:** Search live ER:LC player snapshots and private fictional person/vehicle records. Add/edit records; managers can archive. View calls assigned to your Discord unit.
- **BOLO board:** Roleplay person/vehicle BOLOs with priority, last-known in-game location, issuer, expiry (1–168 hours), a staff clearing workflow and bounded audit trail.
- **Calibrated map:** Server managers place 3–8 known positions (ER:LC player world coordinates + location on the published map). The backend fits an affine X/Z-to-image transform with a residual error check. Calibrations are stored per Discord guild. Points should be spread across the map; use landmarks (police department, hospital, highway junction), with players standing at those locations when captured. Calibration is not live GPS, and a new official map image requires recalibration.
- **Base Dispatch text and optional voice:** `/cad base join` joins the operator's current voice channel; no recording or speech recognition. Base Dispatch can send bulletins to the configured dispatch text channel and play short attention tones in voice on new `/911` submissions or BOLO creation. Operators speak to each other in the Discord voice channel as normal. It is **not** an AI voice dispatcher or transcription feature.

## Commands

Existing `/cad` commands remain. New groups (no extra global command slots):

- `/cad mdt open`
- `/cad mdt search query:`
- `/cad mdt my-calls`
- `/cad mdt add-record kind: subject: [plate:] [roblox_username:] [description:] [notes:]`
- `/cad mdt archive-record id:` (Manage Server only)
- `/cad bolo list`
- `/cad bolo add kind: subject: details: [location:] [priority:] [expiry_hours:]`
- `/cad bolo clear id:`
- `/cad base join` (user joins an ordinary Discord voice channel first)
- `/cad base leave`
- `/cad base status`
- `/cad base bulletin message:`

Use `/cad dispatch-channel channel:` to set the Base Dispatch text destination. The existing `/911` command still saves calls into the same CAD; it also signals Base Dispatch VC when connected.

## Web UI

Open `https://YOUR-BOT-HTTPS-HOST/cad/`, sign in with Discord, and choose a server where you have CAD dispatch access.
- **MDT** tab: Search and edit fictional RP records; inspect current ER:LC players, active BOLOs and your assigned incidents.
- **Map** tab: View player/incident markers. Managers see the Map Calibration panel. Select a player currently at a known landmark, click **Place marker** and click that point on the map. Repeat at 3 or more well-separated locations; inspect the residual quality indicator. Use **Reset** when the map changes.
- **Settings**: Existing dispatch and command role mapping is preserved.

The web API denies all MDT read/write access without Discord OAuth, guild membership, and dispatch roles. Only guild managers may archive records or recalibrate the map. It retains existing CSRF Origin checks and rate limits.

## Wispbyte requirements

1. Keep all existing Aether environment variables and database configuration. Always back up persistent CAD/ER:LC records before deploying.
2. For Base Dispatch voice support, run **Node.js 22.12.0 or newer**, and use `npm ci` to install the updated lockfile, including `@discordjs/voice` and the Opus encoder. The Docker image is updated to Node 22.
3. Bot needs **View Channel**, **Connect**, and **Speak** permissions in the intended Discord voice channel. Audio capture is never enabled; `selfDeaf: true`.
4. Use an HTTPS public bot host to access `/cad/` outside Wispbyte, and configure `CAD_DISCORD_CLIENT_SECRET`, `CAD_REDIRECT_URI=https://HOST/cad/auth/callback`, `CAD_SESSION_SECRET` (32+ chars), and `CAD_PUBLIC_URL=https://HOST` on the bot host. Register the exact redirect URL in Discord Developer Portal.
5. Connect your private ER:LC server via `/erlc setup` and the ER:LC API pack. Snapshot sync is every 30 seconds and can be stale or offline; the MDT does **not** invent player positions.
6. Set CAD dispatch roles through the `/cad/` settings panel; use `/cad dispatch-channel` for incoming RP calls and Base text bulletins.

### Voice limitations and coexistence

Only one Base Dispatch voice station per guild. The bot will refuse Base join if its account is already in a voice channel for music; stop Aether music first. If the voice channel or host cannot negotiate DAVE/voice networking, the command reports failure and the text CAD remains functional. Base voice doesn't listen to microphones, interpret voice commands, record sessions, or call real emergency services. Those require a separate consent-aware speech service and additional privacy controls.

### Data safety

The MDT is for **fictional characters, fictional investigations and in-game vehicles only**. Do not store real addresses, phone numbers, identifying information, disciplinary records about real people, or sensitive real-world law-enforcement data. Data is stored per Discord guild, and only authorized dispatch roles can access it. Keep a single active bot process or migrate to transactional PostgreSQL writes before horizontal scaling; the database write queue is process-local.

## Checks before production

- `npm ci && node --test test/cad.test.js test/mdt-core.test.js test/mdt.test.js`
- Syntax checks for commands and web modules.
- Verify `/cad mdt search`, new BOLO, expiry, record archive, role isolation between two Discord guilds.
- On the map, compare 3–4 known in-game positions before trusting calibration. Test zoom/pan and position freshness.
- Set the text dispatch channel, issue `/911`, join VC with `/cad base join`, confirm a one-time alert tone and a bulletin without pinging everyone. Check that music and Base aren't both active in the same guild.
- Test Wispbyte restart/persistent storage. No live Discord, Wispbyte, or ER:LC tests are implied by passing unit tests.
