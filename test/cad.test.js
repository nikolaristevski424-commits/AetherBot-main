import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.CLIENT_ID = '12345678901234567';
process.env.CAD_DISCORD_CLIENT_SECRET = 'test-client-secret';
process.env.CAD_REDIRECT_URI = 'https://cad.example/cad/auth/callback';
process.env.CAD_SESSION_SECRET = '0123456789abcdef0123456789abcdef';
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'aether-cad-tests-'));

const { initializeDatabase } = await import('../src/utils/database/wrapper.js');
const { CadAuthService } = await import('../src/services/cad/cadAuthService.js');
const cad = await import('../src/services/cad/cadService.js');
const { encryptErlcKey, decryptErlcKey, isEncryptedErlcKey } = await import('../src/services/erlc/erlcKeyEncryption.js');
await initializeDatabase();

process.on('exit', () => rmSync(process.env.DATA_DIR, { recursive: true, force: true }));

test('ER:LC keys encrypt, decrypt, and reject tampering', () => {
    const secret = '0123456789abcdef0123456789abcdef';
    const encrypted = encryptErlcKey('erlc-test-key', secret);
    assert.equal(isEncryptedErlcKey(encrypted), true);
    assert.notEqual(encrypted, 'erlc-test-key');
    assert.equal(decryptErlcKey(encrypted, secret), 'erlc-test-key');
    assert.equal(decryptErlcKey('legacy-plain-key'), 'legacy-plain-key');
    assert.throws(() => decryptErlcKey(encrypted, 'fedcba9876543210fedcba9876543210'));
});

test('CAD persists concurrent calls, units, and audit entries', async () => {
    const guildId = '12345678901234567';
    const actor = { id: '11111111111111111', username: 'CAD Test' };
    await cad.setCadGuildConfig(guildId, { dispatchRoleIds: ['22222222222222222'], commandRoleIds: ['33333333333333333'] });
    await Promise.all([
        cad.createCadCall(guildId, actor, { title: 'Test call one', location: 'Route 1', details: '', priority: 'normal' }),
        cad.createCadCall(guildId, actor, { title: 'Test call two', location: 'Route 2', details: '', priority: 'urgent' }),
    ]);
    await cad.updateCadUnit(guildId, actor, { callsign: '1-Adam-1', status: 'available' });
    await cad.updateCadUnit(guildId, actor, { status: 'busy' });

    const state = await cad.getCadState(guildId);
    assert.equal(state.calls.length, 2);
    assert.equal(state.units.length, 1);
    assert.equal(state.units[0].callsign, '1-Adam-1');
    assert.equal(state.units[0].status, 'busy');
    assert.equal(state.audit.length, 4);
    assert.deepEqual((await cad.getCadGuildConfig(guildId)).dispatchRoleIds, ['22222222222222222']);
});

test('Discord OAuth state creates a short-lived signed CAD session', async () => {
    const auth = new CadAuthService({
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CAD_DISCORD_CLIENT_SECRET,
        redirectUri: process.env.CAD_REDIRECT_URI,
        sessionSecret: process.env.CAD_SESSION_SECRET,
        secureCookies: false,
    });
    const login = auth.beginLogin();
    const state = new URL(login.url).searchParams.get('state');
    const stateCookie = login.stateCookie.split(';')[0];
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.includes('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'test-token' }), { status: 200 });
        if (url.endsWith('/users/@me')) return new Response(JSON.stringify({ id: '11111111111111111', username: 'CAD Test' }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
    };

    try {
        await assert.rejects(auth.completeLogin('test-code', 'wrong-state', stateCookie), /state expired or did not match/);
        const result = await auth.completeLogin('test-code', state, stateCookie);
        const session = auth.getSession(result.sessionCookie.split(';')[0]);
        assert.equal(session.profile.id, '11111111111111111');
        assert.equal(auth.getSession(result.sessionCookie.replace('aether_cad_session=', 'aether_cad_session=bad')), null);
    } finally {
        globalThis.fetch = nativeFetch;
    }
});