// erlcClient.js
//
// Low-level HTTP client for the ER:LC (Emergency Response: Liberty County)
// Private Server API, run by PRC (Police Roleplay Community).
//
// Reference: https://apidocs.erlc.gg  (v2, OpenAPI spec at
// https://api.erlc.gg/internal/docs/apispec.v2.json, checked directly
// against the source before writing this).
//
// Key behavioral rules from the docs this client exists to respect:
// - Auth is a per-server "server-key" header, one key per ER:LC private
//   server (i.e. per Discord guild, in our case).
// - POST /v2/server/command is limited to 1 request per 5 seconds per
//   server-key — enforced here client-side so we never even send a request
//   that we know will be rejected.
// - On 429, the docs are explicit: stop sending immediately and wait the
//   full Retry-After duration. Ignoring that risks an infrastructure-level
//   IP block that needs a manual support ticket to lift — so this client
//   hard-fails closed rather than retrying past a 429.
// - Repeated requests with a bad server-key risk an IP ban. After a small
//   number of consecutive auth failures for a given key, this client stops
//   trying that key entirely until the caller explicitly resets it (e.g.
//   after the user re-runs /erlc setup with a new key).

import { logger } from '../../utils/logger.js';

const BASE_URL = process.env.ERLC_API_BASE_URL || 'https://api.erlc.gg';
const COMMAND_COOLDOWN_MS = 5000; // 1 request / 5s per server-key, per the docs
const MAX_CONSECUTIVE_AUTH_FAILURES = 3;

// Error codes from https://apidocs.erlc.gg/error-codes.md
const AUTH_ERROR_CODES = new Set([2000, 2001, 2002, 2003, 2004]);
const SERVER_OFFLINE_CODES = new Set([3002]);
const OUTDATED_MODULE_CODE = 9999;

class ErlcApiError extends Error {
    constructor(message, { code = null, httpStatus = null, retryAfterMs = null, kind = 'unknown' } = {}) {
        super(message);
        this.name = 'ErlcApiError';
        this.code = code;
        this.httpStatus = httpStatus;
        this.retryAfterMs = retryAfterMs;
        // kind is one of: 'auth' | 'offline' | 'outdated_module' | 'rate_limited' | 'blocked' | 'network' | 'unknown'
        this.kind = kind;
    }
}

// Tracks per-server-key state (command cooldown + consecutive auth failures)
// across calls without the caller needing to manage it themselves.
class KeyState {
    constructor() {
        this.lastCommandAt = 0;
        this.consecutiveAuthFailures = 0;
        this.blockedUntil = 0; // epoch ms; set after a 429 until Retry-After elapses
    }
}

class ErlcClient {
    constructor() {
        this.keyStates = new Map(); // serverKey -> KeyState
    }

    _stateFor(serverKey) {
        if (!this.keyStates.has(serverKey)) {
            this.keyStates.set(serverKey, new KeyState());
        }
        return this.keyStates.get(serverKey);
    }

    // Call after a server key is known-bad (setup rejected, or removed) so
    // stale state doesn't linger.
    forgetKey(serverKey) {
        this.keyStates.delete(serverKey);
    }

    isKeyBlocked(serverKey) {
        const state = this.keyStates.get(serverKey);
        if (!state) return false;
        if (state.consecutiveAuthFailures >= MAX_CONSECUTIVE_AUTH_FAILURES) return true;
        if (state.blockedUntil && Date.now() < state.blockedUntil) return true;
        return false;
    }

    async _request(method, path, { serverKey, query = null, body = null, isCommand = false } = {}) {
        if (!serverKey) {
            throw new ErlcApiError('No server key provided.', { kind: 'auth' });
        }

        const state = this._stateFor(serverKey);

        if (state.consecutiveAuthFailures >= MAX_CONSECUTIVE_AUTH_FAILURES) {
            throw new ErlcApiError(
                'This server key has failed authentication repeatedly and has been paused to avoid an IP ban. Re-run setup with a fresh key.',
                { kind: 'auth' },
            );
        }

        if (state.blockedUntil && Date.now() < state.blockedUntil) {
            throw new ErlcApiError(
                `Rate limited — try again in ${Math.ceil((state.blockedUntil - Date.now()) / 1000)}s.`,
                { kind: 'rate_limited', retryAfterMs: state.blockedUntil - Date.now() },
            );
        }

        if (isCommand) {
            const sinceLast = Date.now() - state.lastCommandAt;
            if (sinceLast < COMMAND_COOLDOWN_MS) {
                throw new ErlcApiError(
                    `⏱️ Cooldown, not a bug — ER:LC only allows 1 in-game command every 5 seconds per server. Wait ${Math.ceil((COMMAND_COOLDOWN_MS - sinceLast) / 1000)}s and try again.`,
                    { kind: 'rate_limited', retryAfterMs: COMMAND_COOLDOWN_MS - sinceLast },
                );
            }
        }

        const url = new URL(path, BASE_URL);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined && value !== null) {
                    url.searchParams.set(key, String(value));
                }
            }
        }

        const headers = { 'server-key': serverKey, Accept: 'application/json' };
        if (body) headers['Content-Type'] = 'application/json';

        let response;
        try {
            response = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
            });
        } catch (networkError) {
            logger.error(`[ERLC] Network error calling ${method} ${path}: ${networkError.message}`);
            throw new ErlcApiError(`Could not reach the ER:LC API: ${networkError.message}`, { kind: 'network' });
        }

        if (isCommand) {
            state.lastCommandAt = Date.now();
        }

        if (response.status === 429) {
            let retryAfterMs = 10_000;
            const header = response.headers.get('Retry-After');
            if (header && !Number.isNaN(Number(header))) {
                retryAfterMs = Number(header) * 1000;
            }
            state.blockedUntil = Date.now() + retryAfterMs;
            logger.warn(`[ERLC] Rate limited on ${path} — backing off ${retryAfterMs}ms per Retry-After.`);
            throw new ErlcApiError('Rate limited by the ER:LC API.', { kind: 'rate_limited', httpStatus: 429, retryAfterMs });
        }

        let payload = null;
        try {
            const text = await response.text();
            payload = text ? JSON.parse(text) : null;
        } catch {
            // Non-JSON body — fall through with payload = null; handled below per status.
        }

        if (response.status === 403) {
            state.consecutiveAuthFailures += 1;
            const code = payload?.code ?? null;
            throw new ErlcApiError(
                AUTH_ERROR_CODES.has(code)
                    ? 'This server key is invalid, expired, or banned from the API.'
                    : 'Unauthorized.',
                { kind: 'auth', code, httpStatus: 403 },
            );
        }

        if (response.ok) {
            state.consecutiveAuthFailures = 0;
            return payload;
        }

        const code = payload?.code ?? null;
        const message = payload?.message || payload?.error || `ER:LC API returned HTTP ${response.status}`;
        logger.warn(`[ERLC] ${method} ${path} failed: HTTP ${response.status}, code=${code}, message=${message}`);

        if (SERVER_OFFLINE_CODES.has(code) || response.status === 422) {
            throw new ErlcApiError('The private server is currently offline (no players in-game).', {
                kind: 'offline', code, httpStatus: response.status,
            });
        }

        if (code === OUTDATED_MODULE_CODE) {
            throw new ErlcApiError(
                'The ER:LC in-game module is out of date. Ask staff to have everyone leave and rejoin the private server, then try again.',
                { kind: 'outdated_module', code, httpStatus: response.status },
            );
        }

        throw new ErlcApiError(message, { kind: 'unknown', code, httpStatus: response.status });
    }

    /**
     * Fetch server status. `include` is an array of any of:
     * Players, Staff, JoinLogs, Queue, KillLogs, CommandLogs, ModCalls,
     * EmergencyCalls, Vehicles
     */
    async getServer(serverKey, include = []) {
        const query = {};
        for (const field of include) {
            query[field] = 'true';
        }
        return this._request('GET', '/v2/server', { serverKey, query });
    }

    /** Run an in-game command as virtual server management. */
    async runCommand(serverKey, command) {
        if (!command || typeof command !== 'string') {
            throw new ErlcApiError('A command string is required.', { kind: 'unknown' });
        }
        return this._request('POST', '/v2/server/command', {
            serverKey,
            body: { command },
            isCommand: true,
        });
    }
}

export const erlcClient = new ErlcClient();
export { ErlcClient, ErlcApiError };
