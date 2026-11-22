import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import login from '../api/auth/login.js';
import callback from '../api/auth/callback.js';
import { seal, cookieNames, session } from '../lib/auth.js';

const keys=['AETHER_SITE_ORIGIN','AETHER_SESSION_SECRET','AETHER_DISCORD_CLIENT_ID','AETHER_DISCORD_CLIENT_SECRET'];
const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
process.env.AETHER_SITE_ORIGIN='https://aetherbot-hq.vercel.app';
process.env.AETHER_SESSION_SECRET='test-only-session-encryption-key-32-plus-chars';
process.env.AETHER_DISCORD_CLIENT_ID='1528192052393808022';
process.env.AETHER_DISCORD_CLIENT_SECRET='test-discord-oauth-client-secret';
after(()=>{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});

function response(){
 return {
   statusCode:200,headers:{},
   setHeader(k,v){this.headers[k.toLowerCase()]=v;},
   getHeader(k){return this.headers[k.toLowerCase()];},
   writeHead(status,headers={}){this.statusCode=status;for(const [k,v] of Object.entries(headers))this.setHeader(k,v);return this;},
   end(v){this.body=v;return this;}
 };
}
test('OAuth initiated from an alias redirects to canonical hostname before issuing state cookie',()=>{
 const res=response();
 login({method:'GET',headers:{host:'aetherbot-hq-nitronik2434.vercel.app'},query:{next:'/dashboard/'}},res);
 assert.equal(res.statusCode,302);
 assert.equal(res.getHeader('location'),'https://aetherbot-hq.vercel.app/api/auth/login?next=%2Fdashboard%2F');
 assert.equal(res.getHeader('set-cookie'),undefined);
});
test('OAuth provider callback exactly matches the configured Discord redirect',()=>{
 const res=response();
 login({method:'GET',headers:{host:'aetherbot-hq.vercel.app'},query:{next:'/dashboard/'}},res);
 assert.equal(res.statusCode,302);
 const target=new URL(res.getHeader('location'));
 assert.equal(target.hostname,'discord.com');
 assert.equal(target.searchParams.get('redirect_uri'),'https://aetherbot-hq.vercel.app/api/auth/callback');
 assert.equal(target.searchParams.get('scope'),'identify');
 assert.match(res.getHeader('set-cookie'),/^__Host-aether_oauth=/);
 assert.match(res.getHeader('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
});
test('Invalid state is rejected before a Discord token exchange',async()=>{
 const res=response();
 await callback({method:'GET',query:{state:'wrong',code:'sample'},headers:{cookie:''}},res);
 assert.equal(res.statusCode,302);
 assert.equal(res.getHeader('location'),'/login/?error=state');
});
test('Rejected Discord OAuth credentials show a safe diagnostic without leaking tokens',async()=>{
 const state='signed-login-state',res=response(),original=globalThis.fetch;
 const cookie=cookieNames.STATE+'='+seal({state,next:'/dashboard/',expiresAt:Date.now()+60000},'oauth');
 globalThis.fetch=async()=>({ok:false,status:401});
 try{
  await callback({method:'GET',query:{state,code:'authorization-code'},headers:{cookie}},res);
  assert.equal(res.statusCode,302);
  assert.equal(res.getHeader('location'),'/login/?error=credentials');
  assert.ok(!JSON.stringify(res.headers).includes('authorization-code'));
 }finally{globalThis.fetch=original;}
});
test('Successful callback preserves both cookies and does not expose OAuth tokens',async()=>{
 const state='valid-login-state',res=response(),original=globalThis.fetch;
 const cookie=cookieNames.STATE+'='+seal({state,next:'/dashboard/',expiresAt:Date.now()+60000},'oauth');
 const visits=[];
 globalThis.fetch=async(url)=>{
  visits.push(url);
  if(url.endsWith('/oauth2/token'))return {ok:true,status:200,json:async()=>({access_token:'secret-token-only-on-server'})};
  if(url.endsWith('/users/@me'))return {ok:true,status:200,json:async()=>({id:'1528192052393808022',username:'TestUser'})};
  throw Error('unexpected URL');
 };
 try{
  await callback({method:'GET',query:{state,code:'authorization-code'},headers:{cookie}},res);
  assert.equal(res.getHeader('location'),'/dashboard/');
  assert.deepEqual(visits,['https://discord.com/api/v10/oauth2/token','https://discord.com/api/v10/users/@me']);
  const cookies=res.getHeader('set-cookie');
  assert.ok(Array.isArray(cookies)&&cookies.length===2);
  assert.match(cookies[0],/__Host-aether_oauth=;/);
  assert.match(cookies[1],/__Host-aether_session=/);
  assert.ok(!JSON.stringify(cookies).includes('secret-token-only-on-server'));
  assert.equal(session({headers:{cookie:cookies[1]}})?.userId,'1528192052393808022');
 }finally{globalThis.fetch=original;}
});
