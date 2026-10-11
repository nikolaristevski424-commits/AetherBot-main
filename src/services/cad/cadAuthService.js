import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'aether_cad_session';
const STATE_COOKIE = 'aether_cad_oauth_state';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

function base64url(value) {
    return Buffer.from(value).toString('base64url');
}

function parseCookies(header = '') {
    return Object.fromEntries(header.split(';').map((part) => {
        const separator = part.indexOf('=');
        if (separator < 0) return ['', ''];
        const name = part.slice(0, separator).trim();
        try {
            return [name, decodeURIComponent(part.slice(separator + 1).trim())];
        } catch {
            return [name, ''];
        }
    }).filter(([name]) => name));
}

function cookie(name, value, { maxAge, secure, path = '/cad' }) {
    return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export class CadAuthService {
    constructor({ clientId, clientSecret, redirectUri, sessionSecret, secureCookies = true }) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.sessionSecret = sessionSecret;
        this.secureCookies = secureCookies;
        this.sessions = new Map();
    }

    get configured() {
        return Boolean(
            this.clientId
            && this.clientSecret
            && this.redirectUri
            && typeof this.sessionSecret === 'string'
            && this.sessionSecret.length >= 32,
        );
    }

    _sign(payload) {
        const encoded = base64url(JSON.stringify(payload));
        const signature = createHmac('sha256', this.sessionSecret).update(encoded).digest('base64url');
        return `${encoded}.${signature}`;
    }

    _verify(token) {
        if (!this.configured || typeof token !== 'string') return null;
        const [encoded, signature, extra] = token.split('.');
        if (!encoded || !signature || extra !== undefined) return null;

        const expected = createHmac('sha256', this.sessionSecret).update(encoded).digest();
        let supplied;
        try {
            supplied = Buffer.from(signature, 'base64url');
        } catch {
            return null;
        }
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

        try {
            const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
            return payload.exp > Date.now() ? payload : null;
        } catch {
            return null;
        }
    }

    beginLogin() {
        if (!this.configured) throw new Error('CAD Discord OAuth is not configured.');
        const state = randomBytes(32).toString('base64url');
        const stateCookie = this._sign({ state, exp: Date.now() + STATE_TTL_MS });
        const url = new URL('https://discord.com/oauth2/authorize');
        url.searchParams.set('client_id', this.clientId);
        url.searchParams.set('redirect_uri', this.redirectUri);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', 'identify guilds');
        url.searchParams.set('state', state);
        return {
            url: url.toString(),
            stateCookie: cookie(STATE_COOKIE, stateCookie, {
                maxAge: STATE_TTL_MS / 1000,
                secure: this.secureCookies,
                path: '/cad/auth',
            }),
        };
    }

    async completeLogin(code, state, requestCookies) {
        if (!this.configured || typeof code !== 'string' || typeof state !== 'string') {
            throw new Error('CAD Discord OAuth callback is invalid.');
        }

        const signedState = this._verify(parseCookies(requestCookies)[STATE_COOKIE]);
        if (!signedState || signedState.state !== state) throw new Error('CAD login state expired or did not match.');

        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.redirectUri,
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (!tokenResponse.ok) throw new Error('Discord rejected the CAD login.');
        const tokenData = await tokenResponse.json();

        const headers = { Authorization: `Bearer ${tokenData.access_token}` };
        const [userResponse, guildsResponse] = await Promise.all([
            fetch('https://discord.com/api/users/@me', { headers, signal: AbortSignal.timeout(10000) }),
            fetch('https://discord.com/api/users/@me/guilds', { headers, signal: AbortSignal.timeout(10000) }),
        ]);
        if (!userResponse.ok || !guildsResponse.ok) throw new Error('Discord could not verify the CAD account.');

        const user = await userResponse.json();
        const guilds = await guildsResponse.json();
        if (!user?.id || !Array.isArray(guilds)) throw new Error('Discord returned an invalid CAD account response.');

        const sessionId = randomBytes(32).toString('base64url');
        const expiresAt = Date.now() + SESSION_TTL_MS;
        const profile = {
            id: user.id,
            username: user.global_name || user.username || 'Discord user',
            avatar: user.avatar || null,
        };
        this.sessions.set(sessionId, {
            profile,
            guildIds: guilds.map((guild) => guild.id),
            expiresAt,
        });

        const sessionCookie = this._sign({ sessionId, exp: expiresAt });
        return {
            sessionCookie: cookie(SESSION_COOKIE, sessionCookie, {
                maxAge: SESSION_TTL_MS / 1000,
                secure: this.secureCookies,
            }),
            clearStateCookie: `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/cad/auth; Max-Age=0${this.secureCookies ? '; Secure' : ''}`,
            profile,
        };
    }

    getSession(requestCookies) {
        const payload = this._verify(parseCookies(requestCookies)[SESSION_COOKIE]);
        if (!payload?.sessionId) return null;
        const session = this.sessions.get(payload.sessionId);
        if (!session || session.expiresAt !== payload.exp || session.expiresAt <= Date.now()) {
            this.sessions.delete(payload.sessionId);
            return null;
        }
        return session;
    }

    clearSession(requestCookies) {
        const payload = this._verify(parseCookies(requestCookies)[SESSION_COOKIE]);
        if (payload?.sessionId) this.sessions.delete(payload.sessionId);
        return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/cad; Max-Age=0${this.secureCookies ? '; Secure' : ''}`;
    }
}

export const cadCookieNames = Object.freeze({ session: SESSION_COOKIE });