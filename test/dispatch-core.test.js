import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectWorldToMap, normalizeErlc911, validate911Input, findCallByReference, projectDispatchActivity, projectCadGuildState } from '../src/services/cad/dispatchCore.js';

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

test('public dispatch history never exposes administrative audit details or command text', () => {
 const audit = [
  {id:'a',action:'erlc.command',at:1,actorName:'Admin',details:{command:':ban ExampleUser private reason'}},
  {id:'b',action:'call.created',at:2,actorName:'Dispatcher',details:{callId:'12345678-aaaa-bbbb-cccc-dddddddddddd',title:'Private notes',secret:'do not leak'}},
  {id:'c',action:'call.unit_assigned',at:3,actorName:'Officer',details:{callId:'12345678-aaaa-bbbb-cccc-dddddddddddd',userId:'should-not-be-exposed'}},
  {id:'d',action:'auth.failed',at:4,actorName:'System',details:{session:'private-session-token'}},
 ];
 const safe=projectDispatchActivity(audit);
 assert.equal(safe.length,2);
 assert.equal(safe[0].action,'call.unit_assigned');
 assert.equal(safe[1].callId,'12345678');
 const plain=JSON.stringify(safe);
 assert.ok(!plain.includes(':ban'));
 assert.ok(!plain.includes('Private notes'));
 assert.ok(!plain.includes('should-not-be-exposed'));
 assert.ok(!plain.includes('private-session-token'));
 assert.deepEqual(projectDispatchActivity(null),[]);
 assert.equal(projectDispatchActivity(audit,1).length,1);
});

test('CAD API state projection protects calls and internal sync keys from command-only roles',()=>{
 const state={
   calls:[{id:'sensitive-call'}],units:[{userId:'unit'}],players:[{player:'RoleplayPlayer'}],
   staff:[{username:'Staff'}],playerEvents:[{type:'joined'}],
   playerSyncAt:123456,serverOnline:true,audit:[{secret:'private'}],
   erlc911Keys:['dedupe-marker'],joinLogKeys:['sync-internal'],
 };
 const commands=projectCadGuildState(state,{commands:true,dispatch:false,manager:false});
 assert.deepEqual(commands.calls,[]);
 assert.deepEqual(commands.units,[]);
 assert.equal(commands.players[0].player,'RoleplayPlayer');
 assert.deepEqual(commands.audit,[]);
 assert.equal(Object.hasOwn(commands,'erlc911Keys'),false);
 assert.equal(Object.hasOwn(commands,'joinLogKeys'),false);
 const dispatcher=projectCadGuildState(state,{dispatch:true});
 assert.equal(dispatcher.calls.length,1);
 assert.equal(dispatcher.audit.length,0);
 const manager=projectCadGuildState(state,{manager:true});
 assert.equal(manager.calls.length,1);
 assert.equal(manager.audit.length,1);
 assert.equal(Object.hasOwn(manager,'erlc911Keys'),false);
});
