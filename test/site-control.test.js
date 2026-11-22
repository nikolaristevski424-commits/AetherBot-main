import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import express from 'express';
import { ChannelType, Collection, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { signBridge } from '../website/lib/bridge.js';

const owner = '51000000000000001';
const staff = '51000000000000002';
const guildId = '51000000000000003';
const channelId = '51000000000000004';
const botId = '51000000000000005';
let server, origin, directory, db, invited = 0;
let actorPerms = new PermissionsBitField(P.ManageGuild | P.ViewChannel);
const botPerms = new PermissionsBitField(P.Administrator);
const actor = { id: owner, permissions: actorPerms };
const bot = { id: botId, permissions: botPerms };
const channel = {
    id: channelId, type: ChannelType.GuildText, name: 'welcome',
    permissionsFor: member => member.permissions,
    createInvite: async options => {
        assert.deepEqual([options.maxAge, options.maxUses, options.unique], [900, 1, true]);
        invited++;
        return { code: 'TestCode' };
    },
};
const guild = {
    id: guildId, available: true, ownerId: staff, channels: {
        cache: new Collection([[channelId, channel]]), fetch: async id => id ? channel : new Collection([[channelId, channel]]),
    },
    members: { cache: new Collection([[owner, actor]]), fetch: async id => (id?.user || id) === owner ? actor : null, fetchMe: async () => bot },
    leave: () => { throw new Error('unexpected leave'); },
};
actor.roles = { cache: new Collection() };
const client = {
    isReady: () => true, user: { id: botId },
    guilds: { cache: new Collection([[guildId, guild]]), fetch: async () => null },
    users: { fetch: async id => ({ id, bot: false }) },
};

before(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'aether-site-control-'));
    process.env.DATA_DIR = directory;
    process.env.OWNER_IDS = owner;
    process.env.AETHER_BRIDGE_SECRET = 'test-bridge-secret-for-aether-tests-only';
    ({ db } = await import('../src/utils/database.js'));
    await db.initialize();
    const { createSiteBridgeRouter } = await import('../src/web/siteBridgeRouter.js');
    const { servePublicSiteContent } = await import('../src/web/siteControlRoutes.js');
    const app = express();
    app.get('/public', servePublicSiteContent);
    app.use('/api/site-bridge', createSiteBridgeRouter(client));
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    origin = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    db?.flush();
    if (directory) await rm(directory, { recursive: true, force: true });
});

function signed(user, route, data, method = 'POST') {
    const url = '/api/site-bridge/' + route;
    const body = data ? JSON.stringify(data) : '';
    const actualMethod = data ? method : 'GET';
    return fetch(origin + url, {
        method: actualMethod, headers: { ...signBridge(actualMethod, url, user, body), ...(data && { 'Content-Type': 'application/json' }) },
        body: body || undefined,
    });
}

test('owner settings, staff grants and maintenance are audited and projected publicly', async () => {
    assert.equal((await signed(staff, 'owner/site')).status, 403);
    assert.equal((await fetch(origin + '/api/site-bridge/owner/site')).status, 401);
    const setStaff = { action: 'staff', userId: staff, name: 'Aether Staff', title: 'Support', listed: false, access: true };
    assert.equal((await signed(owner, 'owner/site', setStaff)).status, 200);
    assert.equal((await (await signed(staff, 'site/access')).json()).access, 'staff');
    assert.equal((await signed(staff, 'site/team')).status, 200);
    assert.equal((await signed(owner, 'owner/site', { action: 'maintenance', page: 'owner', enabled: true })).status, 400);
    assert.equal((await signed(owner, 'owner/site', { action: 'maintenance', page: 'features', enabled: true, message: 'Scheduled update' })).status, 200);
    const published = await (await fetch(origin + '/public')).json();
    assert.deepEqual(published.staff, []);
    assert.equal(published.maintenance.features.message, 'Scheduled update');
    assert.equal(published.audit, undefined);
    assert.equal((await signed(owner, 'owner/site', { action: 'remove_staff', userId: staff })).status, 200);
    assert.equal((await signed(staff, 'site/team')).status, 403);
    assert.ok((await (await signed(owner, 'owner/site')).json()).audit.length >= 3);
});

test('invite creation rechecks permissions and leave requires typed confirmation', async () => {
    const route = 'owner/guilds/' + guildId;
    assert.equal((await signed(owner, route + '/invite', { channelId })).status, 403);
    assert.equal(invited, 0);
    actorPerms.add(P.CreateInstantInvite);
    const result = await signed(owner, route + '/invite', { channelId });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).url, 'https://discord.gg/TestCode');
    assert.equal(invited, 1);
    assert.equal((await signed(owner, route + '/leave', { confirmation: channelId, reason: 'wrong server' })).status, 400);
});

test('audit events are deduplicated, expire and have an actor response cooldown', async () => {
    const { trackWindow } = await import('../src/services/security/actionTracker.js');
    let result = trackWindow([9000], { id: 'a', at: 10_000 }, 10_000, 5, 2, true);
    assert.equal(result.breached, true);
    result = trackWindow(result.state, { id: 'a', at: 10_000 }, 10_100, 5, 2, true);
    assert.equal(result.count, 2);
    assert.equal(result.breached, false);
    result = trackWindow(result.state, { id: 'b', at: 11_000 }, 11_000, 5, 2, true);
    assert.equal(result.breached, false);
    assert.equal(trackWindow(result.state, { id: 'c', at: 16_100 }, 16_100, 5, 2, true).count, 1);
});

test('an explicit private Lavalink host wins over an optional node file', async () => {
    const { getLavalinkNodes } = await import('../src/config/music/lavalink.js');
    assert.deepEqual(getLavalinkNodes({}), []);
    assert.deepEqual(getLavalinkNodes({ LAVALINK_HOST: 'audio.example.com', LAVALINK_SECURE: 'true', LAVALINK_PASSWORD: 'test-only', LAVALINK_NODES_FILE: 'missing.json' }), [
        { host: 'audio.example.com', port: 443, password: 'test-only', secure: true, name: 'Main' },
    ]);
    assert.throws(() => getLavalinkNodes({ LAVALINK_HOST: 'audio.example.com' }), /Invalid/);
});
