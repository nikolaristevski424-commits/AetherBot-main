import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectWorldToMap, normalizeErlc911, validate911Input, findCallByReference } from '../src/services/cad/dispatchCore.js';

test('map centre and axis direction match ER:LC v2 docs', () => {
  assert.deepEqual(projectWorldToMap(0, 0), { xPercent: 50, yPercent: 50 });
  assert.equal(projectWorldToMap(100, 0).xPercent > 50, true);
  assert.equal(projectWorldToMap(0, -100).yPercent < 50, true);
  assert.equal(projectWorldToMap(3000, 0), null);
  assert.equal(projectWorldToMap(NaN, 0), null);
});
test('validate roleplay 911 report and optional coordinate pairs', () => {
  const basic = validate911Input({ title: 'Crash at bridge', location: 'Postal 218', details: 'Vehicle accident, medical requested.' });
  assert.equal(basic.positionX, undefined);
  assert.throws(() => validate911Input({ ...basic, x: 1 }), /both/);
  const withPos = validate911Input({ ...basic, x: -300, z: 400 });
  assert.equal(withPos.positionZ, 400);
  assert.throws(() => validate911Input({ ...basic, details: '' }), /details/);
});
test('normalize v2 in-game 911 calls with map location', () => {
  const call = normalizeErlc911({ CallNumber: 400, StartedAt: Math.floor(Date.now()/1000), Description: 'Collision at intersection', PositionDescriptor: 'Postal 403', Position: [-654.6,666.5], Team: 'Police', Caller: 123456789 });
  assert.equal(call.externalCallNumber, 400);
  assert.equal(call.location, 'Postal 403');
  assert.equal(call.positionX, -654.6);
  assert.match(call.externalKey, /^400:/);
  assert.equal(normalizeErlc911({CallNumber:400}), null);
});
test('case references accept unique prefixes only', () => {
 const calls=[{id:'abcd1234-1111-2222-3333-444444444444'},{id:'ffff5678-1111-2222-3333-444444444444'}];
 assert.equal(findCallByReference(calls,'abcd1234').id,calls[0].id);
 assert.equal(findCallByReference(calls,'abcd'),null);
});
