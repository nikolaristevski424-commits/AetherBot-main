import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { cookieNames, seal } from '../lib/auth.js';
import page from '../api/page.js';
import { maintenanceFor, publicationView } from '../lib/publishing.js';

const originalFetch = globalThis.fetch;
process.env.AETHER_BOT_ORIGIN = 'https://example.com';
process.env.AETHER_SESSION_SECRET = 'test-only-session-secret-long-enough';
process.env.AETHER_BRIDGE_SECRET = 'test-only-bridge-secret-long-enough';

function request(name, cookie = '') {
    const headers = new Map();
    return new Promise(resolve => page({ method: 'GET', query: { page: name }, headers: { cookie } }, {
        statusCode: 200,
        setHeader: (key, value) => headers.set(key, value),
        end(body) { resolve({ status: this.statusCode, body, headers }); },
    }));
}

test('dashboard and privileged templates redirect unauthenticated visitors', async () => {
    for (const name of ['dashboard', 'owner', 'staff', 'team-panel']) {
        const result = await request(name);
        assert.equal(result.status, 302);
        assert.match(result.headers.get('Location'), /^\/login\/\?next=/);
        assert.equal(result.body, undefined);
    }
});

test('owner gate, maintenance response and stored message escaping', async t => {
    t.after(() => { globalThis.fetch = originalFetch; });
    let access = { access: 'owner', primaryOwner: false };
    globalThis.fetch = async url => {
        if (url.endsWith('/site/access')) return Response.json(access);
        return Response.json({ maintenance: { all: { message: 'Website maintenance' }, dashboard: { message: '<script>example</script>' } }, staff: [], devlogs: [] });
    };
    const cookie = cookieNames.SESSION + '=' + seal({ userId: '51000000000000001', expiresAt: Date.now() + 60_000 });
    assert.equal((await request('owner', cookie)).status, 403);
    access = { access: 'owner', primaryOwner: true };
    assert.equal((await request('owner', cookie)).status, 200);
    const dashboard = await request('dashboard', cookie);
    assert.equal(dashboard.status, 404);
    assert.equal(dashboard.headers.get('X-Robots-Tag'), 'noindex');
    assert.match(dashboard.body, /Down for maintenance/);
    assert.match(dashboard.body, /&lt;script&gt;example/);
    assert.doesNotMatch(dashboard.body, /<script>example/);
    assert.equal((await request('home')).status, 404);
});

test('publication rendering excludes drafts, escapes reports and preserves scoped maintenance', () => {
    const id = 'aabbccdd-1122-3344-5566-aabbccdd1122';
    const now = '2026-11-23T18:00:00.000Z';
    const published = { id, title: 'Update <b>text</b>', text: '<script>abc</script>', summary: 'News', category: 'product', publishedAt: now, published: true };
    const incident = { id, title: 'Service interruption', phase: 'monitoring', service: 'cad', severity: 'minor', updatedAt: now, updates: [{ text: 'Monitoring recovery', phase: 'monitoring', at: now }] };
    const content = { devlogs: [], articles: [published], incidents: [incident], maintenance: { ['incident:' + id]: { message: 'Paused report' } } };
    assert.match(publicationView('article', content, id).html, /&lt;script&gt;abc/);
    assert.doesNotMatch(publicationView('article', content, id).html, /<script>/);
    assert.equal(publicationView('article', { ...content, articles: [{ ...published, published: false }] }, id).missing, true);
    assert.equal(maintenanceFor(content, 'incident', id).message, 'Paused report');
    assert.equal(maintenanceFor(content, 'article', id), null);
    assert.doesNotMatch(publicationView('status', content).html, /Service interruption/);
    assert.match(publicationView('status', { ...content, maintenance: {} }).html, /1 active incident/);
    assert.equal(maintenanceFor({ maintenance: { all: { message: 'Paused' } } }, 'owner'), null);
});

test('Vercel rewrites the slash-ended page and explicit index path', () => {
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
    for (const [slug, name] of [['protection', 'protection'], ['dashboard', 'dashboard'], ['team/panel', 'team-panel'], ['blog', 'blog'], ['status/incidents', 'incidents'], ['terms', 'terms'], ['privacy', 'privacy']]) {
        for (const path of ['/' + slug + '/', '/' + slug + '/index.html']) {
            assert.ok(config.rewrites.some(rule => rule.source === path && rule.destination === '/api/page?page=' + name));
        }
    }
});
