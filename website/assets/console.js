/* Aether console — real Discord data only. Never interpolate Discord/user text into HTML. */
(() => {
'use strict';
const $=id=>document.getElementById(id),kind=$('consoleRoot')?.dataset.kind, state={user:null,guilds:[],guildId:'',data:null};
const modes=['calls','map','records','bolos'];
let cadSnapshot=null;
let cadPolling=null;
let cadLoading=false;
const CAD_REFRESH_MS=30000;
function stopCadPolling(){if(cadPolling!==null){clearInterval(cadPolling);cadPolling=null;}}
function startCadPolling(){
 stopCadPolling();
 if(kind!=='cad')return;
 cadPolling=setInterval(()=>{
  if(document.hidden||!state.guildId||!permitted('dispatch')||cadLoading)return;
  void loadCad({silent:true}).catch(()=>{});
 },CAD_REFRESH_MS);
}

const text=(node,value)=>{if(node)node.textContent=value==null?'—':String(value);};
function elem(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!=null)e.textContent=String(content);return e;}
function empty(node,title,desc){if(!node)return;node.replaceChildren();const div=elem('div','empty-state');div.append(elem('div','illustration','◈'),elem('b','',title),elem('p','',desc));node.append(div);}
function row(label,subtitle,icon='▤',tag='',tagColor=''){
  const node=elem('div','item-row');const ic=elem('span','item-circle',icon),body=elem('div');body.append(elem('b','',label),elem('small','',subtitle));node.append(ic,body);
  if(tag)node.append(elem('span','tag '+tagColor,tag));return node;
}
function notice(message,problem=false){const n=$('consoleNotice');text(n,message);n.className='notice'+(problem?' error':'');n.hidden=!message;}
function connection(message,ok=false){const n=$('bridgeState');if(!n)return;n.classList.toggle('online',ok);text(n.querySelector('span'),message);}
function goLogin(){notice('Sign in with Discord first. Aether only displays servers you are authorized to manage.',true);const n=$('consoleRoot');n.prepend(row('Discord sign-in required','Open the sign-in page to view your servers.','◉'));
 const a=elem('a','btn btn-primary','Continue with Discord ↗');a.href='/api/auth/login?next='+encodeURIComponent(location.pathname);n.prepend(a);}
async function json(url,options={}){
 const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
 let data;try{data=await r.json()}catch{data={error:'The server returned an unreadable response.'};}
 if(!r.ok)throw Error(data?.error||`Request failed (${r.status})`);return data;
}
function gate(route, options){const [path,query='']=route.split('?');return json('/api/gateway?route='+encodeURIComponent(path)+(query?'&'+query:''),options);}
function actions(button,label,fn){const b=elem('button','btn btn-ghost btn-small',label);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn()}catch(e){notice(e.message,true)}finally{b.disabled=false}});return b;}
function fromForm(form){return Object.fromEntries(new FormData(form).entries());}
function saveSelected(gid){try{sessionStorage.setItem('aether_guild',gid)}catch{}}
function getSelected(){try{return sessionStorage.getItem('aether_guild')||''}catch{return ''}}
function permitted(key){const g=state.guilds.find(g=>g.id===state.guildId);return !!g?.permissions?.[key];}
async function chooseGuild(guildId){
 stopCadPolling();state.guildId=guildId;state.data=null;saveSelected(guildId);
 if(kind==='cad'){cadSnapshot=null;const calls=$('cadCallsList');if(calls)empty(calls,'Loading dispatch queue','Checking the selected server’s latest calls.');}
 if(!guildId){notice('Choose one of your connected Discord servers.');return;}
 connection('Loading server...',false);notice('Loading authorized server data...');
 try{
  if(kind==='dashboard')await loadOverview();else if(kind==='cad')await loadCad();else if(kind==='staff')await loadStaff();
  connection('Connected to Aether',true);notice('');
  if(kind==='cad')startCadPolling();
 }catch(e){connection('Unable to load server',false);notice(e.message,true);}
}
function renderOverview(data){
 text($('metric_members'),data.members);text($('metric_channels'),data.channels);text($('metric_calls'),data.cad?.calls??'Restricted');text($('metric_units'),data.cad?.units??'Restricted');
 const activity=$('overviewActivity');activity.replaceChildren();
 activity.append(row('Bot connection',data.bot?.connected?'Connected to Discord':'Discord gateway not ready','◈',data.bot?.connected?'ONLINE':'NOT READY',data.bot?.connected?'green':''));
 if(data.cad){activity.append(row('CAD dispatch',`${data.cad.calls} open calls • ${data.cad.units} active units`,'⌁','AUTHORIZED','green'));
  activity.append(row('ER:LC snapshot',data.cad.lastSyncAt?`Last player sync ${new Date(data.cad.lastSyncAt).toLocaleString()}`:'Awaiting first sync','◎',data.cad.players==null?'STALE':`${data.cad.players} PLAYERS`));}
 const modules=$('overviewModules');modules.replaceChildren();
 const caps=data.guild?.permissions||{};
 for(const [label,enabled,desc] of [['Moderation',caps.moderator,'Case history and staff controls'],['CAD & MDT',caps.dispatch,'Dispatch calls and officer records'],['ER:LC',caps.erlc,'Private-server commands'],['Server configuration',caps.manager,'Admin-level setup']])
   modules.append(row(label,desc,enabled?'✓':'·',enabled?'ALLOWED':'NO ACCESS',enabled?'green':''));
}
async function loadOverview(){const result=await gate(`guilds/${state.guildId}/overview`);state.data=result;renderOverview(result);}
function renderCall(item){
 const status=item.status||'open';const div=row(item.title||'Untitled call',`${item.location||'Location not provided'} • ${new Date(item.createdAt||Date.now()).toLocaleString()}`,'◈',status.toUpperCase(),status==='closed'?'green':status==='open'?'red':'');
 if(status!=='closed')div.append(actions(div,'Close',async()=>{if(!confirm(`Close the roleplay call “${item.title}”?`))return;await gate(`guilds/${state.guildId}/cad/calls/${item.id}`,{method:'PATCH',body:JSON.stringify({status:'closed'})});await loadCad()}));
 return div;
}
function position(x,z,transform){
 if(!Number.isFinite(x)||!Number.isFinite(z))return null;
 const px=Array.isArray(transform?.coeffX)?transform.coeffX[0]*x+transform.coeffX[1]*z+transform.coeffX[2]:(x+5355/2)/5355*100;
 const py=Array.isArray(transform?.coeffY)?transform.coeffY[0]*x+transform.coeffY[1]*z+transform.coeffY[2]:(z+5355/2)/5355*100;
 return Number.isFinite(px)&&Number.isFinite(py)&&px>=0&&py>=0&&px<=100&&py<=100?{x:px,y:py}:null;
}
function renderMap(data){const map=$('cadLiveMap');const list=$('mapMarkerList');list.replaceChildren();map.querySelectorAll('.map-marker').forEach(el=>el.remove());
 const points=[];for(const p of data.players||[]){const pos=position(p.locationX,p.locationZ,data.mapTransform);if(pos)points.push({pos,label:p.player||'ER:LC player',description:p.location||p.team||'Current snapshot',kind:'player'});}
 for(const c of data.calls||[]){if(c.status==='closed')continue;const pos=position(c.positionX,c.positionZ,data.mapTransform);if(pos)points.push({pos,label:c.title||'911 roleplay call',description:c.location||'',kind:'call'});}
 text($('mapUpdated'),data.playerSyncAt?`Last update ${new Date(data.playerSyncAt).toLocaleTimeString()}`:'No current API snapshot');
 if(!points.length)empty(list,'No located players or incidents','Player markers appear only when a recent ER:LC API snapshot includes coordinates.');
 for(const p of points.slice(0,120)){
  const pin=elem('button','map-marker'+(p.kind==='call'?' call':''));pin.type='button';pin.style.left=`${p.pos.x}%`;pin.style.top=`${p.pos.y}%`;pin.setAttribute('aria-label',`${p.label} — ${p.description}`);pin.title=p.label;map.append(pin);
  const item=row(p.label,p.description,p.kind==='call'?'⚑':'•');pin.addEventListener('click',()=>item.scrollIntoView({block:'nearest',behavior:'smooth'}));list.append(item);
 }
}
function renderCad(data){cadSnapshot=data;text($('cadCallCount'),data.calls.filter(c=>c.status!=='closed').length);text($('cadUnitCount'),data.units.filter(u=>u.status!=='off_duty').length);text($('cadPlayerCount'),data.players.length);text($('cadBoloCount'),data.bolos.length);
 const calls=$('cadCallsList');calls.replaceChildren();const visible=data.calls.filter(c=>c.status!=='closed');if(!visible.length)empty(calls,'No open incidents','Discord /911 or website-created calls will appear here.');else visible.slice(0,30).forEach(c=>calls.append(renderCall(c)));
 const units=$('cadUnitsList');units.replaceChildren();if(!data.units.length)empty(units,'No registered units','Officers register using /cad unit in Discord.');else data.units.slice(0,25).forEach(u=>units.append(row(u.callsign||u.username||'Unit',u.username||'Discord officer','⌁',(u.status||'unknown').replace('_',' ').toUpperCase())));
 renderMap(data);renderBolos(data.bolos);
}
function renderBolos(bolos){const node=$('cadBolosList');node.replaceChildren();if(!bolos.length)return empty(node,'No active BOLOs','Issue a fictional roleplay BOLO from the form.');for(const b of bolos){const div=row(b.subject,b.details||b.location||'Roleplay alert','⚑',(b.priority||'normal').toUpperCase(),b.priority==='urgent'?'red':'');div.append(actions(div,'Clear',async()=>{if(!confirm('Clear this roleplay BOLO?'))return;await gate(`guilds/${state.guildId}/mdt/bolos/${b.id}/clear`,{method:'PATCH',body:'{}'});await loadCad()}));node.append(div)}}
async function loadCad({silent=false}={}){
 if(!permitted('dispatch'))throw Error('You need the server’s configured CAD dispatch role to open this data.');
 if(cadLoading)return;
 const guildId=state.guildId;
 cadLoading=true;
 try{
  const data=await gate(`guilds/${guildId}/cad`);
  if(guildId!==state.guildId)return;
  state.data=data;renderCad(data);
  const stamp=$('cadRefreshStamp');if(stamp)stamp.textContent=`Updated ${new Date().toLocaleTimeString()} · every 30s while visible`;
  if(!silent)notice('');
 }catch(err){
  if(guildId===state.guildId){
   const stamp=$('cadRefreshStamp');if(stamp)stamp.textContent='Refresh failed · last successful data retained';
   if(!silent)throw err;
   connection('Refresh unavailable',false);
  }
 }finally{cadLoading=false;}
}
async function loadMdt(){if(!state.guildId)return;const q=$('mdtSearch').value.trim();const response=await gate(`guilds/${state.guildId}/mdt?q=${encodeURIComponent(q)}`);const list=$('mdtRecordsList');list.replaceChildren();if(!response.records.length)empty(list,'No matching fictional records','Try a different search or create a roleplay record.');else response.records.slice(0,50).forEach(rec=>list.append(row(rec.subject,`${rec.kind} • ${rec.plate||rec.robloxUsername||rec.description||'roleplay'}`,'▤')));}
function showCadTab(mode){if(!modes.includes(mode))return;document.querySelectorAll('[data-cad-view]').forEach(b=>b.classList.toggle('active',b.dataset.cadView===mode));modes.forEach(x=>{const n=$(x==='calls'?'cadCallsPanel':x==='map'?'cadMapPanel':x==='records'?'cadRecordsPanel':'cadBolosPanel');n.hidden=x!==mode});if(mode==='records')void loadMdt().catch(e=>notice(e.message,true));}
function renderStaff(data){const node=$('staffCasesList');node.replaceChildren();if(!data.cases?.length)empty(node,'No moderation cases yet','Warnings and timeouts made through the bot will appear here.');else data.cases.slice(0,35).forEach(c=>node.append(row(`#${c.caseId} · ${c.action||'Moderation case'}`,`${c.target||'Unknown member'} • ${c.reason||'No reason'} • ${c.createdAt?new Date(c.createdAt).toLocaleString():''}`,'⚑')));
 const perms=$('staffPerms');perms.replaceChildren();for(const [name,k] of [['Moderate Members','canWarn'],['Issue timeouts','canTimeout'],['Manage Server','manager']])perms.append(row(name,data.permissions?.[k]?'Allowed by your Discord roles':'Requires a higher Discord role','⊗',data.permissions?.[k]?'ENABLED':'RESTRICTED',data.permissions?.[k]?'green':''));
}
async function loadStaff(){if(!permitted('moderator'))throw Error('Moderator permission required for this server.');const data=await gate(`guilds/${state.guildId}/staff`);state.data=data;renderStaff(data)}
function bindForms(){
 $('refreshCad')?.addEventListener('click',()=>loadCad().catch(e=>notice(e.message,true)));
 document.addEventListener('visibilitychange',()=>{if(kind==='cad'&&!document.hidden&&state.guildId&&permitted('dispatch'))void loadCad({silent:true});});
 window.addEventListener('pagehide',stopCadPolling);
 $('refreshStaff')?.addEventListener('click',()=>loadStaff().catch(e=>notice(e.message,true)));
 document.querySelectorAll('[data-cad-view]').forEach(btn=>btn.addEventListener('click',()=>showCadTab(btn.dataset.cadView)));
 $('mdtSearchButton')?.addEventListener('click',()=>loadMdt().catch(e=>notice(e.message,true)));
 $('mdtSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void loadMdt().catch(err=>notice(err.message,true))}});
 const callForm=$('newCallForm');callForm?.addEventListener('submit',async e=>{e.preventDefault();const b=callForm.querySelector('[type=submit]');b.disabled=true;try{const data=fromForm(callForm);await gate(`guilds/${state.guildId}/cad/calls`,{method:'POST',body:JSON.stringify(data)});callForm.reset();await loadCad();notice('Roleplay call created and added to the CAD queue.')}catch(err){notice(err.message,true)}finally{b.disabled=false}});
 const recordForm=$('recordForm');recordForm?.addEventListener('submit',async e=>{e.preventDefault();const b=recordForm.querySelector('[type=submit]');b.disabled=true;try{await gate(`guilds/${state.guildId}/mdt/records`,{method:'POST',body:JSON.stringify(fromForm(recordForm))});recordForm.reset();await loadMdt();notice('Fictional MDT record saved.')}catch(err){notice(err.message,true)}finally{b.disabled=false}});
 const boloForm=$('boloForm');boloForm?.addEventListener('submit',async e=>{e.preventDefault();const b=boloForm.querySelector('[type=submit]');b.disabled=true;try{const data=fromForm(boloForm);data.expiresInHours=Number(data.expiresInHours);await gate(`guilds/${state.guildId}/mdt/bolos`,{method:'POST',body:JSON.stringify(data)});boloForm.reset();await loadCad();notice('Roleplay BOLO issued.')}catch(err){notice(err.message,true)}finally{b.disabled=false}});
 const action=$('moderationAction');action?.addEventListener('change',()=>{$('durationLabel').hidden=action.value!=='timeout'});
 const staffForm=$('staffActionForm');staffForm?.addEventListener('submit',async e=>{e.preventDefault();const data=fromForm(staffForm);const label=data.action==='timeout'?'timeout':'warning';if(!confirm(`Issue a ${label} to Discord user ${data.targetId}?\nReason: ${data.reason}\nThis is a real moderation action.`))return;
 const b=$('staffSubmit');b.disabled=true;try{data.durationMinutes=Number(data.durationMinutes);const result=await gate(`guilds/${state.guildId}/staff/moderate`,{method:'POST',body:JSON.stringify(data)});staffForm.reset();await loadStaff();notice(`Moderation ${label} completed. Case #${result.caseId}.`)}catch(err){notice(err.message,true)}finally{b.disabled=false}});
 $('signOut')?.addEventListener('click',async()=>{try{await json('/api/auth/logout',{method:'POST'});location.href='/login/';}catch(e){notice(e.message,true)}});
}
async function initialize(){if(!kind)return;bindForms();
 try{const me=await json('/api/auth/me');if(!me.authenticated)return goLogin();state.user=me.user;
  const config=await json('/api/config');if(!config.bridgeConfigured){connection('Bridge not configured',false);notice('The public website is ready, but its secure link to the Wispbyte bot is not configured. Complete the Aether website setup guide.',true);return;}
  const result=await gate('guilds');state.guilds=result.guilds||[];
  const picker=$('guildPicker');picker.replaceChildren();const none=elem('option','',state.guilds.length?'Select a server...':'No authorized servers yet');none.value='';picker.append(none);
  for(const g of state.guilds){const option=elem('option','',g.name);option.value=g.id;picker.append(option);}
  picker.addEventListener('change',()=>{void chooseGuild(picker.value)});
  if(!state.guilds.length){connection('No manageable servers',false);notice('Aether could not find a server you can manage, moderate or dispatch in. Verify bot access and your Discord roles.',true);return;}
  const saved=getSelected();const first=state.guilds.find(x=>x.id===saved)?.id||state.guilds[0].id;picker.value=first;
  await chooseGuild(first);
 }catch(err){connection('Bridge offline',false);notice(err.message,true);}
}
void initialize();
})();
