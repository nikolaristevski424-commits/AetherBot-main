import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseInvite,trimText,cooldownSeconds} from './src/validation.js';
test('valid Discord invites only',()=>{
 assert.equal(parseInvite('https://discord.gg/abcDEF'), 'abcDEF');
 assert.equal(parseInvite('https://discord.com/invite/Test1'), 'Test1');
 assert.equal(parseInvite('https://discord.gg.evil.example/abcDEF'),null);
 assert.equal(parseInvite('http://discord.gg/test'),null);
 assert.equal(parseInvite('https://discord.gg/a?malware=1'),null);
});
test('bounded strings and cooldown',()=>{
 assert.equal(trimText('   a valid description   ',32,10),'a valid description');
 assert.equal(trimText('xyz',20,6),null);
 assert.equal(cooldownSeconds(null),0);
 assert.ok(cooldownSeconds(new Date())>=7199);
});
