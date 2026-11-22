import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV='test';
process.env.CAD_REDIRECT_URI='https://aether.wispbyte.app/cad/auth/callback';
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'aether-experience-'));
process.on('exit',()=>rmSync(process.env.DATA_DIR,{recursive:true,force:true}));
const { initializeDatabase }=await import('../src/utils/database/wrapper.js');
const cad=await import('../src/services/cad/cadService.js');
const {buildCadCallAnnouncement,buildBoloAlert,buildMdtLookupEmbeds,cadWebUrl}=await import('../src/services/cad/cadDiscordPresentation.js');
await initializeDatabase();

test('existing servers default to Hybrid and preference is per-guild and persistent',async()=>{
 const a='51000000000000001',b='51000000000000002';
 assert.equal((await cad.getCadGuildConfig(a)).experienceMode,'hybrid');
 await cad.setCadGuildConfig(a,{experienceMode:'discord',dispatchRoleIds:['51000000000000003']});
 assert.equal((await cad.getCadGuildConfig(a)).experienceMode,'discord');
 assert.equal((await cad.getCadGuildConfig(b)).experienceMode,'hybrid');
 await cad.setCadGuildConfig(a,{experienceMode:'web'});
 const saved=await cad.getCadGuildConfig(a);
 assert.equal(saved.experienceMode,'web');
 assert.deepEqual(saved.dispatchRoleIds,['51000000000000003']);
 await assert.rejects(cad.setCadGuildConfig(a,{experienceMode:'unknown'}),/CAD experience/);
 assert.equal((await cad.getCadGuildConfig(a)).experienceMode,'web');
});

test('panic alerts are atomic, shared with the normal dispatch queue and rate limited',async()=>{
 const guildId='51000000000000004',actor={id:'51000000000000005',username:'Officer'};
 const body={title:'Panic / unit 1',location:'Liberty County postal 203',details:'Officer requires roleplay assistance',priority:'urgent',source:'cad_panic'};
 const results=await Promise.allSettled([cad.createCadCall(guildId,actor,body),cad.createCadCall(guildId,actor,body)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 const state=await cad.getCadState(guildId);
 assert.equal(state.calls.length,1);
 assert.equal(state.calls[0].source,'cad_panic');
 assert.equal(state.calls[0].priority,'urgent');
 assert.equal(state.calls[0].status,'open');
 assert.equal(state.audit.filter(x=>x.action==='call.created').length,1);
});

test('Discord call alerts carry real action IDs, and Web mode only links to CAD',()=>{
 const call={id:'12345678-1234-1234-1234-123456789abc',title:'Panic button',location:'Postal 203',details:'Fictional test',
   priority:'urgent',status:'open',createdByName:'Officer',createdAt:Date.now()};
 const discord=buildCadCallAnnouncement(call,{experienceMode:'discord'});
 const web=buildCadCallAnnouncement(call,{experienceMode:'web'});
 const hybrid=buildCadCallAnnouncement(call,{experienceMode:'hybrid'});
 assert.deepEqual(discord.allowedMentions,{parse:[]});
 assert.equal(discord.embeds[0].data.title,'PANIC / HIGH-PRIORITY DISPATCH');
 assert.equal(discord.components[0].toJSON().components.length,2);
 assert.equal(web.components[0].toJSON().components.length,1);
 assert.equal(hybrid.components[0].toJSON().components.length,3);
 assert.ok(hybrid.components[0].toJSON().components.some(x=>x.custom_id?.includes('aether_cad_respond:')));
 assert.equal(cadWebUrl(),'https://aether.wispbyte.app/cad/');
 assert.equal(cadWebUrl('mdt'),'https://aether.wispbyte.app/cad/?view=mdt');
 const closed=buildCadCallAnnouncement({...call,status:'closed'},{experienceMode:'discord'});
 assert.equal(closed.components.length,0);
});

test('civilian and BOLO embeds distinguish warning from ordinary records',()=>{
 const records=[{id:'abcd1234-1234-1234-1234-123456789abc',kind:'person',subject:'Example Character',notes:'Roleplay-only data',plate:''}];
 const bolos=[{id:'55555555-1234-1234-1234-123456789abc',subject:'Example Character',details:'Fleeing from law enforcement',location:'Postal 102',priority:'urgent'}];
 const embeds=buildMdtLookupEmbeds({query:'example',records,bolos});
 assert.equal(embeds.length,2);
 assert.match(embeds[0].data.title,/ACTIVE BOLO/);
 assert.match(embeds[1].data.title,/Civilian lookup/);
 const alert=buildBoloAlert({...bolos[0],kind:'person',createdAt:Date.now()},{experienceMode:'hybrid'});
 assert.match(alert.embeds[0].data.title,/ACTIVE BOLO/);
 assert.deepEqual(alert.allowedMentions,{parse:[]});
 assert.equal(alert.components.length,1);
});
