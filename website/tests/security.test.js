import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal, session, sessionKey, configuredOrigin, loginReady, cookieNames } from '../lib/auth.js';
import { requestSignature, signBridge, botOrigin, bridgeReady } from '../lib/bridge.js';

const before = Object.fromEntries(['AETHER_SITE_ORIGIN','AETHER_SESSION_SECRET','AETHER_DISCORD_CLIENT_ID','AETHER_DISCORD_CLIENT_SECRET','AETHER_BOT_ORIGIN','AETHER_BRIDGE_SECRET'].map(k=>[k,process.env[k]]));
after(()=>{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
process.env.AETHER_SITE_ORIGIN='https://aether-hq.vercel.app';
process.env.AETHER_SESSION_SECRET='test-only-aether-session-secret-at-least-32-chars';
process.env.AETHER_DISCORD_CLIENT_ID='1528192052393808022';
process.env.AETHER_DISCORD_CLIENT_SECRET='test-only-discord-client-secret';
process.env.AETHER_BOT_ORIGIN='https://bot.example.test';
process.env.AETHER_BRIDGE_SECRET='test-only-shared-hmac-secret-with-32-chars';

test('OAuth origin is pinned to the configured HTTPS host',()=>{
 assert.equal(configuredOrigin(),'https://aether-hq.vercel.app');
 assert.equal(loginReady(),true);
 process.env.AETHER_SITE_ORIGIN='http://aether-hq.vercel.app';
 assert.equal(configuredOrigin(),null);
 process.env.AETHER_SITE_ORIGIN='https://aether-hq.vercel.app';
});
test('AES-GCM sealed sessions round trip and detect tampering',()=>{
 const payload={userId:'1528192052393808022',username:'Test Officer',expiresAt:Date.now()+30000};
 const sealed=seal(payload,'session');
 assert.deepEqual(unseal(sealed,'session'),payload);
 const [iv,encryptedPayload,tag]=sealed.split('.');
 const tamperedTag=(tag[0]==='A'?'B':'A')+tag.slice(1);
 assert.equal(unseal([iv,encryptedPayload,tamperedTag].join('.'),'session'),null);
 assert.equal(unseal(sealed,'oauth'),null);
 assert.equal(sessionKey().length,32);
});
test('Session accepts only unexpired server-issued cookie',()=>{
 const payload={userId:'1528192052393808022',username:'Officer',expiresAt:Date.now()+120000};
 const cookie=`${cookieNames.SESSION}=${seal(payload,'session')}`;
 assert.equal(session({headers:{cookie}})?.userId,payload.userId);
 const expired=`${cookieNames.SESSION}=${seal({...payload,expiresAt:Date.now()-5},'session')}`;
 assert.equal(session({headers:{cookie:expired}}),null);
});
test('Bot origin is HTTPS-only and not client controlled',()=>{
 assert.equal(botOrigin(),'https://bot.example.test');
 assert.equal(bridgeReady(),true);
 process.env.AETHER_BOT_ORIGIN='http://bot.example.test';
 assert.equal(botOrigin(),null);
 process.env.AETHER_BOT_ORIGIN='https://bot.example.test:13017';
 assert.equal(botOrigin(),null);
 process.env.AETHER_BOT_ORIGIN='https://bot.example.test';
});
test('Bridge signing covers method, URL, body, time, nonce and user',()=>{
 const sig=signBridge('POST','/api/site-bridge/guilds/123456789123456789/cad/calls','1528192052393808022','{"title":"Call"}');
 assert.equal(requestSignature({method:'POST',path:'/api/site-bridge/guilds/123456789123456789/cad/calls',userId:sig['X-Aether-User'],timestamp:sig['X-Aether-Time'],nonce:sig['X-Aether-Nonce'],body:'{"title":"Call"}'}),sig['X-Aether-Signature']);
 assert.notEqual(requestSignature({method:'POST',path:'/api/site-bridge/guilds/123456789123456789/cad/calls',userId:sig['X-Aether-User'],timestamp:sig['X-Aether-Time'],nonce:sig['X-Aether-Nonce'],body:'{"title":"Altered"}'}),sig['X-Aether-Signature']);
});
