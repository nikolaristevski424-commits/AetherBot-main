import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(resolve(root,p),'utf8');
const canonicalCad='https://aether.wispbyte.app/cad/';

test('public navigation uses the real Wispbyte CAD without removing Vercel operations',()=>{
 const pages=['index.html','dashboard/index.html','staff/index.html','features/index.html','docs/index.html',
 'commands/index.html','login/index.html','status/index.html'];
 for(const page of pages){
  const html=file(page);
  assert.ok(html.includes('href="'+canonicalCad+'"'),page);
  assert.ok(!html.includes('href="/cad/"'),page+' should not send primary CAD links to Vercel');
 }
 const mirror=file('cad/index.html');
 assert.match(mirror,/id="consoleRoot"/);
 assert.match(mirror,/id="cadCallsList"/);
 assert.match(mirror,/Open Wispbyte CAD/);
});
test('accessible sign-in page distinguishes the two Discord OAuth sessions',()=>{
 const html=file('login/index.html');
 assert.match(html,/id="discordSignIn"/);
 assert.match(html,/https:\/\/aether\.wispbyte\.app\/cad\/auth\/login/);
 assert.match(html,/href="\/api\/auth\/login\?next=/);
 assert.match(html,/CAD uses a separate Discord sign-in/);
});
test('logo and animation use contained artwork and reduced-motion protection',()=>{
 const css=file('assets/refined.css');
 assert.match(css,/\.brand-icon img\{/);
 assert.match(css,/object-fit:contain/);
 assert.match(css,/\.auth-brand-art img\{/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@keyframes aetherEnter/);
 const html=file('login/index.html');
 assert.match(html,/class="auth-brand-art"/);
});
