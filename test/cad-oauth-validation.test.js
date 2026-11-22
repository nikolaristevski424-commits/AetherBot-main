import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CadAuthService } from '../src/services/cad/cadAuthService.js';

const base={clientId:'1528192052393808022',clientSecret:'test-discord-oauth-secret',redirectUri:'https://aether.wispbyte.app/cad/auth/callback',sessionSecret:'test-cad-session-encryption-32-character-key',secureCookies:true};
test('Wispbyte CAD login accepts exact dedicated callback',()=>{
 const service=new CadAuthService(base);
 assert.equal(service.configured,true);
 const login=service.beginLogin();
 const authorize=new URL(login.url);
 assert.equal(authorize.searchParams.get('redirect_uri'),base.redirectUri);
 assert.equal(authorize.searchParams.get('scope'),'identify guilds');
 assert.match(login.stateCookie,/Path=\/cad\/auth/);
 assert.match(login.stateCookie,/Secure/);
});
test('CAD auth refuses malformed and non-TLS production callbacks',()=>{
 for(const redirectUri of ['https://aether.wispbyte.app/cad/auth/callback/','http://aether.wispbyte.app/cad/auth/callback','https://aether.wispbyte.app/cad/auth/callback?debug=1','https://aether.wispbyte.app/cad/']){
  const service=new CadAuthService({...base,redirectUri});
  assert.equal(service.configured,false,redirectUri);
 }
 const dev=new CadAuthService({...base,secureCookies:false,redirectUri:'http://localhost:3000/cad/auth/callback'});
 assert.equal(dev.configured,true);
});
test('CAD auth requires a valid application ID and secrets',()=>{
 assert.equal(new CadAuthService({...base,clientId:'invalid'}).configured,false);
 assert.equal(new CadAuthService({...base,clientSecret:'short'}).configured,false);
 assert.equal(new CadAuthService({...base,sessionSecret:'short'}).configured,false);
});
