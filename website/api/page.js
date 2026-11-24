import { readFile } from 'node:fs/promises';
import { session } from '../lib/auth.js';
import { bridgeReady, botOrigin, signBridge } from '../lib/bridge.js';
import { siteContent } from '../lib/site-content.js';
import { escapeHtml, maintenanceFor, publicationId, publicationView } from '../lib/publishing.js';
import { policyView } from '../lib/policy-view.js';

const pages = {
    home: '/', features: '/features/', commands: '/commands/', docs: '/docs/', faq: '/faq/',
    status: '/status/', staff: '/staff/', team: '/team/', devlog: '/devlog/', protection: '/protection/',
    dashboard: '/dashboard/', companion: '/companion/', cad: '/cad/', owner: '/owner/', 'team-panel': '/team/panel/',
    blog: '/blog/', article: '/blog/', incidents: '/status/incidents/', incident: '/status/incidents/',
    privacy: '/privacy/', terms: '/terms/', profile: '/profile/', community: '/community/', reviews: '/reviews/',
};
const privatePages = new Set(['staff', 'dashboard', 'profile', 'cad', 'owner', 'team-panel']);
const publicationPages = new Set(['blog', 'article', 'incidents', 'incident', 'status']);

function message(res, status, title, body) {
    res.statusCode = status;
    if (status === 503) res.setHeader('Retry-After', '60');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} | Aether</title><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/control.css"><link rel="stylesheet" href="/assets/aether-ui.css"></head><body class="control"><main class="container control-main maintenance-message"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><div class="control-actions"><a class="btn btn-ghost" href="/">Aether home</a><a class="btn btn-ghost" href="/login/">Discord sign-in</a></div></main></body></html>`);
}

async function verifiedAccess(userId) {
    if (!bridgeReady()) return null;
    const path = '/api/site-bridge/site/access';
    try {
        const result = await fetch(botOrigin() + path, {
            headers: signBridge('GET', path, userId), signal: AbortSignal.timeout(3000), redirect: 'error',
        });
        return result.ok ? await result.json() : null;
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
    const detail = page === 'article' || page === 'incident';
    const id = detail && typeof req.query.id === 'string' && publicationId.test(req.query.id) ? req.query.id : null;
    if (detail && !id) return message(res, 404, 'Report unavailable', 'That Aether page could not be found.');
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
            if (!['owner', 'staff'].includes(access.access) || (page === 'owner' && access.primaryOwner !== true)) {
                return message(res, 403, 'Access restricted', 'This page requires an authorized Aether account.');
            }
        }
    }
    const content = page === 'owner' || page === 'team-panel' ? null : await siteContent();
    const maintenance = maintenanceFor(content, page, id);
    if (maintenance) return message(res, 404, 'Down for maintenance', maintenance.message || 'This page will be available again after maintenance.');
    try {
        const filename = new URL(page === 'home' ? '../index.html' : '..' + pages[page] + 'index.html', import.meta.url);
        let html = await readFile(filename, 'utf8');
        if (page === 'terms' || page === 'privacy') {
            html = html.replace('<!-- legal -->', () => policyView(page, content?.policies?.[page]));
        }
        if (publicationPages.has(page)) {
            const view = publicationView(page, content, id);
            if (view.missing) return message(res, 404, 'Report unavailable', 'That Aether page could not be found.');
            if (detail && view.unavailable) return message(res, 503, 'Report temporarily unavailable', 'Please try again in a moment.');
            if (detail) {
                html = html.replace(/<title>[^<]*<\/title>/, () => '<title>' + escapeHtml(view.title) + ' | Aether</title>')
                    .replace(/<!-- publication-heading:start -->[\s\S]*?<!-- publication-heading:end -->/, '');
            }
            html = html.replace('<!-- publication -->', () => view.html);
        }
        return res.end(req.method === 'HEAD' ? '' : html);
    } catch {
        return message(res, 500, 'Page unavailable', 'Aether could not load this page.');
    }
}
