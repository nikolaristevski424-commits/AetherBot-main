# Aether Bot - Ultimate Discord Bot

**Aether** is a powerful, feature-rich Discord bot designed to enhance your server experience with comprehensive moderation tools, engaging economy systems, utility features, and much more. Built with modern Discord.js v14, with file-based storage by default (PostgreSQL supported as an opt-in upgrade) for reliable data persistence.

[![Support Server](https://img.shields.io/badge/-Support%20Server-%235865F2?logo=discord&logoColor=white&style=flat-square&logoWidth=20)](#support)
[![Discord.js](https://img.shields.io/npm/v/discord.js?style=flat-square&labelColor=%23202225&color=%23202225&logo=npm&logoColor=white&logoWidth=20)](https://www.npmjs.com/package/discord.js)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL%20optional-%23336791?logo=postgresql&logoColor=white&style=flat-square&logoWidth=20)

## Table of Contents

- [Features Overview](#features-overview)
- [Quick Setup](#quick-setup)
- [Manual Installation Steps](#manual-installation-steps)
- [Support](#support)
- [Required Bot Intents](#bot-intents)
- [Contributing](CONTRIBUTING.md)

<a name="features-overview"></a>
## Features Overview

Aether offers a complete suite of tools for Discord server management and community engagement:

<table>
<tr>
<td width="50%" valign="top">

### Moderation & Administration
- **Mass Actions** - Bulk ban/kick capabilities
- **User Notes** - Keep detailed moderation records
- **Case Management** - View and track all mod actions

### Economy System
- **Shop & Inventory** - Buy and manage items
- **Gambling** - Risk it for rewards
- **Pay System** - Transfer money between users

### Fun & Entertainment
- **Random Facts** - Learn something new
- **Wanted Poster** - Create fun wanted images
- **Text Reversal** - Reverse any text

### Advanced Ticket System
- **Claim & Priority** - Staff ticket management
- **Ticket Limits** - Prevent spam
- **Transcript System** - Save ticket history

### Aether CAD
- **Dispatch Board** - Create and manage calls and unit status
- **Live ER:LC Tracking** - Refresh players every 30 seconds with team, staff role, callsign, location, wanted status, and session time
- **Join/Leave History** - Preserve ER:LC movement events with timestamps
- **Role-Gated Commands** - Send audited ER:LC commands from CAD

### Server Stats
- **Member Counter** - Live member count channels
- **Voice Counters** - Track voice stats
- **Dynamic Updates** - Real-time channel updates

### Reaction Roles
- **Role Assignment** - Self-assignable roles
- **Emoji Selection** - Reaction-based system
- **Multi-role Support** - Multiple role options

</td>
<td width="50%" valign="top">

### Leveling & XP System
- **XP Tracking** - Automatic message-based XP
- **Level Roles** - Auto-assign roles by level
- **Custom Configuration** - Personalize leveling

### Giveaways & Events
- **Multiple Winners** - Support multi-winner giveaways
- **Auto Picking** - Automatic winner selection
- **Reroll System** - Pick new winners if needed

### Birthday System
- **Birthday Tracking** - Never miss a birthday
- **Auto Announcements** - Celebrate automatically
- **Timezone Support** - Accurate worldwide tracking

### Utility Tools
- **Report System** - Report issues to staff
- **Todo Lists** - Personal task management
- **First Message** - Jump to channel's first message

### Welcome System
- **Welcome Messages** - Greet new members
- **Auto Roles** - Assign roles on join
- **Custom Embeds** - Personalized messages
  
### Music
- **24/7 Mode** - Play music 24/7
- **Interative Button System** - Manage music through buttons
- **Supports EVERY platform** - Supports spotify, deezer, youtube, apple music
  
</td>
</tr>
</table>

<a name="quick-setup"></a>

## Aether CAD Setup

The CAD dashboard is served by the bot at `/cad`. To enable Discord sign-in:

1. In the Discord Developer Portal, add `https://your-domain.example/cad/auth/callback` as an OAuth2 redirect URI and copy the application OAuth2 client secret.
2. Set `CAD_DISCORD_CLIENT_SECRET`, `CAD_REDIRECT_URI` (the exact public callback URL), a stable random `CAD_SESSION_SECRET`, and a separate stable random `ERLC_KEY_ENCRYPTION_SECRET`, each at least 32 characters. Generate each with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.
3. Serve the bot over HTTPS in production, then open `https://your-domain.example/cad` and sign in with Discord. Server managers can assign separate dispatch and ER:LC command roles in CAD Settings.
4. Connect the ER:LC private server with `/erlc setup`. CAD polls the documented Players, Staff, and JoinLogs API fields every 30 seconds; the manual Sync action is also available in the dashboard.

Keep both secrets stable and backed up. Replacing the CAD session secret invalidates active sessions; replacing the ER:LC encryption secret requires migrating stored keys. Existing plaintext ER:LC keys are encrypted the next time the bot reads their configuration. OAuth secrets belong in the deployment environment, never in source control.

## Required Bot Intents
Aether requires the following Discord intents:
- **Guilds**
- **Guild Messages**
- **Message Content**
- **Guild Members**
- **Guild Message Reactions**
- **Guild Voice States**
- **Direct Messages**
- **Bot**
- **Applications.commands**

### Required Permissions
- **View Channels**
- **Send Messages**
- **Embed Links**
- **Attach Files**
- **Read Message History**
- **Manage Messages**
- **Manage Channels**
- **Manage Roles**
- **Kick Members**
- **Manage Messages**
- **Ban Members**
- **Moderate Members**
- **Connect**

<a name="support"></a>
## Support

_Add your support server invite here once one exists — set `SUPPORT_SERVER_URL` (and optionally `BUG_REPORT_URL`) in your environment, and the `/support` command and help-menu buttons will pick it up automatically. No code changes needed._

## Links

- Website: https://aether-community.lovable.app
- Setup guide: https://aether-setup-flow.base44.app

## License

Aether's original code is proprietary (all rights reserved); the inherited TitanBot foundation remains MIT. See [LICENSE](LICENSE) for the exact split, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for what's built on what.

## Thank You

Thank you for choosing Aether for your Discord server! We're constantly working to improve and add new features based on community feedback.

*Last updated: Aug 2026*


## Aether Command website and new CAD (v2)

Aether now serves its public website at \`/\` and a **new CAD v2** at \`/cad/\`.
The new portal uses static HTML, CSS, and JavaScript (no additional framework
or build command), running on the bot's existing Express HTTP port.

- **Public:** \`/\`, \`/setup\`, \`/features\`, \`/status\`, \`/api/public/config\`, \`/api/public/overview\`.
- **New CAD:** \`/cad/\` with a new incident queue, duty roster, assignments,
  BOLO bulletins, audit history, and the existing ER:LC player telemetry.
- **Legacy rollback UI:** \`/cad/legacy\`. The old CAD API and all old CAD
  records are preserved. The new CAD v2 state is intentionally independent
  under the per-guild \`cad:v2\` storage key. Old incidents do **not**
  automatically appear in v2; operators should finish or archive legacy calls
  before transitioning.
- **Authentication:** Existing server-side Discord OAuth, HttpOnly cookies,
  same-origin mutation checks, and Discord guild role checks guard all CAD v2
  endpoints. Server managers can use the existing role configuration in the
  legacy CAD interface until v2 role-settings UI ships.
- **Data:** Dispatch/BOLO/audit data is stored through Aether's existing
  persistence adapter. Use a persistent database/volume. The in-process write
  lock is designed for a **single bot instance**; deployments running multiple
  app replicas must add DB-transactional locks before enabling v2 writes.

### Production setup

1. Deploy the Node.js bot behind HTTPS with a single public domain, using
   the same process/port for the site and CAD. Do **not** deploy only the
   static \`src/web/portal\` directory to Vercel, because the CAD API requires
   the running Discord bot and private storage.
2. Set \`AETHER_PUBLIC_URL=https://your-domain.example\` (without a path).
   Supply your regular \`CLIENT_ID\`, \`DISCORD_TOKEN\`, \`CAD_DISCORD_CLIENT_SECRET\`,
   \`CAD_SESSION_SECRET\`, and \`CAD_REDIRECT_URI\` in the host's **secret
   environment settings**, not GitHub. Keep existing session and ER:LC
   encryption secrets stable.
3. Add \`https://your-domain.example/cad/auth/callback\` to Discord's OAuth2
   redirects and set \`CAD_REDIRECT_URI\` to that exact URL.
4. In Discord run \`/configwizard\`, then \`/erlc setup\` as needed. Configure
   dispatch roles in \`/cad/legacy\` (server managers retain access).
5. Test \`/\`, \`/api/public/overview\`, \`/cad/\`, sign-in, role isolation,
   incident lifecycle, BOLO archiving, unit assignments, and player syncing
   **before** migrating operational use.
6. Roll back the UI at any time using \`/cad/legacy\`; do not delete v2 records
   unless you explicitly intend to purge the new CAD's state.

The site's status panel reports actual runtime data and shows unavailable rather
than inventing uptime or server statistics. The invite CTA is generated from
\`CLIENT_ID\` and does not request blanket Administrator permissions. Confirm
the bot's required permissions in Discord's installation settings.
