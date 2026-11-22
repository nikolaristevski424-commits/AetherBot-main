import { authResponse, clearCookie, configuredOrigin, loginReady, parseCookie, seal, session, setCookie, unseal } from '../../lib/auth.js';
import { botOrigin, bridgeReady, signBridge } from '../../lib/bridge.js';

const stateCookie = '__Host-aether_cad_intent';
const statePattern = /^[A-Za-z0-9_-]{43}$/;

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET') return authResponse(res, 405, { error: 'Method not allowed.' });
    const origin = configuredOrigin();
    if (!loginReady() || !bridgeReady() || !process.env.AETHER_BRIDGE_PRIVATE_KEY) {
        return authResponse(res, 503, { error: 'Website sign-in is unavailable.' });
    }
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (requestHost !== new URL(origin).host) {
        return authResponse(res, 400, { error: 'Open CAD sign-in through the configured Aether website.' });
    }
    const stored = unseal(parseCookie(req, stateCookie), 'cad');
    const state = req.query?.state ?? (stored?.expiresAt > Date.now() ? stored.value : null);
    if (typeof state !== 'string' || !statePattern.test(state)) {
        return authResponse(res, 400, { error: 'Open the CAD sign-in again to begin a new session.' });
    }
    const who = session(req);
    if (!who) {
        setCookie(res, stateCookie, seal({ value: state, expiresAt: Date.now() + 600_000 }, 'cad'), 600);
        return res.writeHead(302, { Location: '/api/auth/login/?next=%2Fapi%2Fauth%2Fcad%2F' }).end();
    }
    clearCookie(res, stateCookie);
    const path = '/api/site-bridge/site/cad-login';
    const body = JSON.stringify({ state, username: who.username });
    try {
        const response = await fetch(botOrigin() + path, {
            method: 'POST', body, signal: AbortSignal.timeout(5000), redirect: 'error',
            headers: { ...signBridge('POST', path, who.userId, body), 'Content-Type': 'application/json' },
        });
        if (!response.ok) return authResponse(res, 503, { error: 'CAD sign-in expired or the bot is unavailable. Open CAD and try again.' });
        const { ticket } = await response.json();
        if (typeof ticket !== 'string' || !statePattern.test(ticket)) throw new Error('Invalid ticket.');
        const redirect = new URL('/cad/auth/website-callback', botOrigin());
        redirect.searchParams.set('ticket', ticket);
        return res.writeHead(302, { Location: redirect.href }).end();
    } catch {
        return authResponse(res, 503, { error: 'Could not finish CAD sign-in. Open CAD and try again.' });
    }
}
