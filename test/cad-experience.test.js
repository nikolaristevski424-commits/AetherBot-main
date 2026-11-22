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
 assert.ok(discord.embeds[0].data.fields.some(field=>field.name==='SOURCE' && field.value==='CAD dispatch'));
 assert.ok(discord.embeds[0].data.fields.some(field=>field.name==='UNITS ASSIGNED' && field.value==='0'));
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

test('concurrent field responses retain both officers and never reopen a closed incident',async()=>{
 const guildId='51000000000000016';
 const officerA={id:'51000000000000017',username:'Alpha'};
 const officerB={id:'51000000000000018',username:'Bravo'};
 const supervisor={id:'51000000000000019',username:'Dispatcher'};
 await cad.updateCadUnit(guildId,officerA,{callsign:'1-Adam-12',status:'available'});
 await cad.updateCadUnit(guildId,officerB,{callsign:'2-Adam-03',status:'on_scene'});
 const call=await cad.createCadCall(guildId,supervisor,{title:'Roleplay traffic stop',location:'Postal 104',details:'In-game call',priority:'normal'});
 const assigned=await Promise.all([
   cad.assignCadCallUnit(guildId,officerA,call.id,officerA.id),
   cad.assignCadCallUnit(guildId,officerB,call.id,officerB.id)
 ]);
 assert.equal(assigned.every(x=>x.changed),true);
 const shared=(await cad.getCadState(guildId)).calls.find(x=>x.id===call.id);
 assert.deepEqual(new Set(shared.assignedUnitIds),new Set([officerA.id,officerB.id]));
 assert.equal(shared.status,'assigned');
 const duplicate=await cad.assignCadCallUnit(guildId,officerA,call.id,officerA.id);
 assert.equal(duplicate.changed,false);
 const closed=await cad.closeCadCall(guildId,supervisor,call.id);
 assert.equal(closed.changed,true);
 const repeat=await cad.closeCadCall(guildId,supervisor,call.id);
 assert.equal(repeat.changed,false);
 await assert.rejects(cad.assignCadCallUnit(guildId,officerB,call.id,officerB.id),/already closed/);
 const finalState=await cad.getCadState(guildId);
 const finalCall=finalState.calls.find(x=>x.id===call.id);
 assert.equal(finalCall.status,'closed');
 assert.equal(finalCall.assignedUnitIds.length,2);
 assert.equal(finalState.audit.filter(x=>x.action==='call.unit_assigned').length,2);
 assert.equal(finalState.audit.filter(x=>x.action==='call.closed').length,1);
});
test('off-duty or nonregistered units cannot join active incidents',async()=>{
 const guildId='51000000000000020';
 const officer={id:'51000000000000021',username:'Offline officer'};
 const call=await cad.createCadCall(guildId,officer,{title:'Roleplay case',location:'Postal 205',details:'',priority:'normal'});
 await assert.rejects(cad.assignCadCallUnit(guildId,officer,call.id,officer.id),/on-duty/);
 await cad.updateCadUnit(guildId,officer,{callsign:'2-Lincoln-4',status:'off_duty'});
 await assert.rejects(cad.assignCadCallUnit(guildId,officer,call.id,officer.id),/on-duty/);
 assert.deepEqual((await cad.getCadState(guildId)).calls[0].assignedUnitIds,[]);
});

test('dispatch buttons recheck current guild roles and reject revoked staff access',async()=>{
 const { default: handlers } = await import('../src/interactions/buttons/erlc/cadCallButtons.js');
 const respond=handlers.find(h=>h.name==='aether_cad_respond');
 const close=handlers.find(h=>h.name==='aether_cad_dismiss');
 assert.ok(respond&&close);
 const guildId='51000000000000030';
 const ownerId='51000000000000031';
 const officerId='51000000000000032';
 const roleId='51000000000000033';
 const outsiderId='51000000000000034';
 const owner={id:ownerId,permissions:{has:()=>true},roles:{cache:{has:()=>false}}};
 let officerHasRole=true;
 const officer={id:officerId,permissions:{has:()=>false},roles:{cache:{has:id=>id===roleId&&officerHasRole}}};
 const outsider={id:outsiderId,permissions:{has:()=>false},roles:{cache:{has:()=>false}}};
 const guild={
   id:guildId,ownerId,
   members:{cache:new Map([[ownerId,owner],[officerId,officer],[outsiderId,outsider]])},
 };
 const client={guilds:{cache:new Map([[guildId,guild]])}};
 await cad.setCadGuildConfig(guildId,{dispatchRoleIds:[roleId],experienceMode:'hybrid'});
 await cad.updateCadUnit(guildId,{id:officerId,username:'Officer'},{callsign:'1-Adam-12',status:'available'});
 const caseItem=await cad.createCadCall(guildId,{id:ownerId,username:'Dispatcher'},
    {title:'Test incident',location:'Postal 100',details:'Test roleplay call',priority:'normal'});
 function click(userId){
   const messages=[];
   const interaction={
      inGuild:()=>true,guildId,user:{id:userId,username:userId},message:{editable:false},
      async deferReply(){},async editReply(value){messages.push(value);return value;},
      async reply(value){messages.push(value);return value;},
   };
   return {interaction,messages};
 }
 const blocked=click(outsiderId);
 await respond.execute(blocked.interaction,client,[caseItem.id]);
 assert.match(String(blocked.messages.at(-1)),/dispatch role/i);
 const allowed=click(officerId);
 await respond.execute(allowed.interaction,client,[caseItem.id]);
 assert.match(String(allowed.messages.at(-1)),/assigned/i);
 officerHasRole=false;
 const revoked=click(officerId);
 await close.execute(revoked.interaction,client,[caseItem.id]);
 assert.match(String(revoked.messages.at(-1)),/dispatch role/i);
 assert.notEqual((await cad.getCadState(guildId)).calls[0].status,'closed');
 const manager=click(ownerId);
 await close.execute(manager.interaction,client,[caseItem.id]);
 assert.equal((await cad.getCadState(guildId)).calls[0].status,'closed');
});

test('simultaneous CAD configuration edits preserve roles, channel and preferred interface',async()=>{
 const id='51000000000000040';
 await Promise.all([
   cad.setCadGuildConfig(id,{experienceMode:'discord'}),
   cad.setCadGuildConfig(id,{dispatchChannelId:'51000000000000041'}),
   cad.setCadGuildConfig(id,{dispatchRoleIds:['51000000000000042']}),
   cad.setCadGuildConfig(id,{commandRoleIds:['51000000000000043']}),
 ]);
 const config=await cad.getCadGuildConfig(id);
 assert.equal(config.experienceMode,'discord');
 assert.equal(config.dispatchChannelId,'51000000000000041');
 assert.deepEqual(config.dispatchRoleIds,['51000000000000042']);
 assert.deepEqual(config.commandRoleIds,['51000000000000043']);
});
