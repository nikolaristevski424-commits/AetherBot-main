import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMdtRecord,normalizeMdtBolo,isBoloActive,filterMdtRecords,resolveMdtReference,fitMapCalibration,validateMapAnchors,projectMdtPosition} from '../src/services/cad/mdtCore.js';

test('fictional person and vehicle records validate and trim',()=>{
 const person=normalizeMdtRecord({kind:'person',subject:'  Jane Character ',robloxUsername:'Player_123',notes:'Witness at postal 201'});
 assert.equal(person.subject,'Jane Character');assert.equal(person.robloxUsername,'Player_123');
 assert.equal(normalizeMdtRecord({kind:'vehicle',subject:'Green truck',plate:' abc 123 '}).plate,'ABC 123');
 assert.throws(()=>normalizeMdtRecord({kind:'vehicle',subject:'Truck'}),/plate/);
 assert.throws(()=>normalizeMdtRecord({kind:'person',subject:'Joe',robloxUsername:'bad username'}),/username/);
});
test('BOLOs expire and are only active before expiry',()=>{
 const t=1_800_000_000_000;
 const b={...normalizeMdtBolo({kind:'person',subject:'Wanted character',details:'Fictional robbery suspect in game',expiresInHours:2},t),status:'active'};
 assert.equal(isBoloActive(b,t+1000),true); assert.equal(isBoloActive(b,t+7_200_000),false);
 assert.throws(()=>normalizeMdtBolo({kind:'vehicle',subject:'Car',details:'Example details',expiresInHours:999}),/expiry/);
});
test('record search and unique prefix resolution exclude archived entries',()=>{
 const items=[{id:'1234abcd-1234',subject:'Alex Doe',notes:'Fire station',status:'active'}, {id:'abcdef12-4567',subject:'Car',plate:'ABC 234',status:'archived'}];
 assert.equal(filterMdtRecords(items,'fire').length,1);assert.equal(filterMdtRecords(items,'ABC 234').length,0);
 assert.equal(resolveMdtReference(items,'1234abcd').subject,'Alex Doe');assert.equal(resolveMdtReference(items,'nope'),null);
});
test('three known landmarks calibrate affine translation, rotation and scale',()=>{
 const points=[{worldX:0,worldZ:0,mapX:30,mapY:20},{worldX:1000,worldZ:0,mapX:50,mapY:30},{worldX:0,worldZ:1000,mapX:20,mapY:50}];
 const {transform}=validateMapAnchors(points);const p=projectMdtPosition(500,500,transform);
 assert.ok(Math.abs(p.x-35)<.00001);assert.ok(Math.abs(p.y-40)<.00001);
 assert.ok(transform.rmsErrorPercent<.001);
 assert.equal(fitMapCalibration([points[0],points[0],points[0]]),null);
});
test('more than three landmarks detect wrong calibration points',()=>{
 const points=[{worldX:0,worldZ:0,mapX:20,mapY:20},{worldX:1000,worldZ:0,mapX:40,mapY:20},{worldX:0,worldZ:1000,mapX:20,mapY:40},{worldX:1000,worldZ:1000,mapX:90,mapY:90}];
 assert.throws(()=>validateMapAnchors(points),/disagree/);
 assert.equal(projectMdtPosition(10**10,10**10),null);
});
