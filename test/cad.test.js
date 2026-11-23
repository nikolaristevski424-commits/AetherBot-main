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
process.env.ERLC_KEY_ENCRYPTION_SECRET = 'abcdef0123456789abcdef0123456789';
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'aether-cad-tests-'));

const { initializeDatabase, getFromDb, setInDb } = await import('../src/utils/database/wrapper.js');
const { getErlcConfigKey } = await import('../src/utils/database/keys.js');
const { CadAuthService } = await import('../src/services/cad/cadAuthService.js');
const cad = await import('../src/services/cad/cadService.js');
const { syncCadGuild } = await import('../src/services/cad/cadTrackingService.js');
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
    const callId = state.calls[0].id;
    await cad.updateCadCall(guildId, actor, callId, { status: 'closed' });
    const closedCall = (await cad.getCadState(guildId)).calls.find((call) => call.id === callId);
    assert.ok(Number.isFinite(closedCall.closedAt));
    await cad.updateCadCall(guildId, actor, callId, { status: 'open' });
    const reopenedCall = (await cad.getCadState(guildId)).calls.find((call) => call.id === callId);
    assert.equal(Object.hasOwn(reopenedCall, 'closedAt'), false);
    assert.equal((await cad.getCadState(guildId)).audit.length, 6);
    assert.deepEqual((await cad.getCadGuildConfig(guildId)).dispatchRoleIds, ['22222222222222222']);
});

test('CAD role scopes stay separate and unsafe Discord roles are rejected', async () => {
    const guildId = '77777777777777777';
    const userId = '88888888888888888';
    const dispatchRoleId = '99999999999999999';
    const commandRoleId = '10101010101010101';
    await cad.setCadGuildConfig(guildId, { dispatchRoleIds: [dispatchRoleId], commandRoleIds: [commandRoleId] });
    const assignedRoles = new Set([dispatchRoleId]);
    const member = {
        id: userId,
        permissions: { has: () => false },
        roles: { cache: { has: (roleId) => assignedRoles.has(roleId) } },
    };
    const guild = {
        id: guildId,
        ownerId: '12121212121212121',
        members: { cache: new Map([[userId, member]]), fetch: async () => null },
        roles: { cache: new Map([
            [guildId, { id: guildId, managed: false }],
            [dispatchRoleId, { id: dispatchRoleId, managed: false }],
            ['13131313131313131', { id: '13131313131313131', managed: true }],
        ]) },
    };
    const client = { guilds: { cache: new Map([[guildId, guild]]) } };
    const access = await cad.getCadGuildAccess(client, userId, guildId);
    assert.equal(access.canDispatch, true);
    assert.equal(access.canCommand, false);
    assert.equal(access.isManager, false);
    assert.equal(await cad.getCadGuildAccess(client, '14141414141414141', guildId), null);
    assert.equal(cad.isAssignableCadRole(guild, guildId), false);
    assert.equal(cad.isAssignableCadRole(guild, '13131313131313131'), false);
    assert.equal(cad.isAssignableCadRole(guild, dispatchRoleId), true);
});

test('ER:LC join logs deduplicate and preserve player session duration', async () => {
    const guildId = '44444444444444444';
    const joinedAt = Date.now() - 60_000;
    const alpha = { player: 'Alpha', robloxId: '12345', team: 'Police', location: 'Postal 218' };
    const bravo = { player: 'Bravo', robloxId: '67890', team: 'Sheriff', location: 'Cedar Street' };
    const alphaJoin = { player: 'Alpha', robloxId: '12345', joined: true, at: joinedAt };
    const bravoJoin = { player: 'Bravo', robloxId: '67890', joined: true, at: Date.now() - 5_000 };

    await cad.saveCadPlayers(guildId, null, [alpha], { joinLogs: [alphaJoin] });
    await cad.saveCadPlayers(guildId, null, [alpha, bravo], { joinLogs: [alphaJoin, bravoJoin] });
    const leftAt = Date.now();
    await cad.saveCadPlayers(guildId, null, [bravo], {
        joinLogs: [alphaJoin, bravoJoin, { player: 'Alpha', robloxId: '12345', joined: false, at: leftAt }],
    });

    const state = await cad.getCadState(guildId);
    assert.equal(state.playerEvents.filter((event) => event.robloxId === '12345').length, 2);
    const leaveEvent = state.playerEvents.find((event) => event.robloxId === '12345' && event.type === 'left');
    assert.ok(leaveEvent.durationMs >= 59_000);
    assert.equal(state.players.length, 1);
    assert.equal(state.players[0].robloxId, '67890');
});

test('ER:LC player session restarts after a leave and rejoin between polls', async () => {
    const guildId = '66666666666666666';
    const player = { player: 'Alpha', robloxId: '12345', team: 'Sheriff' };
    const initialJoin = { player: 'Alpha', robloxId: '12345', joined: true, at: Date.now() - 120_000 };
    const leftAt = Date.now() - 20_000;
    const rejoinedAt = Date.now() - 15_000;

    await cad.saveCadPlayers(guildId, null, [player], { joinLogs: [initialJoin] });
    await cad.saveCadPlayers(guildId, null, [player], {
        joinLogs: [
            initialJoin,
            { player: 'Alpha', robloxId: '12345', joined: false, at: leftAt },
            { player: 'Alpha', robloxId: '12345', joined: true, at: rejoinedAt },
        ],
    });

    const state = await cad.getCadState(guildId);
    assert.equal(state.players[0].firstSeenAt, rejoinedAt);
    assert.equal(state.playerEvents.filter((event) => event.robloxId === '12345').length, 3);
});

test('ER:LC sync normalizes documented player, staff, location, and join data', async () => {
    const guildId = '55555555555555555';
    const serverKey = 'cad-sync-test-key';
    const timestamp = Math.floor(Date.now() / 1000);
    await setInDb(getErlcConfigKey(guildId), { serverKey });
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('Players'), 'true');
        assert.equal(url.searchParams.get('Staff'), 'true');
        assert.equal(url.searchParams.get('JoinLogs'), 'true');
        return new Response(JSON.stringify({
            Players: [{
                Player: 'Alpha:12345',
                Team: 'Sheriff',
                Callsign: '3-Lincoln-12',
                Permission: 'Server Moderator',
                WantedStars: 1,
                Location: { PostalCode: '218', StreetName: 'Park Street', BuildingNumber: '2083', LocationX: 10, LocationZ: 20 },
            }],
            Staff: { Admins: {}, Mods: { '12345': 'Alpha' }, Helpers: {} },
            JoinLogs: [{ Join: true, Timestamp: timestamp, Player: 'Alpha:12345' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
        const result = await syncCadGuild(guildId);
        assert.equal(result.players[0].player, 'Alpha');
        assert.equal(result.players[0].robloxId, '12345');
        assert.equal(result.players[0].staffRole, 'Moderator');
        assert.equal(result.players[0].location, 'Postal 218 / 2083 Park Street');
        assert.equal(result.players[0].wantedStars, 1);
        assert.equal(result.staff.length, 1);
        assert.equal(result.events[0].at, timestamp * 1000);
        const storedConfig = await getFromDb(getErlcConfigKey(guildId));
        assert.equal(isEncryptedErlcKey(storedConfig.serverKey), true);
    } finally {
        globalThis.fetch = nativeFetch;
    }
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

test('Discord roleplay 911 calls are stored and rate-limited per member/guild', async () => {
    const guildId = '30000000000000001';
    const actor = { id: '30000000000000002', username: 'Civilian Test' };
    const input = { title: 'Two cars crashed', location: 'Postal 218', details: 'Two vehicles have collided at the intersection.', x: -250, z: 480 };
    const first = await cad.createDiscord911Call(guildId, actor, input);
    const second = await cad.createDiscord911Call(guildId, actor, { ...input, title: 'Traffic backed up' });
    assert.equal(first.source, 'discord_911');
    assert.equal(first.positionX, -250);
    assert.equal(second.source, 'discord_911');
    await assert.rejects(() => cad.createDiscord911Call(guildId, actor, input), /five minutes/);
    const state = await cad.getCadState(guildId);
    assert.equal(state.calls.length, 2);
    assert.equal(state.audit.filter(entry => entry.action === '911.discord_reported').length, 2);
});

test('ER:LC v2 emergency calls import into CAD exactly once', async () => {
    const guildId = '30000000000000003';
    const timestamp = Math.floor(Date.now() / 1000);
    const sample = { Team: 'Police', Caller: 123456789, CallNumber: 400, StartedAt: timestamp, Position: [-654.6, 666.5], PositionDescriptor: 'Postal 403', Description: 'Traffic collision near the park' };
    assert.deepEqual(await cad.ingestErlc911Calls(guildId, [sample]), { added: 1 });
    assert.deepEqual(await cad.ingestErlc911Calls(guildId, [sample, sample]), { added: 0 });
    const state = await cad.getCadState(guildId);
    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].source, 'erlc_911');
    assert.equal(state.calls[0].priority, 'urgent');
    assert.equal(state.calls[0].positionZ, 666.5);
    await cad.updateCadCall(guildId, { id: '30000000000000002', username: 'Dispatcher' }, state.calls[0].id, { status: 'closed' });
    assert.deepEqual(await cad.ingestErlc911Calls(guildId, [sample]), { added: 0 });
    assert.equal((await cad.getCadState(guildId)).calls[0].status, 'closed');
});

test('tracking coalesces concurrent refreshes and maintains a private shared snapshot', async () => {
    const guildId = '55555555555555552';
    await setInDb(getErlcConfigKey(guildId), { serverKey: 'cad-concurrent-tracking-test' });
    const native = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls++;
        return Response.json({ Players: [{ Player: 'Scout:88', Location: { LocationX: '0', LocationZ: '150', PostalCode: '315' } }] });
    };
    try {
        const results = await Promise.all([syncCadGuild(guildId), syncCadGuild(guildId), syncCadGuild(guildId)]);
        assert.equal(calls, 1);
        assert.equal(results[0].players[0].locationX, 0);
        assert.equal(results[0].players[0].locationZ, 150);
        assert.equal(results[0].players[0].postalCode, '315');
        assert.equal((await syncCadGuild(guildId)).skipped, true);
        assert.equal(calls, 1);
    } finally { globalThis.fetch = native; }
});

test('PRC application authorization is optional for one server and application errors do not erase snapshots', async () => {
    const { ErlcClient } = await import('../src/services/erlc/erlcClient.js');
    const { getCadTracking } = await import('../src/services/cad/cadTrackingService.js');
    const guildId = '55555555555555553';
    const native = globalThis.fetch;
    const original = process.env.ERLC_APPLICATION_KEY;
    await setInDb(getErlcConfigKey(guildId), { serverKey: 'cad-app-authorization-test' });
    await cad.saveCadPlayers(guildId, null, [{ player: 'Existing', robloxId: '3', locationX: 3, locationZ: 9 }]);
    process.env.ERLC_APPLICATION_KEY = 'example-test-app-key';
    globalThis.fetch = async (url, opts) => {
        assert.equal(opts.headers.Authorization, 'example-test-app-key');
        return Response.json({ code: 2005 }, { status: 403 });
    };
    try {
        await assert.rejects(new ErlcClient().getServer('prc-auth-mock'), error => error.kind === 'application_required');
        await syncCadGuild(guildId);
        assert.equal(getCadTracking(guildId).status, 'application_required');
        assert.equal((await cad.getCadState(guildId)).players[0].player, 'Existing');
    } finally {
        globalThis.fetch = native;
        if (original === undefined) delete process.env.ERLC_APPLICATION_KEY;
        else process.env.ERLC_APPLICATION_KEY = original;
    }
});

test('CAD map keeps offline or stale players off pins and retains usable call locations', async () => {
    const { buildMapMarkers, getPlayerSnapshot, projectCadPosition } = await import('../src/web/cad/assets/mapModel.js');
    const now = 100_000;
    const player = { player: 'Example', robloxId: '44', locationX: 0, locationZ: 535.5, postalCode: '403', team: 'Police' };
    const call = { id: 'incident', status: 'open', title: '911', positionX: -535.5, positionZ: 0 };
    const state = { players: [player], calls: [call], playerSyncAt: now - 5000 };
    const markers = buildMapMarkers(state, null, '', 'all', now);
    assert.deepEqual(markers.map(marker => marker.point), [{ x: 50, y: 60 }, { x: 40, y: 50 }]);
    assert.equal(buildMapMarkers(state, null, '403', 'police', now)[0].title, 'Example');
    assert.deepEqual(buildMapMarkers({ ...state, serverOnline: false }, null, '', 'all', now).map(x => x.type), ['call']);
    assert.equal(getPlayerSnapshot({ ...state, playerSyncAt: 1 }, now).status, 'expired');
    assert.equal(projectCadPosition(null, 0), null);
});
