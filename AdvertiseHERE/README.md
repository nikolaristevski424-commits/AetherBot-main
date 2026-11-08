# AdvertiseHERE

Discord advertising directory + independent Wispbyte-hosted bot + Vercel website, connected by **one Postgres database**.

- `website/`: public discovery site, Discord OAuth, listing submissions, two-hour bump endpoint, stats and bot status.
- `bot/`: completely separate Discord.js 14 bot with `/listing submit`, `/listing status`, `/listing remove`, `/bump`, `/directory`, `/leaderboard`, `/stats`, `/review approve|reject`. Uses one Guilds intent; no Message Content or privileged member intent.
- `shared/schema.sql`: single shared database schema, required to deploy.

> **Do not replace the existing Aether production bot.** Use a new Discord application/token and a new Wispbyte process for this project. Previous Aether experimental PR was closed.

## Setup (in order)

1. Create a new Discord application named `AdvertiseHERE` in https://discord.com/developers/applications and enable a bot. Invite it with `bot` and `applications.commands` scopes, with only necessary send/embed permissions in the advertising server.
2. Provision a PostgreSQL database, keep its connection URL private, and run `shared/schema.sql` once (or `npm run migrate` from `bot/`). Prefer TLS (`sslmode=require`) and restricted database credentials.
3. Deploy `website/` as a Vercel **Other** framework project. Set these *server-side* environment variables: `SITE_URL`, `DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET` (32+ random chars). Redeploy after changing them. `DISCORD_CLIENT_SECRET` is an OAuth secret, **not the bot token**.
4. In Discord OAuth2 > Redirects, register exactly `https://YOUR-PUBLIC-WEBSITE/api/auth/callback`; must match `SITE_URL` and website's `/api/auth/callback` route.
5. On Wispbyte, upload `bot/` (including `schema.sql`), set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL`, `SITE_URL`, `AH_HOME_GUILD_ID`, optionally `AH_STAFF_ROLE_ID`, `AH_OWNER_IDS`, `AH_BUMP_CHANNEL_ID`, `AH_REVIEW_CHANNEL_ID`; run `npm install`, `npm run register` once, `npm start`. Node >=22.
6. Test: Discord OAuth login; create a listing for a server you manage (submitted **pending**); approve with `/review approve id:...` from hub staff; bump once; verify website sorting and announcement in your configured channel; verify second bump is blocked for 2h.

## Architecture

- Website and bot share Postgres; **no bot token in Vercel**. Website bump writes a transaction and a durable outbox event; the Wispbyte bot polls and posts the event.
- A row lock guarantees atomic per-listing bump cooldowns across website and Discord.
- Listings are private until approved. Staff review only in the hub guild, using an admin role or explicitly configured owner IDs.
- Website OAuth uses `identify guilds`, server-verified manager permissions, signed state, encrypted bearer tokens in server-side database sessions, `Secure`/`HttpOnly` cookies, and same-origin write checks.
- Website status reads real heartbeats and keeps metrics blank until the bot is online. No fake uptime/history.
- The event delivery queue is at-least-once, so a crash at the wrong moment could duplicate an announcement; if exactly-once delivery is required later, add a Discord message ID ledger.

## Future upgrades

Moderation dashboard, rate-limited voting, premium placements with real payment confirmation, member counts via permission-safe APIs, audit activity UI, abuse scoring, listing ownership transfers, and analytics retention dashboards. Don't enable premium features or advertise reach metrics until they're built and verified.
