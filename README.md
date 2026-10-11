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
- **ER:LC Sync** - Bring private-server player data into CAD
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
4. Connect the ER:LC private server with `/erlc setup`. CAD player sync and commands use that guild's existing ER:LC connection.

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
