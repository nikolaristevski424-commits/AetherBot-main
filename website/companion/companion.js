(()=>{'use strict';
const $=id=>document.getElementById(id);
let guildId='',guilds=[],players=[],allowed=false,installEvent=null;
function say(message,error=false){$('feedback').textContent=message;$('feedback').classList.toggle('error',error);}
async function api(route,options={}){const r=await fetch(route,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{})}});const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok)throw Error(j.error||'Request failed');return j;}
const gate=(route,options)=>api('/api/gateway?route='+encodeURIComponent(route),options);
function playerName(value){return String(value||'').split(':')[0];}
function render(){
 const list=$('players');list.replaceChildren();const q=$('playerSearch').value.toLowerCase();
 const matching=players.filter(p=>[p.player,p.team,p.callsign].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,120);
 if(!matching.length){const msg=document.createElement('p');msg.className='comp-muted';msg.textContent='No players in the latest snapshot match this search.';list.append(msg);return;}
 for(const p of matching){const row=document.createElement('div');row.className='comp-row';
 const info=document.createElement('div');const name=document.createElement('b');name.textContent=playerName(p.player);
 const detail=document.createElement('div');detail.className='comp-muted';detail.textContent=p.team||'ER:LC player';info.append(name,detail);row.append(info);
 const pick=document.createElement('button');pick.className='comp-button comp-secondary';pick.textContent='Select';pick.type='button';pick.disabled=!allowed;
 pick.addEventListener('click',()=>{$('target').value=playerName(p.player);$('reason').focus()});row.append(pick);list.append(row);}
}
async function choose(){
 guildId=$('guildPicker').value;allowed=false;$('send').disabled=true;players=[];render();
 if(!guildId){say('Choose a Discord server.');return;}
 try{const data=await gate('guilds/'+guildId+'/erlc/players');
 allowed=Boolean(data.configured&&data.fresh&&data.canModerate);
 players=data.players||[];$('playerCount').textContent=players.length+' players';
 $('syncAge').textContent=data.lastSyncAt?'Synced '+new Date(data.lastSyncAt).toLocaleTimeString():'Awaiting snapshot';
 $('send').disabled=!allowed;render();
 say(!data.configured?'ER:LC is not configured. Run /erlc setup in Discord.':!data.fresh?'Player snapshot is outdated. Wait for the bot to sync.':!data.canModerate?'Read-only: Manage Server permission required.':'Connected. Choose a player to review an action.',!data.configured);
 }catch(e){say(e.message,true);}
}
async function start(){try{const me=await api('/api/auth/me');if(!me.authenticated){say('Sign in with Discord first. Opening the sign-in page...',true);const a=document.createElement('a');a.href='/api/auth/login?next=%2Fcompanion%2F';a.textContent='Sign in with Discord';a.style.color='#b4d0ff';$('feedback').append(' ',a);return;}
 const data=await gate('guilds');guilds=(data.guilds||[]).filter(g=>g.permissions?.erlc||g.permissions?.manager);
 const select=$('guildPicker');select.replaceChildren();for(const g of guilds){const option=document.createElement('option');option.value=g.id;option.textContent=g.name;select.append(option);}
 if(!guilds.length){say('No accessible Discord servers were found.',true);return;}
 try{const last=sessionStorage.getItem('aether_guild');if(guilds.some(g=>g.id===last))select.value=last;}catch{}
 await choose();
 }catch(e){say(e.message,true);}}
$('guildPicker').addEventListener('change',choose);$('refresh').addEventListener('click',choose);$('playerSearch').addEventListener('input',render);
$('moderateForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!allowed||!guildId)return;
 const action=$('action').value,player=$('target').value.trim(),reason=$('reason').value.trim();
 if(!players.some(p=>playerName(p.player).toLowerCase()===player.toLowerCase()))return say('Choose a player from the current server snapshot.',true);
 if(!confirm('Confirm '+action.toUpperCase()+' for '+player+' on your private ER:LC server?\nReason: '+reason+'\nThis is a real in-game moderation action.'))return;
 const button=$('send');button.disabled=true;
 try{await gate('guilds/'+guildId+'/erlc/moderate',{method:'POST',body:JSON.stringify({action,player,reason})});$('moderateForm').reset();say(action.toUpperCase()+' sent for '+player+'. The action was recorded in CAD history.');}
 catch(error){say(error.message,true);}finally{button.disabled=!allowed;}
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;$('installApp').hidden=false;});
$('installApp').addEventListener('click',async()=>{if(!installEvent)return;installEvent.prompt();await installEvent.userChoice;installEvent=null;$('installApp').hidden=true;});
if('serviceWorker'in navigator)navigator.serviceWorker.register('/companion/sw.js').catch(()=>{});
start();
})();