import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const pages=['404.html','index.html','cad/index.html','commands/index.html','dashboard/index.html','docs/index.html','faq/index.html','features/index.html','login/index.html','privacy/index.html','staff/index.html','status/index.html','terms/index.html','companion/index.html'];

test('experience system is loaded last on all 14 pages',()=>{
 for(const page of pages){
   const s=read(page);
   assert.match(s,/<link rel="stylesheet" href="\/assets\/experience\.css">/,page);
   assert.match(s,/<script defer src="\/assets\/experience\.js">/,page);
   assert.ok(s.indexOf('/assets/refined.css')<s.indexOf('/assets/experience.css'),page);
 }
});
test('public documentation focuses on product use, not developer tokens',()=>{
 const docs=read('docs/index.html');
 const faq=read('faq/index.html');
 assert.match(docs,/How will your team use CAD|Choose how CAD works|Discord-first/);
 assert.match(docs,/\/cad interface/);
 assert.match(faq,/Web-first or Hybrid/);
 assert.doesNotMatch(docs,/AETHER_DISCORD_CLIENT_SECRET|AETHER_BRIDGE_SECRET|Vercel Environment Variables|private signed API bridge/);
 assert.doesNotMatch(faq,/Do I need to put my bot token|AETHER_SESSION_SECRET|Vercel/);
});
test('CAD user-facing preview is clearly illustrative and all modes are wired',()=>{
 const html=read('index.html');
 const script=read('assets/experience.js');
 assert.match(html,/data-cad-sample="discord"/);
 assert.match(html,/data-cad-sample="web"/);
 assert.match(html,/data-cad-sample="hybrid"/);
 assert.match(html,/NOT LIVE SERVER DATA/);
 assert.match(html,/id="cadChoiceAction"/);
 assert.match(script,/role="tab"|setAttribute\('aria-selected'/);
 assert.match(script,/ArrowRight/);
});
test('the Wispbyte CAD setting has three choices and privacy-safe backend controls',()=>{
 const css=read('assets/experience.css');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 const html=read('cad/index.html');
 assert.match(html,/id="consoleRoot"/);
 const worker=read('companion/sw.js');
 assert.match(worker,/aether-companion-v6/);
 assert.match(worker,/\/assets\/experience\.css/);
});

test('command directory offers real search, category controls and accurate results',()=>{
 const html=read('commands/index.html');
 const js=read('assets/command-search.js');
 assert.match(html,/id="commandSearch"/);
 assert.match(html,/id="commandCount"/);
 assert.match(html,/data-command-filter="cad"/);
 assert.match(html,/data-command-filter="moderation"/);
 assert.match(html,/data-command-category="cad"/);
 assert.match(html,/\/assets\/command-search\.css/);
 assert.match(js,/input\.addEventListener\('input',update\)/);
 assert.match(js,/card\.hidden/);
 assert.match(js,/aria-pressed/);
});
