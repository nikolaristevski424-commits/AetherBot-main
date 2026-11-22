import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pages=['404.html','index.html','cad/index.html','commands/index.html','dashboard/index.html',
  'docs/index.html','faq/index.html','features/index.html','login/index.html',
  'privacy/index.html','staff/index.html','status/index.html','terms/index.html','companion/index.html'];
const read=name=>readFileSync(resolve(root,name),'utf8');

test('all public and console pages load the same visual system',()=>{
 for(const page of pages){
  const html=read(page);
  assert.match(html,/<link rel="stylesheet" href="\/assets\/site\.css">/,page);
  assert.match(html,/<link rel="stylesheet" href="\/assets\/theme\.css">/,page);
  assert.match(html,/<link rel="stylesheet" href="\/assets\/refined\.css">/,page);
  assert.ok(html.indexOf('/assets/refined.css')>html.indexOf('/assets/theme.css'),page+' must load last');
  assert.match(html,/<meta name="viewport"/,page);
 }
});

test('management pages retain the existing JS contracts and key controls',()=>{
 for(const [path,required] of [
  ['dashboard/index.html',['guildPicker','bridgeState','consoleRoot','metric_members','overviewActivity','readinessChecklist']],
  ['cad/index.html',['guildPicker','bridgeState','consoleRoot','cadCallsList','cadLiveMap','mdtRecordsList','cadBolosList','cadPriorityFilter']],
  ['staff/index.html',['guildPicker','bridgeState','consoleRoot','staffCasesList','staffActionForm','cadConfigForm']],
  ['companion/index.html',['guildPicker','players','moderateForm','feedback','refresh']]
 ]){
  const content=read(path);
  for(const id of required)assert.ok(content.includes('id="'+id+'"'),path+' missing '+id);
 }
});

test('redesign respects reduced motion and avoids fake health claims',()=>{
 const css=read('assets/refined.css');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/html\[data-theme="dark"\]/);
 const home=read('index.html');
 assert.match(home,/ILLUSTRATIVE PRODUCT PREVIEW/);
 assert.match(css,/NOT LIVE DATA/);
 assert.ok(!home.includes('600Servers'));
});

test('installed ER:LC companion caches the latest Aether theme layer',()=>{
 const worker=read('companion/sw.js');
 assert.match(worker,/\/assets\/refined\.css/);
 assert.match(worker,/aether-companion-v5/);
});

test('visual stylesheet syntax has balanced block delimiters',()=>{
 const css=read('assets/refined.css').replace(/\/\*[\s\S]*?\*\//g,'').replace(/"[^"]*"/g,'').replace(/'[^']*'/g,'');
 let balance=0;
 for(const c of css){if(c==='{')balance++;if(c==='}')balance--;assert.ok(balance>=0,'unexpected closing brace');}
 assert.equal(balance,0,'unclosed CSS blocks');
});
