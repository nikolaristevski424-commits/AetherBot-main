# Third-Party Notices

Aether is built on top of open-source software. This file documents significant
third-party components incorporated into the project, as required by their
licenses. Add an entry here any time a meaningful chunk of code, architecture,
or design is adapted from another project.

---

## TitanBot

Aether's codebase originated as a fork of **TitanBot**, "Modular Ultimate
Community Bot," by codebymitch.

- License: MIT
- Used under: MIT License (see below)

```
MIT License

Copyright (c) 2026 codebymitch

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The full text also lives in [LICENSE](LICENSE) at the repository root, which
covers this repository as a whole per the terms above.

---

## discord-roblox-group-verification-bot

The group rank -> Discord role sync design in `roblox.js` / `robloxVerificationService.js`
(rank-threshold role reconciliation, per-group per-rank role mappings) was
adapted from this project's architecture by johnrich.dev. No code was copied
directly — Aether's implementation is a fresh write against Aether's own
guild-scoped storage and error-handling conventions — but the approach is
credited here per its MIT license.

- Source: https://github.com/JohnRichDev/discord-roblox-group-verification-bot
- License: MIT

```
MIT License

Copyright (c) 2025 johnrich.dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Ducky (reviewed, NOT incorporated)

Ducky (github.com/duckyerlc/Ducky-opensource) was reviewed per Nik's request
to study its ER:LC feature set. Its LICENSE is **AGPLv3**, which is
categorically different from every other reference used on this project:
AGPLv3's network-use clause means that running a modified/derivative version
of AGPLv3 code *as a service* (which is exactly what a hosted, invite-to-your-server
Discord bot is) obligates releasing the **entire combined work's source code**
publicly and for free — this would conflict directly with Aether's commercial,
presumably closed-source model.

Only the top-level file/folder names in Ducky's `bot/modules/` tree were
reviewed (functional scope — what features exist — which is not
copyrightable) — no implementation source was read or used. Aether's
session/LOA/shift features were written fresh, independently, against
Aether's own architecture. If Aether ever wants to actually port/adapt
Ducky's real code rather than just cover similar functional ground, that
would require Aether to be released under AGPLv3 too — worth a deliberate
decision, not an accident.

---

## User-provided reference material (no license concerns identified)

Two pieces of user-provided reference material informed `/infraction`,
`/promotion`, and the ER:LC session design, with no license terms attached
(unlike Ducky above) — treated as material the user has rights to use in
their own bot, consistent with how it was provided:

- **"Infraction + Promo System"** — a small single-server reference (typed
  punishment levels, human-readable record IDs, a void/undo path). No
  license file; no code copied — Aether's `/infraction` and `/promotion`
  are a fresh implementation against Aether's guild-scoped storage.
- **"Sessions Module"** ("modular-bot") — a purchased-package-style
  reference bot (its own README describes itself as sold per-server,
  "drag-and-drop" modules). Its session management module has real
  capability Aether's `/session` doesn't yet have: a persistent
  auto-refreshing status panel, a self-serve notification-role toggle,
  a "session full" state, and DMing voters once a vote threshold is hit.
  None of that is built yet — noted here so the next pass on `/session`
  starts from "here's what's missing" instead of re-discovering it.

## Aether Bot Guide / community site

Marketing/setup-guide sites for Aether: `aether-community.lovable.app` and
`aether-setup-flow.base44.app`. Not a code dependency — noted here since
they're the "official" links referenced from the README's Links section.

## Adding future entries

When a new module (ER:LC integration, Roblox verification, anti-raid/anti-nuke,
etc.) adapts meaningful functionality or architecture from another repository,
add a section here with: project name, license type, a copy of the required
notice, and a one-line description of what was adapted.
