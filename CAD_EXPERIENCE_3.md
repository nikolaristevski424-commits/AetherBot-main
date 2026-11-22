# Aether CAD Experience 3.0 — Operator & Deployment Guide

## Overview

Aether supports three presentation modes per Discord guild:
- **Discord first** — `/cad` commands, roleplay `/911` cards, BOLO notifications, MDT record lookup embeds and permission-checked incident actions.
- **Web CAD** — the authenticated Wispbyte CAD at `https://aether.wispbyte.app/cad/` (incidents, unit roster, officer MDT, roleplay records, BOLO alerts, map snapshots).
- **Hybrid** (default for older servers) — use both. **One set of server-scoped CAD records** persists on the bot backend. Changing mode does not delete data or grant permissions.

The Vercel public site at `https://aetherbot-hq.vercel.app/` is a product, staff and server-management frontend. Its own connected operations page remains available at `/cad/`. The standalone CAD uses its own Discord login session on Wispbyte.

## Server setup

1. Install the Aether bot in your Discord server.
2. Assign a dispatch channel with `/cad dispatch-channel channel:#dispatch`.
3. Grant dispatch and ER:LC command roles in the **Web CAD Settings** page. Only server managers may edit role mappings.
4. Run `/cad setup`. Choose **Discord commands**, **Web CAD**, or **Hybrid** with the buttons. You can change the choice later with `/cad interface mode:` or the CAD Settings page.
5. Officers run `/cad unit status:Available callsign:1-Adam-12` before taking response assignments.
6. Submit a *fictional* call with `/911`, or press an officer roleplay panic with `/cad panic`. An authorized on-duty officer can click **Respond** on a Discord call card. A manager can **Close call**, or staff may manage it from Web CAD.
7. For fictional civilian/vehicle lookups, use `/cad mdt search` or open Web MDT. Active BOLO results show an explicit warning.
8. Verify records, assignments and audit events agree in Discord and Web.

For a Web-first guild, dispatch notification cards link to the web interface; Discord commands remain available for officers. For a Discord-first guild, alerts prioritize in-channel actions. Hybrid presents both. This setting controls the **preferred UI**, not whether staff are authorized. Discord roles are re-checked on every action.

## Hosting separation

### Wispbyte bot + full CAD

Retain existing bot secrets, server API keys and database configuration. The Wispbyte service requires the existing Discord token and OAuth setup and must expose a working HTTPS domain. Its configured `CAD_REDIRECT_URI` must match `https://aether.wispbyte.app/cad/auth/callback` in your Discord application's OAuth2 redirect list. Use Wispbyte's assigned port and bind HTTP to `0.0.0.0`.

The new bot release contains `/cad setup`, `/cad interface`, `/cad panic` and button handlers, so **deploy this exact bot revision and refresh registered Discord application commands** on Wispbyte. A Vercel-only deployment cannot activate bot commands.

### Vercel website

The `website/` project is static frontend plus Vercel serverless routes. Preserve its existing environment variables and OAuth callback `https://aetherbot-hq.vercel.app/api/auth/callback`. No Discord bot token or ER:LC server key belongs in Vercel. Existing HTTPS bridge configuration is still required for server management; do not expose secrets in HTML or client JavaScript.

## Safety and verification

- All CAD actions require current Discord membership and appropriate roles. Setup requires **Manage Server**.
- Only on-duty authorized staff can use Respond; only managers may Close from a Discord alert.
- Panic incidents are persisted with a 2-minute atomic per-user cooldown for active panic calls.
- Discord messages disallow automatic mentions. BOLOs and civilian records are fictional and must never store real personal information.
- ER:LC map coordinates are API snapshots rather than continuous GPS.
- In a non-production test guild, validate incorrect roles, role revocation between button send and click, deleted or closed calls, stale unit status, duplicate panics, concurrent assignments, mode changes and history persistence.
- Install and run: `npm ci --ignore-scripts`; `node --test test/cad-experience.test.js test/cad.test.js test/mdt.test.js`; `node --test website/tests/*.test.js`; `npm test`. Tests must actually pass in CI before declaring the release ready.
- Browser QA: homepage CAD mode demo (both themes), CAD and MDT on 375/768/1280px, keyboard arrows in tabs, reduced-motion settings, screen-reader labels, permission-checked Web CAD settings, and PWA asset cache after deploy.
- Verify two distinct Discord OAuth logins (Vercel site and Wispbyte CAD). Test with real authorized accounts in an isolated server.

## Future enhancements (not included in this version)

A true dispatcher history chart, official ER:LC bodycam/3D location integrations, richer case attachments and realistic call templates require explicit technical feasibility validation, data-protection policies and additional development. Do not advertise these as existing features.
