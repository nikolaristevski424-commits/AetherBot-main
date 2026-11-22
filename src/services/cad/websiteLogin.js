import { randomBytes } from 'node:crypto';

const stateCookie = 'aether_cad_web_state';
const codePattern = /^[A-Za-z0-9_-]{43}$/;
const challengeLifetime = 10 * 60 * 1000;
const ticketLifetime = 45_000;
const challenges = new Map();
const tickets = new Map();

export function cadWebsiteOrigin() {
    try {
        const value = new URL(process.env.AETHER_CAD_SITE_ORIGIN || '');
        if (value.protocol !== 'https:' || value.origin + '/' !== value.href || !process.env.AETHER_BRIDGE_PUBLIC_KEY) return null;
        return value.origin;
    } catch { return null; }
}

function cleanup(entries) {
    const now = Date.now();
    for (const [key, item] of entries) if (item.expiresAt <= now) entries.delete(key);
}

export function beginWebsiteLogin(origin) {
    cleanup(challenges);
    if (challenges.size >= 1000) return null;
    const challenge = randomBytes(32).toString('base64url');
    challenges.set(challenge, { expiresAt: Date.now() + challengeLifetime });
    const url = new URL('/api/auth/cad/', origin);
    url.searchParams.set('state', challenge);
    return { url: url.href, cookie: `${stateCookie}=${challenge}; Path=/cad/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600` };
}

export function issueCadTicket(challenge, profile, guildIds) {
    if (typeof challenge !== 'string' || !codePattern.test(challenge)) return null;
    cleanup(challenges);
    cleanup(tickets);
    if (tickets.size >= 1000 || !challenges.delete(challenge)) return null;
    const ticket = randomBytes(32).toString('base64url');
    tickets.set(ticket, { challenge, profile, guildIds, expiresAt: Date.now() + ticketLifetime });
    return ticket;
}

export function redeemCadTicket(ticket, cookieHeader = '') {
    if (typeof ticket !== 'string' || !codePattern.test(ticket)) return null;
    cleanup(tickets);
    const pending = tickets.get(ticket);
    if (!pending || !cookieHeader.split(';').some(item => item.trim() === `${stateCookie}=${pending.challenge}`)) return null;
    tickets.delete(ticket);
    return pending;
}

export const clearWebsiteChallenge = `${stateCookie}=; Path=/cad/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
