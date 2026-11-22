import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { cookieNames, seal } from '../lib/auth.js';
import page from '../api/page.js';

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
    globalThis.fetch = async url => {
        if (url.endsWith('/site/access')) return Response.json({ access: 'staff' });
        return Response.json({ maintenance: { dashboard: { message: '<script>example</script>' } }, staff: [], devlogs: [] });
    };
    const cookie = cookieNames.SESSION + '=' + seal({ userId: '51000000000000001', expiresAt: Date.now() + 60_000 });
    assert.equal((await request('owner', cookie)).status, 403);
    const dashboard = await request('dashboard', cookie);
    assert.equal(dashboard.status, 503);
    assert.match(dashboard.body, /&lt;script&gt;example/);
    assert.doesNotMatch(dashboard.body, /<script>example/);
});

test('Vercel rewrites the slash-ended page and explicit index path', () => {
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
    for (const [slug, name] of [['protection', 'protection'], ['dashboard', 'dashboard'], ['team/panel', 'team-panel']]) {
        for (const path of ['/' + slug + '/', '/' + slug + '/index.html']) {
            assert.ok(config.rewrites.some(rule => rule.source === path && rule.destination === '/api/page?page=' + name));
        }
    }
});
