import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.NODE_ENV='test';
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'aether-mdt-tests-'));
const db=await import('../src/utils/database/wrapper.js');
await db.initializeDatabase();
const mdt=await import('../src/services/cad/mdtService.js');
const actor={id:'12345678901234567',username:'MDT Test'};
process.on('exit',()=>rmSync(process.env.DATA_DIR,{recursive:true,force:true}));

test('record CRUD survives concurrent writes and does not leak across guilds',async()=>{
 const guild='70000000000000001';
 const [p,v]=await Promise.all([
  mdt.createMdtRecord(guild,actor,{kind:'person',subject:'Jane Character',robloxUsername:'Jane_Player',notes:'Fictional witness'}),
  mdt.createMdtRecord(guild,actor,{kind:'vehicle',subject:'Blue coupe',plate:'AB-223',description:'Blue car'}),
 ]);
 assert.equal((await mdt.getMdtState(guild)).records.length,2);
 assert.equal((await mdt.getMdtState('70000000000000002')).records.length,0);
 assert.equal((await mdt.searchMdt(guild,'ab-223')).records[0].id,v.id);
 assert.equal((await mdt.updateMdtRecord(guild,actor,p.id.slice(0,8),{notes:'Fictional updated'})).notes,'Fictional updated');
 assert.equal((await mdt.archiveMdtRecord(guild,actor,p.id)).status,'archived');
 assert.equal((await mdt.searchMdt(guild,'Jane')).records.length,0);
 assert.ok((await mdt.getMdtState(guild)).audit.length>=4);
});
test('BOLO expiry and manual clearing persist per guild',async()=>{
 const guild='70000000000000003';
 const bolo=await mdt.createMdtBolo(guild,actor,{kind:'vehicle',subject:'White fictional sedan',details:'Reported in roleplay at the city bank',location:'Postal 205',expiresInHours:1});
 assert.equal((await mdt.searchMdt(guild,'sedan')).bolos.length,1);
 assert.equal((await mdt.clearMdtBolo(guild,actor,bolo.id.slice(0,8))).status,'cleared');
 assert.equal((await mdt.searchMdt(guild,'sedan')).bolos.length,0);
});
test('calibration keeps map transform separate for each Discord server',async()=>{
 const guild='70000000000000004';
 const anchors=[
  {worldX:0,worldZ:0,mapX:15,mapY:25,label:'Police station'},
  {worldX:2000,worldZ:0,mapX:55,mapY:25,label:'Hospital'},
  {worldX:0,worldZ:2000,mapX:15,mapY:65,label:'Highway'},
 ];
 const result=await mdt.setMdtCalibration(guild,actor,anchors);
 assert.equal(result.anchors.length,3);
 assert.ok(result.transform.rmsErrorPercent<.001);
 assert.equal((await mdt.getMdtState(guild)).calibration.length,3);
 assert.equal((await mdt.getMdtState('70000000000000005')).calibration.length,0);
 await assert.rejects(()=>mdt.setMdtCalibration(guild,actor,[...anchors,{worldX:1000,worldZ:1000,mapX:99,mapY:99}]),/disagree/);
 assert.equal((await mdt.getMdtState(guild)).calibration.length,3);
});
