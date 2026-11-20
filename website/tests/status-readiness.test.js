import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/status.js';

const keys=['AETHER_BOT_ORIGIN','AETHER_BRIDGE_SECRET','AETHER_SITE_ORIGIN','AETHER_SESSION_SECRET','AETHER_DISCORD_CLIENT_ID','AETHER_DISCORD_CLIENT_SECRET'];
const originals=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
after(()=>{for(const [k,v] of Object.entries(originals)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
process.env.AETHER_BOT_ORIGIN='https://test-aether.example';
process.env.AETHER_BRIDGE_SECRET='test-only-hmac-32-character-bridge-secret';
process.env.AETHER_SITE_ORIGIN='https://test-site.example';
process.env.AETHER_SESSION_SECRET='test-only-aether-session-secret-32-characters';
process.env.AETHER_DISCORD_CLIENT_ID='1528192052393808022';
process.env.AETHER_DISCORD_CLIENT_SECRET='test-only-oauth-client-secret';

function response(){
 return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.data=JSON.parse(value);}};
}

test('health reachable and Discord/database ready are separate checks',async()=>{
 const original=globalThis.fetch;
 const paths=[];
 globalThis.fetch=async(url,options)=>{
  paths.push(new URL(url).pathname);
  assert.equal(options.redirect,'manual');
  if(url.endsWith('/health'))return {ok:true,status:200,json:async()=>({uptime:7543,status:'healthy'})};
  if(url.endsWith('/ready'))return {ok:true,status:200,json:async()=>({ready:true})};
  throw new Error('unexpected path');
 };
 try{
  const res=response();await handler({method:'GET'},res);
  assert.equal(res.data.bot,'reachable');
  assert.equal(res.data.readiness,'ready');
  assert.equal(res.data.processUptimeSeconds,7543);
  assert.deepEqual(paths,['/health','/ready']);
 }finally{globalThis.fetch=original;}
});

test('healthy HTTP process does not imply Discord readiness',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>url.endsWith('/health')?
  {ok:true,status:200,json:async()=>({uptime:56})}:
  {ok:false,status:503,json:async()=>({ready:false})};
 try{
  const res=response();await handler({method:'GET'},res);
  assert.equal(res.data.bot,'reachable');
  assert.equal(res.data.readiness,'not_ready');
  assert.equal(res.data.processUptimeSeconds,56);
 }finally{globalThis.fetch=original;}
});

test('unreachable HTTPS reports unknown readiness, not fictitious downtime',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error('connection unavailable');};
 try{
  const res=response();await handler({method:'GET'},res);
  assert.equal(res.data.bot,'unreachable');
  assert.equal(res.data.readiness,'unknown');
  assert.equal(res.data.processUptimeSeconds,null);
 }finally{globalThis.fetch=original;}
});

test('status response does not reveal environment secrets',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({status:'healthy',uptime:10,serverKey:'DO_NOT_EXPOSE',token:'DO_NOT_EXPOSE'})});
 try{
  const res=response();await handler({method:'GET'},res);
  assert.equal(res.data.readiness,'unknown');
  assert.ok(!JSON.stringify(res.data).includes('DO_NOT_EXPOSE'));
 }finally{globalThis.fetch=original;}
});
