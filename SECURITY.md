# Security Policy — Aether

We take security seriously. If you discover a vulnerability, please follow the policy below so we can triage and address it safely.

## Summary
Aether is operated as a hosted service — server admins add the bot to their Discord server and configure it there; they do not run their own copy. That means we (the operators) hold the data Aether stores for your server (moderation cases, tickets, economy balances, configuration, etc.) and are responsible for securing it. This policy covers how to report vulnerabilities in Aether itself.

## Reporting a Vulnerability (preferred)
- Preferred channel: open a private GitHub Security Advisory for this repository.
- Alternative: reach us via the support server (see [README.md](README.md#support)).
- Do NOT open a public issue with exploit details.

## Response timelines (what to expect)
- Acknowledgement: within 72 hours.
- Triage & severity estimate: within 7 days.
- Fix/migration plan:
  - Critical: aim to ship fix or mitigation within 7–14 days.
  - High: aim to ship within 30 days.
  - Medium/Low: addressed in a future release; communicated within 90 days.
- Public disclosure: we will coordinate with the reporter and normally publish an advisory after a patch is released, or within 90 days if unresolved (unless the reporter requests otherwise).

## Safe testing rules (researcher rules of engagement)
- Only test against a server you control, with a test/staging install of the bot where possible — never against production guilds you don't own.
- Do not exfiltrate, destroy, or modify user or guild data.
- Do not attempt to escalate to or access Discord user tokens, DMs, or other private user content.
- Provide a minimal, safe PoC that reproduces the issue. Redact sensitive data (tokens, PII).
- If the vulnerability requires intrusive testing, contact us first to agree on a plan.

## What to include in your report
- Component affected (e.g., database migration, command parser, ticket system).
- Clear, minimal steps to reproduce.
- Environment: commit SHA, release tag, or version, if known.
- PoC (script, HTTP request, logs, screenshots) — sanitize secrets before sharing.
- Impact (data exposure, privilege escalation, RCE, etc.).
- Suggested mitigation (if any).
- Contact info for follow-up.

## Scope
- In-scope: this repository's code, authentication flows, webhooks, and the production deployment.
- Out-of-scope: third-party services (Discord itself, hosted DB/infra providers).

## How we secure the hosted service
- TLS on all exposed endpoints and webhooks.
- Postgres is never exposed to the public internet — internal network / VPC only.
- Postgres runs with authentication, strong passwords, and network restrictions.
- Secrets stay out of the repository (env vars / secret manager, never committed).
- ER:LC private-server API keys are encrypted at rest when `ERLC_KEY_ENCRYPTION_SECRET` is configured. Keep this secret backed up; changing it without migrating stored keys makes them unreadable.
- The bot's Discord intents and permissions are restricted to the minimum required.
- Dependency and secret-scanning alerts enabled on the repo, with push protection.
- Tokens and API keys are rotated on any suspected compromise.
- Regular Postgres backups, with restores tested on a schedule (see `npm run backup:drill`).
- Logs are monitored for suspicious activity (unexpected config changes, mass deletions).

## Incident response
If we identify or are notified of a security incident affecting the hosted service:
- Affected secrets (bot token, DB credentials, API keys) are rotated immediately.
- Logs/configuration are snapshotted for investigation.
- Affected servers are notified of impact and remediation where relevant.

## Disclosure & Credits
- We will credit researchers in release notes/advisories unless you request anonymity.
- We may assign a CVE or coordinate with CERT/other bodies for high-severity issues.

## Privacy & Telemetry
- As a hosted service, Aether necessarily stores the data your server's configuration requires it to (see the bot's own privacy policy for specifics — add a link here once one exists).
- Aether does not sell data or share it with third parties beyond what's needed to run the service.
- Any analytics/telemetry beyond that must be documented and, where it concerns user behavior rather than bot operation, opt-in.

## Contact
- Preferred: GitHub Security Advisory for this repository
- Alternative: support server (see [README.md](README.md#support))

Thank you for helping keep Aether safe.
