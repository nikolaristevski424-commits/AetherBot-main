import { readFile } from 'node:fs/promises';
import { session } from '../lib/auth.js';
import { bridgeReady, botOrigin, signBridge } from '../lib/bridge.js';
import { siteContent } from '../lib/site-content.js';

const pages = {
    home: '/', features: '/features/', commands: '/commands/', docs: '/docs/', faq: '/faq/',
    status: '/status/', staff: '/staff/', team: '/team/', devlog: '/devlog/', protection: '/protection/',
    dashboard: '/dashboard/', companion: '/companion/', cad: '/cad/', owner: '/owner/', 'team-panel': '/team/panel/',
};
const privatePages = new Set(['staff', 'dashboard', 'cad', 'owner', 'team-panel']);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function message(res, status, title, body) {
    res.statusCode = status;
    if (status === 503) res.setHeader('Retry-After', '60');
    return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} | Aether</title><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/control.css"></head><body class="control"><main class="container control-main"><h1>${escape(title)}</h1><p>${escape(body)}</p><a href="/login/">Discord sign-in</a></main></body></html>`);
}

async function verifiedAccess(userId) {
    if (!bridgeReady()) return null;
    const path = '/api/site-bridge/site/access';
    try {
        const result = await fetch(botOrigin() + path, {
            headers: signBridge('GET', path, userId), signal: AbortSignal.timeout(3000), redirect: 'error',
        });
        return result.ok ? (await result.json()).access || 'denied' : null;
    } catch {
        return null;
    }
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const page = req.query?.page;
    if (req.method !== 'GET' && req.method !== 'HEAD') return message(res, 405, 'Method unavailable', 'Open this page using a browser.');
    if (typeof page !== 'string' || !Object.hasOwn(pages, page)) return message(res, 404, 'Page unavailable', 'That Aether page could not be found.');
    if (privatePages.has(page)) {
        const user = session(req);
        if (!user) {
            res.setHeader('Location', '/login/?' + new URLSearchParams({ next: pages[page] }));
            res.statusCode = 302;
            return res.end();
        }
        if (page === 'owner' || page === 'team-panel') {
            const access = await verifiedAccess(user.userId);
            if (!access) return message(res, 503, 'Access check unavailable', 'Aether could not verify your Discord permissions. Try again shortly.');
            if (access === 'denied' || (page === 'owner' && access !== 'owner')) {
                return message(res, 403, 'Access restricted', 'This page requires an authorized Aether account.');
            }
        }
    }
    const content = page === 'owner' || page === 'team-panel' ? null : await siteContent();
    const maintenance = content?.maintenance?.[page];
    if (maintenance) return message(res, 503, 'Page under maintenance', maintenance.message || 'This page will be available again after maintenance.');
    try {
        const filename = new URL(page === 'home' ? '../index.html' : '..' + pages[page] + 'index.html', import.meta.url);
        const html = await readFile(filename, 'utf8');
        return res.end(req.method === 'HEAD' ? '' : html);
    } catch {
        return message(res, 500, 'Page unavailable', 'Aether could not load this page.');
    }
}
