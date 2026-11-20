import { test } from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../api/gateway.js';
import { seal, cookieNames } from '../lib/auth.js';

const envKeys=['AETHER_SITE_ORIGIN','AETHER_SESSION_SECRET','AETHER_BOT_ORIGIN','AETHER_BRIDGE_SECRET'];
const original=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
const setup=()=>{
 process.env.AETHER_SITE_ORIGIN='https://aether-test.example';
 process.env.AETHER_SESSION_SECRET='test-only-site-operations-encryption-32-char-key';
 process.env.AETHER_BOT_ORIGIN='https://bot.example.test';
 process.env.AETHER_BRIDGE_SECRET='test-only-bridge-authentication-32-char-key';
};
function request(route,method='GET',body=null,origin='https://aether-test.example'){
 const cookie=seal({userId:'1528192052393808022',username:'Tester',expiresAt:Date.now()+60000},'session');
 return {method,query:{route},body,headers:{cookie:cookieNames.SESSION+'='+cookie,origin}};
}
async function invoke(req){
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(v){this.body=JSON.parse(v);}};
 await gateway(req,res);return res;
}
test('operations route whitelist and signed relay',async()=>{
 setup();
 const prev=globalThis.fetch;let called=null;
 globalThis.fetch=async (url,options)=>{
  called={url,options};
  return {status:200,text:async()=>JSON.stringify({ok:true})};
 };
 try{
  const res=await invoke(request('guilds/1528192052393808022/erlc/players'));
  assert.equal(res.statusCode,200);
  assert.equal(res.body.ok,true);
  assert.equal(called.url,'https://bot.example.test/api/site-bridge/guilds/1528192052393808022/erlc/players');
  assert.match(called.options.headers['X-Aether-Signature'],/^[A-Za-z0-9_-]+$/);
  assert.equal(called.options.redirect,'manual');
  const mod=await invoke(request('guilds/1528192052393808022/erlc/moderate','POST',{action:'kick',player:'TestPlayer',reason:'Test violation'}));
  assert.equal(mod.statusCode,200);
  assert.equal(called.options.method,'POST');
  assert.match(called.options.body,/"TestPlayer"/);
  const config=await invoke(request('guilds/1528192052393808022/cad/config','PATCH',{dispatchRoleIds:[],commandRoleIds:[],dispatchChannelId:null}));
  assert.equal(config.statusCode,200);
 }finally{
  globalThis.fetch=prev;
  for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
test('operations routes reject cross-origin mutations and arbitrary game commands',async()=>{
 setup();
 try{
  const csrf=await invoke(request('guilds/1528192052393808022/erlc/moderate','POST',{action:'ban',player:'TestPlayer',reason:'Test'},'https://evil.example'));
  assert.equal(csrf.statusCode,403);
  const unlisted=await invoke(request('guilds/1528192052393808022/erlc/command','POST',{command:':ban all'}));
  assert.equal(unlisted.statusCode,404);
  const unknown=await invoke(request('guilds/1528192052393808022/../../../secrets'));
  assert.equal(unknown.statusCode,404);
 }finally{
  for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
