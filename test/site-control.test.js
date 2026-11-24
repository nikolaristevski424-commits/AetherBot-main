import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import express from 'express';
import { ChannelType, Collection, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { signBridge } from '../website/lib/bridge.js';

const owner = '51000000000000001';
const staff = '51000000000000002';
const coOwner = '51000000000000006';
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
    process.env.OWNER_IDS = owner + ',' + coOwner;
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

test('primary owner publishing keeps drafts private and preserves the incident timeline', async () => {
    const route = 'owner/site';
    const draft = { action: 'article', title: 'Release notes', summary: 'A short update', text: '<script>Draft</script>', category: 'changelog', published: false };
    assert.equal((await signed(coOwner, route)).status, 403);
    assert.equal((await signed(coOwner, route, draft)).status, 403);
    assert.deepEqual(await (await signed(coOwner, 'site/access')).json(), { access: 'owner', primaryOwner: false });
    assert.equal((await signed(owner, route, draft)).status, 200);
    assert.deepEqual((await (await fetch(origin + '/public')).json()).articles, []);
    const created = (await (await signed(owner, route)).json()).articles[0];
    const publish = { ...draft, id: created.id, revision: created.revision, published: true };
    assert.equal((await signed(owner, route, publish)).status, 200);
    assert.equal((await signed(owner, route, publish)).status, 409);

    assert.equal((await signed(owner, route, { action: 'incident', title: 'CAD interruptions', service: 'cad', severity: 'minor', phase: 'investigating', text: 'Checking the gateway.' })).status, 200);
    const incident = (await (await signed(owner, route)).json()).incidents[0];
    assert.equal((await signed(owner, route, { action: 'incident_update', id: incident.id, revision: incident.revision, phase: 'resolved', text: 'CAD is responding again.' })).status, 200);
    assert.equal((await signed(owner, route, { action: 'maintenance', page: 'article:' + created.id, enabled: true, message: 'Scheduled update' })).status, 200);
    const content = await (await fetch(origin + '/public')).json();
    assert.equal(content.articles[0].id, created.id);
    assert.equal(content.articles[0].revision, undefined);
    assert.deepEqual(content.incidents[0].updates.map(item => item.phase), ['resolved', 'investigating']);
    assert.equal(content.maintenance['article:' + created.id].message, 'Scheduled update');
});

test('policy drafts are private until published and stale writes are rejected', async () => {
    const { updateSiteControl } = await import('../src/services/siteControlService.js');
    const text = '## Draft terms\n\n' + 'Use Aether and its roleplay features responsibly within your community. '.repeat(2);
    assert.equal((await signed(coOwner, 'owner/site', { action: 'policy', document: 'terms', text, publish: true, revision: 0 })).status, 403);
    await updateSiteControl(owner, { action: 'policy', document: 'terms', text, revision: 0, publish: false });
    const before = await (await fetch(origin + '/public')).json();
    assert.equal(before.policies.terms, undefined);
    await updateSiteControl(owner, { action: 'policy', document: 'terms', text, revision: 1, publish: true });
    const { policies } = await (await fetch(origin + '/public')).json();
    assert.deepEqual(Object.keys(policies.terms).sort(), ['at', 'text']);
    assert.equal(policies.terms.text, text.trim());
    await assert.rejects(updateSiteControl(owner, { action: 'policy', document: 'terms', text, revision: 0, publish: true }), { status: 409 });
});

test('community profiles, review edits and preset exports keep private data out of public feeds', async () => {
    const { exportProtectionPreset, publishPreset, publicCommunity, personalCommunity } = await import('../src/services/siteCommunityService.js');
    assert.equal((await fetch(origin + '/api/site-bridge/site/profile')).status, 401);
    assert.equal((await signed(staff, 'site/profile', { publicName: 'Aether reviewer', bio: 'Private biography' }, 'PATCH')).status, 200);
    assert.equal((await signed(staff, 'site/community', { action: 'review', rating: 5, text: 'Helpful dashboard' })).status, 200);
    assert.equal((await signed(staff, 'site/community', { action: 'review', rating: 4, text: 'Updated review' })).status, 200);
    const reviews = await publicCommunity('reviews');
    assert.equal(reviews.count, 1);
    assert.equal(reviews.average, 4);
    assert.equal(reviews.items[0].author, 'Aether reviewer');
    assert.equal(reviews.items[0].authorId, undefined);
    assert.doesNotMatch(JSON.stringify(reviews), /Private biography/);
    assert.equal((await personalCommunity(staff)).review.id, reviews.items[0].id);
    assert.equal((await signed(staff, 'guilds/' + guildId + '/share-config', { title: 'Other server', description: 'No permission' })).status, 403);
    const privateConfig = { antiraid: { joinSpike: { enabled: true, threshold: 10, windowSeconds: 30, alertChannelId: channelId } }, whitelist: { userIds: [owner] }, serverKey: 'secret' };
    assert.deepEqual(exportProtectionPreset(privateConfig), { version: 1, protections: { antiraid: { joinSpike: { enabled: true, threshold: 10, windowSeconds: 30 } }, antinuke: {} } });
    await publishPreset(owner, { title: 'Sample preset', description: 'Test configuration' }, privateConfig);
    assert.doesNotMatch(JSON.stringify(await publicCommunity('presets')), new RegExp([guildId, owner, channelId, 'secret'].join('|')));
});

test('status observations keep only real samples within the 45-day window', async () => {
    const { mergeObservation } = await import('../src/services/siteObservations.js');
    const today = Date.parse('2026-11-23T15:00:00Z');
    let data = mergeObservation({ days: { '2026-10-09': { discord: { passed: 1, failed: 0 } } } }, today, { website: true, discord: false });
    data = mergeObservation(data, today + 1000, { discord: true, storage: null });
    assert.deepEqual(data.days, { '2026-11-23': { website: { passed: 1, failed: 0 }, discord: { passed: 1, failed: 1 } } });
});

test('website observations probe the canonical URL and refresh after the probe changes', async t => {
    const { readObservations, sampleStatus } = await import('../src/services/siteObservations.js');
    const previousOrigin = process.env.AETHER_CAD_SITE_ORIGIN;
    const previousKey = process.env.AETHER_BRIDGE_PUBLIC_KEY;
    process.env.AETHER_CAD_SITE_ORIGIN = 'https://aether.example';
    process.env.AETHER_BRIDGE_PUBLIC_KEY = 'test-key';
    t.after(() => {
        if (previousOrigin === undefined) delete process.env.AETHER_CAD_SITE_ORIGIN;
        else process.env.AETHER_CAD_SITE_ORIGIN = previousOrigin;
        if (previousKey === undefined) delete process.env.AETHER_BRIDGE_PUBLIC_KEY;
        else process.env.AETHER_BRIDGE_PUBLIC_KEY = previousKey;
    });
    const fetchProbe = t.mock.method(globalThis, 'fetch', async () => Response.json({}));
    await db.set('site:observations', { lastAt: Date.now(), days: {} });
    await sampleStatus(client);
    await sampleStatus(client);
    assert.equal(fetchProbe.mock.callCount(), 1);
    const [url, options] = fetchProbe.mock.calls[0].arguments;
    assert.equal(url, 'https://aether.example/api/config/');
    assert.equal(options.redirect, 'error');
    assert.deepEqual((await readObservations()).days.at(-1).checks.website, { passed: 1, failed: 0 });
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

test('Ed25519 bridge rejects legacy signatures, replays and modified requests', async t => {
    const pair = generateKeyPairSync('ed25519');
    process.env.AETHER_BRIDGE_PRIVATE_KEY = pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url');
    process.env.AETHER_BRIDGE_PUBLIC_KEY = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
    t.after(() => { delete process.env.AETHER_BRIDGE_PRIVATE_KEY; delete process.env.AETHER_BRIDGE_PUBLIC_KEY; });
    const url = '/api/site-bridge/site/access';
    const headers = signBridge('GET', url, owner);
    assert.match(headers['X-Aether-Signature'], /^v2\./);
    const check = (path, headers) => fetch(origin + path, { headers });
    assert.equal((await check(url + '?modified=1', headers)).status, 401);
    assert.equal((await check(url, headers)).status, 200);
    assert.equal((await check(url, headers)).status, 401);
    delete process.env.AETHER_BRIDGE_PRIVATE_KEY;
    assert.equal((await check(url, signBridge('GET', url, owner))).status, 401);
});

test('anti-nuke distinguishes elevated role grants from edits and permission removals', async () => {
    const { AuditLogEvent } = await import('discord.js');
    const { classifyAuditEntry } = await import('../src/services/security/auditCategories.js');
    const after = P.Administrator.toString();
    const role = (old, next) => ({ action: AuditLogEvent.RoleUpdate, changes: [{ key: 'permissions', old, new: next }] });
    assert.equal(classifyAuditEntry(role('0', after)), 'roleEscalation');
    assert.equal(classifyAuditEntry(role(after, '0')), null);
    assert.equal(classifyAuditEntry(role('0', P.ViewChannel.toString())), null);
    assert.equal(classifyAuditEntry(role(undefined, after)), null);
    assert.equal(classifyAuditEntry({ action: AuditLogEvent.MemberKick }), 'kickSpam');
    assert.equal(classifyAuditEntry({ action: AuditLogEvent.BotAdd }), 'botAdd');
});

test('mention bursts add distinct messages and suppress duplicates and repeated responses', async () => {
    const { trackWindow } = await import('../src/services/security/actionTracker.js');
    const first = trackWindow(null, { id: 'a', at: 1000, weight: 3 }, 1000, 12, 5, true);
    assert.equal(first.breached, false);
    assert.equal(trackWindow(first.state, { id: 'a', at: 1000, weight: 3 }, 1000, 12, 5, true).count, 3);
    const second = trackWindow(first.state, { id: 'b', at: 2000, weight: 2 }, 2000, 12, 5, true);
    assert.equal(second.breached, true);
    assert.equal(trackWindow(second.state, { id: 'c', at: 3000, weight: 2 }, 3000, 12, 5, true).breached, false);
    assert.equal(trackWindow(second.state, { id: 'd', at: 17000, weight: 1 }, 17000, 12, 5, true).count, 1);
});

test('website CAD tickets require the initiating browser cookie and only redeem once', async () => {
    const { beginWebsiteLogin, issueCadTicket, redeemCadTicket } = await import('../src/services/cad/websiteLogin.js');
    const { CadAuthService } = await import('../src/services/cad/cadAuthService.js');
    const login = beginWebsiteLogin('https://example.test');
    const state = new URL(login.url).searchParams.get('state');
    const profile = { id: owner, username: 'Test user', avatar: null };
    const ticket = issueCadTicket(state, profile, [guildId]);
    assert.ok(ticket);
    assert.equal(issueCadTicket(state, profile, [guildId]), null);
    assert.equal(redeemCadTicket(ticket, ''), null);
    const authorized = redeemCadTicket(ticket, login.cookie);
    assert.deepEqual(authorized.profile, profile);
    assert.equal(redeemCadTicket(ticket, login.cookie), null);
    const auth = new CadAuthService({ sessionSecret: 'test-only-session-secret-long-enough' });
    const session = auth.createSession(authorized.profile, authorized.guildIds);
    assert.equal(auth.configured, false);
    assert.deepEqual(auth.getSession(session.sessionCookie).guildIds, [guildId]);
});
