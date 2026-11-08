import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInvite, normalizeListing, bumpEligibility, visibleListings } from '../bot/core.js';
import { ListingStore } from '../bot/store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const guildId='123456789012345678',ownerId='234567890123456789';
test('rejects malicious and malformed invite hosts',()=>{
 assert.throws(()=>normalizeInvite('https://discord.gg.evil.example/hello'));
 assert.throws(()=>normalizeInvite('http://discord.gg/hello'));
 assert.equal(normalizeInvite('https://discord.com/invite/abc123?utm_source=test'),'https://discord.gg/abc123');
});
test('listing schema validation and sanitation',()=>{
 const x=normalizeListing({guildId,title:'Good server',description:'A community for casual roleplay members and friends.',category:'roleplay',invite:'https://discord.gg/abc123'});
 assert.equal(x.title,'Good server');
 assert.throws(()=>normalizeListing({...x,category:'invalid'}));
});
test('approval and cooldown gates',()=>{
 assert.equal(bumpEligibility({status:'pending'},100).ok,false);
 assert.equal(bumpEligibility({status:'approved',lastBumpAt:0},8_000_000).ok,true);
 assert.equal(bumpEligibility({status:'approved',lastBumpAt:8_000_000},8_000_050).ok,false);
});
test('directory only shows approved listings',()=>{
 const sorted=visibleListings([{status:'pending',guildId:'1'},{status:'approved',guildId:'2',lastBumpAt:50},{status:'approved',guildId:'3',lastBumpAt:100}]);
 assert.deepEqual(sorted.map(x=>x.guildId),['3','2']);
});
test('store persists, queues and bumps safely',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'advertisehere-'));
 try {
  const path=join(dir,'listings.json');const s=new ListingStore(path,10_000);await s.load();
  const l=await s.upsert({guildId,title:'Test Server',description:'This is a community listing for AdvertiseHERE.',category:'gaming',invite:'https://discord.gg/abcdef'},ownerId,{memberCount:25});
  assert.equal(l.status,'pending');
  assert.equal((await s.bump(guildId)).ok,false);
  await s.moderate(guildId,'approved',ownerId);
  const [a,b]=await Promise.all([s.bump(guildId),s.bump(guildId)]);
  assert.equal([a.ok,b.ok].filter(Boolean).length,1);
  const t=new ListingStore(path);await t.load();assert.equal(t.get(guildId).bumpCount,1);
 }finally {await rm(dir,{recursive:true,force:true});}
});
