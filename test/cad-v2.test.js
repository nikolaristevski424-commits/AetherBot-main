import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDirectory = mkdtempSync(path.join(os.tmpdir(), 'aether-cad-v2-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDirectory;
process.env.POSTGRES_URL = '';
process.env.DATABASE_URL = '';
process.env.POSTGRES_HOST = '';
after(() => rmSync(dataDirectory, { recursive: true, force: true }));
const { initializeDatabase } = await import('../src/utils/database/wrapper.js');
const cad = await import('../src/web/cadV2Service.js');
await initializeDatabase();
const guild = '12345678901234567';
const dispatcher = { id: '23456789012345678', username: 'Dispatcher' };
const second = { id: '34567890123456789', username: 'Unit two' };

test('CAD v2 separates state from legacy, creates and updates incidents', async () => {
  const start = await cad.getCadV2State(guild);
  assert.deepEqual(start.incidents, []);
  const incident = await cad.createV2Incident(guild, dispatcher, {
    title: 'Vehicle collision', location: 'Postal 204', details: 'Road blocked', priority: 'critical',
  });
  assert.match(incident.reference, /^AE-[A-F0-9]{8}$/);
  assert.equal(incident.status, 'pending');
  await assert.rejects(cad.updateV2Incident(guild, dispatcher, incident.id, { assignedUnitIds: [second.id] }), /on-duty/);
  await cad.updateV2Unit(guild, second, { callsign: '1-Adam-12', status: 'available' });
  await cad.updateV2Incident(guild, dispatcher, incident.id, { status: 'dispatched', assignedUnitIds: [second.id] });
  await cad.updateV2Incident(guild, dispatcher, incident.id, { status: 'closed' });
  const state = await cad.getCadV2State(guild);
  assert.equal(state.incidents[0].status, 'closed');
  assert.ok(Number.isFinite(state.incidents[0].closedAt));
  assert.deepEqual(state.incidents[0].assignedUnitIds, [second.id]);
  assert.equal(state.units[0].callsign, '1-Adam-12');
  assert.ok(state.audit.length >= 4);
});
test('CAD v2 rejects invalid user input', async () => {
  await assert.rejects(cad.createV2Incident(guild, dispatcher, { title: '', location: 'A' }), /valid/);
  await assert.rejects(cad.updateV2Unit(guild, dispatcher, { callsign: 'A', status: 'flying' }), /valid/);
  await assert.rejects(cad.createV2Bolo(guild, dispatcher, { subject: 'A', description: '' }), /valid/);
});
test('CAD v2 creates and archives BOLO notices', async () => {
  const bolo = await cad.createV2Bolo(guild, dispatcher, {
    subject: 'Blue sedan', description: 'Vehicle description for roleplay patrol',
  });
  assert.equal(bolo.active, true);
  const archived = await cad.archiveV2Bolo(guild, dispatcher, bolo.id);
  assert.equal(archived.active, false);
  assert.ok(archived.archivedAt);
});
test('CAD v2 serializes concurrent writes on same process', async () => {
  const concurrentGuild = '45678901234567890';
  await Promise.all(Array.from({ length: 12 }, (_, n) => cad.createV2Incident(concurrentGuild, dispatcher, {
    title: 'Incident ' + n, location: 'Postal ' + n, priority: 'routine',
  })));
  const state = await cad.getCadV2State(concurrentGuild);
  assert.equal(state.incidents.length, 12);
  assert.equal(state.revision, 12);
});
