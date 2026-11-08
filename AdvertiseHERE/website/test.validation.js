import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CATEGORIES, parseInvite, imageUrl, validateListing, isManagerPermission, secondsUntilBump} from './api/_lib/validation.js';
const fixture={guildId:'123456789012345678',name:'Test community',summary:'Friendly community for roleplay',description:'Test community with active staff and daily events.',category:'roleplay',invite:'https://discord.gg/Welcome234'};
test('categories include advertising niches',()=>{assert.ok(CATEGORIES.includes('hiring'));assert.ok(CATEGORIES.includes('roleplay'));});
test('listing requires manager-selectable server, valid Discord invite and bounded text',()=>{
 assert.ok(validateListing(fixture));
 assert.equal(validateListing({...fixture,guildId:'invalid'}),null);
 assert.equal(validateListing({...fixture,invite:'https://discord.gg.evil.tld/Welcome234'}),null);
 assert.equal(validateListing({...fixture,name:'x'}),null);
 assert.equal(validateListing({...fixture,description:'x'.repeat(1601)}),null);
});
test('Discord invite URL validation and safe image URL',()=>{
 assert.equal(parseInvite('https://discord.gg/MyServer1'),'MyServer1');
 assert.equal(parseInvite('http://discord.gg/MyServer1'),null);
 assert.equal(imageUrl('javascript:alert(1)'),null);
 assert.equal(imageUrl('http://example.org/foo.png'),null);
 assert.equal(imageUrl('https://example.org/foo.png'),'https://example.org/foo.png');
});
test('Discord manager permissions and cooldown',()=>{
 assert.equal(isManagerPermission('32'),true);
 assert.equal(isManagerPermission('8'),true);
 assert.equal(isManagerPermission('0'),false);
 assert.equal(secondsUntilBump(null),0);
 assert.ok(secondsUntilBump(new Date())>=7199);
 assert.equal(secondsUntilBump(new Date(Date.now()-8_000_000)),0);
});
