# Aether Command — Vercel website

This is a separate public Vercel website for the Aether Discord bot. It does **not** run the bot process, replace its CAD API, or handle Discord OAuth itself. The bot continues on its long-running Node.js host.

## Public routes

- `/` — animated marketing homepage and interactive feature previews.
- `/status/` — status view showing verified live gateway statistics and clear unknown states for unmonitored components.
- `/cad/` — secure entrypoint to the bot-hosted CAD. It only offers the live CAD link after the operator has configured it.
- `/api/config` — safe public invite and CAD link configuration (no secrets).
- `/api/overview` — read-only proxy to the bot's public `/api/public/overview` endpoint.

## Vercel environment variables

| Key | Required for | Example |
| --- | --- | --- |
| `AETHER_DISCORD_CLIENT_ID` | Bot invite link (falls back to the existing public application ID) | Public Discord application ID |
| `AETHER_BOT_ORIGIN` | Live bot status and statistics | `https://bot.example.org` |
| `AETHER_CAD_URL` | CAD launch link | `https://bot.example.org` |

Use **only an HTTPS origin**, not an API token, for `AETHER_BOT_ORIGIN` and `AETHER_CAD_URL`.

The bot's `/api/public/overview` endpoint returns only the ready state, server count, loaded commands, gateway ping and process uptime. The website does not need and must never receive `DISCORD_TOKEN`, `ERLC_KEY_ENCRYPTION_SECRET`, or Discord OAuth client secrets.

### Discord OAuth remains on the bot host

Keep these values configured securely on the **bot host**, not in this website's frontend:

- `CLIENT_ID` — Discord application ID (public).
- `CAD_DISCORD_CLIENT_SECRET` — OAuth client secret (private).
- `CAD_REDIRECT_URI` — must match the exact deployed HTTPS bot-host URL + `/cad/auth/callback` registered in the Discord developer portal.
- `CAD_SESSION_SECRET` — 32+ character random secret (private, stable across restarts).

Use `/cad/` on the Vercel site to launch the bot-hosted CAD. The bot's CAD session cookies are scoped to its own HTTPS origin. The website must not proxy authenticated CAD writes until a dedicated authentication and CSRF integration has been reviewed.

### Important operational details

- Deploy this directory (`website/`) as a separate Vercel project with framework `Other`.
- Aether's bot project remains a long-running server on its existing host. Do **not** deploy `src/app.js` to Vercel Functions as a Discord gateway process.
- Current component status only uses fresh checks. The 45-day bars are intentionally shown as **unknown** until a persistent uptime monitor is connected; no fabricated percentages.
- To provide real incident/uptime history, add a separate persistent status store and authenticated monitor or cron workflow. Never fabricate history from a single health check.
- GitHub auto-deployment requires connecting your GitHub login to Vercel. Until configured, API deployments must be explicitly repeated for updates.
- Verify `/`, `/status/`, `/cad/`, `/api/config`, and `/api/overview` after every release. A `/api/overview` 503 with `configured:false` means the bot host URL has not been configured.