import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeCell, toCsv, moderationCasesCsv, cadHistoryCsv, MAX_EXPORT_ROWS } from '../assets/ops-export.mjs';

test('CSV values are quoted and protect against spreadsheet formula injection',()=>{
 assert.equal(safeCell('hello, "team"'), '"hello, ""team"""');
 for(const input of ['=1+2','+cmd|x','-2+3','@SUM(1)','  =HYPERLINK("x")','\t+1'])
   assert.ok(safeCell(input).startsWith('"\''),input);
 assert.equal(safeCell('regular text'),'"regular text"');
 assert.equal(safeCell(null),'""');
});
test('CSV columns are explicitly allowlisted and output is bounded',()=>{
 const data=Array.from({length:MAX_EXPORT_ROWS+20},(_,i)=>({name:'value '+i,unwanted:'secret'}));
 const csv=toCsv([{label:'Name',key:'name'}],data);
 assert.equal(csv.trim().split('\r\n').length,MAX_EXPORT_ROWS+1);
 assert.ok(!csv.includes('secret'));
 assert.ok(!csv.includes('value 501'));
 assert.equal(toCsv([{label:'X',key:'x'}],[{x:'line 1\nline 2'}]),'"X"\r\n"line 1\nline 2"\r\n');
});
test('staff exports avoid unknown fields and timestamp overflow',()=>{
 const csv=moderationCasesCsv([{caseId:7,action:'warn',target:'Test',reason:'=2+2',createdAt:Date.now(),privateToken:'never export me'},
  {caseId:8,action:'timeout',reason:'rule violation',createdAt:1e100}]);
 assert.ok(csv.includes("'=2+2"));
 assert.ok(csv.includes('Created at (UTC)'));
 assert.ok(!csv.includes('never export me'));
 assert.ok(csv.includes('"8"'));
});
test('CAD audit exports redact fields outside the export schema',()=>{
 const csv=cadHistoryCsv([{id:'event-1',action:'call.created',actorName:'Unit 12',at:Date.now(),details:{callId:'call-1'},serverApiKey:'hidden'}]);
 assert.ok(csv.includes('call.created'));
 assert.ok(csv.includes('call-1'));
 assert.ok(!csv.includes('hidden'));
});
