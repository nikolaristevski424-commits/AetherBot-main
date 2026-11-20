/* Aether officer MDT — guild-scoped CAD API, role-checked server-side. */
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let guildId=null, permissions=null, selectedRecord=null, queryTimer=null, loading=false;
let cached=null;
const base=()=>`/cad/api/guilds/${encodeURIComponent(guildId)}/mdt`;
async function send(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||`Request rejected (${response.status})`);
  return result;
}
function notice(message,error=false){const target=$('mdtNotice');if(!target)return;target.textContent=message;target.dataset.error=String(error);target.hidden=!message;}
function fmtTime(n){return n?new Date(n).toLocaleString():'—';}
function tag(kind){return kind==='vehicle'?'VEHICLE':'PERSON';}
function age(ts){if(!ts)return '—';return Math.max(0,Math.round((Date.now()-ts)/60000))+' min ago';}
function card(label,meta,body,actions=''){
  return `<article class="mdt-result"><div class="mdt-result-head"><div><strong>${esc(label)}</strong><span>${esc(meta)}</span></div>${actions}</div><p>${esc(body||'No details available.')}</p></article>`;
}
function render(){
  if(!cached)return;
  const {records=[],bolos=[],players=[],assignedCalls=[]}=cached;
  $('mdtRecordCount').textContent=records.length;
  $('mdtBoloCount').textContent=bolos.length;
  $('mdtPlayerCount').textContent=players.length;
  $('mdtAssignmentCount').textContent=assignedCalls.length;
  const recordList=$('mdtRecordList');
  recordList.innerHTML=records.length?records.map(r=>card(r.subject,`${tag(r.kind)} • ${r.id.slice(0,8).toUpperCase()}${r.plate?' • '+r.plate:''}`,
    [r.description,r.robloxUsername&&'Roblox: '+r.robloxUsername,r.notes].filter(Boolean).join(' · '),`<button class="mdt-mini-button" data-record="${esc(r.id)}">View / edit</button>`)).join(''):
    '<p class="mdt-empty">No matching fictional records. Create one for your roleplay community.</p>';
  const boloList=$('mdtBoloList');
  boloList.innerHTML=bolos.length?bolos.map(b=>card(b.subject,`${b.priority.toUpperCase()} ${tag(b.kind)} • ${b.id.slice(0,8).toUpperCase()} • Expires ${fmtTime(b.expiresAt)}`,
    `${b.details}${b.location?' · Last known: '+b.location:''}`, `<button class="mdt-mini-button mdt-clear" data-bolo="${esc(b.id)}">Clear</button>`)).join(''):
    '<p class="mdt-empty">No active BOLOs.</p>';
  $('mdtPlayerList').innerHTML=players.length?players.map(p=>card(p.player||'Player',
    `${p.team||'Unknown team'} • ${p.callsign||'No callsign'} • ${age(p.lastSeenAt)}`,
    `${p.location||'Location not available'}${p.robloxId?' · Roblox ID: '+p.robloxId:''}`)).join(''):
    '<p class="mdt-empty">No matching players in a fresh ER:LC snapshot.</p>';
  $('mdtAssignedList').innerHTML=assignedCalls.length?assignedCalls.map(c=>card(c.title||'Call',`${c.id.slice(0,8).toUpperCase()} • ${c.priority} • ${c.status}`,
    `${c.location||'Unknown location'}${c.details?' · '+c.details:''}`)).join(''):
    '<p class="mdt-empty">No calls assigned to your unit right now.</p>';
  $('mdtSearchCount').textContent=`${records.length} records • ${bolos.length} BOLOs • ${players.length} players`;
  const baseStatus=cached.base||{};
  const voice=baseStatus.voice?.connected ? 'Voice: connected' : 'Voice: not connected';
  const text=baseStatus.textChannelId ? 'Text: configured' : 'Text: set /cad dispatch-channel first';
  $('mdtBaseStatus').textContent=`${voice} • ${text}`;
  $('mdtBaseSend').disabled=!baseStatus.textChannelId;
  const history=cached.bulletins||[];
  $('mdtBaseHistory').innerHTML=history.length?history.slice(0,12).map(b=>card(
    b.actorName||'Dispatcher',new Date(b.at).toLocaleString(),b.message)).join('')
    :'<p class="mdt-empty">No transmissions yet. Bulletins are visible only to authorized dispatch staff.</p>';
}
export async function refreshMdt(){
  if(!guildId||loading)return;
  loading=true;
  $('mdtRefreshButton').disabled=true;
  try{
    const q=$('mdtSearch').value.trim();
    cached=await send(base()+'?q='+encodeURIComponent(q));
    render();notice('');
  }catch(e){notice(e.message,true);}
  finally{loading=false;$('mdtRefreshButton').disabled=false;}
}
export function renderMdt(data){
  const currentId=data?.guild?.id;
  if(!currentId)return;
  permissions=data.permissions;
  $('mdtCreateBolo').hidden=!permissions?.dispatch;
  $('mdtRecordEditor').hidden=!permissions?.dispatch;
  if(currentId!==guildId){guildId=currentId;cached=null;selectedRecord=null;$('mdtSearch').value='';void refreshMdt();}
  $('mdtUnitLabel').textContent=(data.state.units||[]).find(u=>u.userId===data.currentUserId)?.callsign||'Your officer workspace';
  if (cached && data.currentUserId) {
    cached.assignedCalls = (data.state.calls || []).filter(c => c.status !== 'closed' && (c.assignedUnitIds || []).includes(data.currentUserId)).slice(-20);
    render();
  }
}
function startNew(){selectedRecord=null;$('mdtRecordForm').reset();$('mdtRecordFormHeading').textContent='Create a roleplay record';$('mdtRecordSubmit').textContent='Save record';$('mdtArchiveRecord').hidden=true;}
function editRecord(record){selectedRecord=record;$('mdtRecordFormHeading').textContent=`Edit ${record.kind} record`;
  for(const key of ['kind','subject','description','robloxUsername','plate','notes']){const field=$('mdt_'+key);if(field)field.value=record[key]||'';}
  $('mdtRecordSubmit').textContent='Save changes';$('mdtArchiveRecord').hidden=!permissions?.manager;
  $('mdtRecordEditor').scrollIntoView({behavior:'smooth',block:'start'});
}
function bind(){
  if(!$('mdtSearch'))return;
  $('mdtSearch').addEventListener('input',()=>{clearTimeout(queryTimer);queryTimer=setTimeout(refreshMdt,240);});
  $('mdtRefreshButton').addEventListener('click',refreshMdt);
  $('mdtNewRecord').addEventListener('click',startNew);
  $('mdtRecordList').addEventListener('click',e=>{const b=e.target.closest('[data-record]');if(!b)return;const record=cached?.records?.find(x=>x.id===b.dataset.record);if(record)editRecord(record);});
  $('mdtRecordForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const input={};for(const key of ['kind','subject','description','robloxUsername','plate','notes'])input[key]=$('mdt_'+key).value;
    $('mdtRecordSubmit').disabled=true;
    try{await send(selectedRecord?base()+'/records/'+encodeURIComponent(selectedRecord.id):base()+'/records',{
      method:selectedRecord?'PATCH':'POST',body:JSON.stringify(input)});
      notice('Roleplay record saved.');startNew();await refreshMdt();
    }catch(err){notice(err.message,true);}finally{$('mdtRecordSubmit').disabled=false;}
  });
  $('mdtArchiveRecord').addEventListener('click',async()=>{
    if(!selectedRecord||!permissions?.manager)return;
    if(!window.confirm('Archive this fictional roleplay record?'))return;
    try{await send(base()+'/records/'+encodeURIComponent(selectedRecord.id),{method:'DELETE',body:'{}'});startNew();await refreshMdt();notice('Record archived.');}
    catch(err){notice(err.message,true);}
  });
  $('mdtBaseForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!guildId)return;
    const message=$('mdtBaseMessage').value.trim();
    $('mdtBaseSend').disabled=true;
    try{
      const result=await send(base()+'/base/bulletin',{method:'POST',body:JSON.stringify({message})});
      $('mdtBaseMessage').value='';
      await refreshMdt();
      notice(result.voiceAlert?'Bulletin transmitted with a voice radio alert.':'Bulletin transmitted to Discord text dispatch.');
    }catch(error){notice(error.message,true);}
    finally{$('mdtBaseSend').disabled=!(cached?.base?.textChannelId);}
  });
  $('mdtBoloForm').addEventListener('submit',async e=>{
    e.preventDefault();const input={};for(const key of ['kind','subject','details','location','priority','expiresInHours'])input[key]=$('mdt_bolo_'+key).value;
    input.expiresInHours=Number(input.expiresInHours);
    $('mdtBoloSubmit').disabled=true;
    try{await send(base()+'/bolos',{method:'POST',body:JSON.stringify(input)});e.target.reset();await refreshMdt();notice('Roleplay BOLO issued.');}
    catch(err){notice(err.message,true);}finally{$('mdtBoloSubmit').disabled=false;}
  });
  $('mdtBoloList').addEventListener('click',async e=>{
    const b=e.target.closest('[data-bolo]');if(!b)return;
    if(!window.confirm('Clear this BOLO?'))return;
    b.disabled=true;
    try{await send(base()+'/bolos/'+encodeURIComponent(b.dataset.bolo)+'/clear',{method:'PATCH',body:'{}'});await refreshMdt();notice('BOLO cleared.');}
    catch(err){notice(err.message,true);}finally{b.disabled=false;}
  });
  startNew();
}
bind();
