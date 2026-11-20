/* ER:LC v2 position snapshots on the published PRC map. No browser API keys. */
const MAP_SIZE = 5355;
let snapshot = null;
let currentFilter = 'all';
let zoom = 1;
let panX = 0;
let panY = 0;
let selected = null;

const el = id => document.getElementById(id);
function asPosition(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const mx = (x + MAP_SIZE / 2) / MAP_SIZE * 100;
  const my = (z + MAP_SIZE / 2) / MAP_SIZE * 100;
  return mx >= 0 && mx <= 100 && my >= 0 && my <= 100 ? { x: mx, y: my } : null;
}
function teamGroup(team) {
  const t = String(team || '').toLowerCase();
  if (/sheriff/.test(t)) return 'sheriff';
  if (/police/.test(t)) return 'police';
  if (/fire|rescue|ems|medical/.test(t)) return 'fire';
  if (/dot|transport/.test(t)) return 'dot';
  if (/civilian|criminal/.test(t)) return 'civilian';
  return 'other';
}
function applyTransform() {
  const canvas = el('cadMapCanvas');
  if (canvas) canvas.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
  if (el('cadMapZoomValue')) el('cadMapZoomValue').textContent = `${Math.round(zoom * 100)}%`;
}
function clearDetails() {
  const node = el('cadMapDetails');
  if (node) node.textContent = 'Select a player or incident marker to inspect it.';
}
function showMarker(item) {
  selected = item.key;
  const detail = el('cadMapDetails');
  if (!detail) return;
  detail.replaceChildren();
  const header = document.createElement('h3'); header.textContent = item.title;
  const lines = [item.type === 'call' ? `911 dispatch · ${item.status}` : item.team,
    item.location || 'Location unavailable', `X ${item.x.toFixed(0)} / Z ${item.z.toFixed(0)}`,
    item.type === 'call' ? item.details : item.callsign ? `Callsign: ${item.callsign}` : ''];
  const list = document.createElement('div'); list.className = 'map-info-lines';
  for (const entry of lines.filter(Boolean)) {
    const line = document.createElement('p'); line.textContent = String(entry).slice(0, 450); list.append(line);
  }
  detail.append(header, list);
  document.querySelectorAll('.cad-map-marker').forEach(marker => marker.classList.toggle('selected', marker.dataset.key === item.key));
}
export function renderCadMap(data) {
  const stage = el('cadMapStage'), pins = el('cadMapPins'), side = el('cadMapList');
  if (!stage || !pins || !side) return;
  snapshot = data;
  const state = data?.state || {};
  const age = Date.now() - Number(state.playerSyncAt || 0);
  const fresh = Number.isFinite(age) && state.playerSyncAt && age <= 90_000 && state.serverOnline !== false;
  const allPlayers = fresh ? (state.players || []) : [];
  const shown = [];
  for (const player of allPlayers) {
    const location = asPosition(player.locationX, player.locationZ);
    if (!location) continue;
    const group = teamGroup(player.team);
    if (currentFilter !== 'all' && currentFilter !== group) continue;
    shown.push({ key:`player:${player.robloxId||player.player}`, type:'player', group,
      title:player.player || 'Unknown player', team:player.team || 'Unknown team',
      location:player.location, callsign:player.callsign, x:player.locationX,z:player.locationZ,point:location });
  }
  for (const call of state.calls || []) {
    if (call.status === 'closed' || !Number.isFinite(call.positionX) || !Number.isFinite(call.positionZ)) continue;
    const point = asPosition(call.positionX,call.positionZ);
    if (!point) continue;
    if (currentFilter !== 'all' && currentFilter !== 'calls') continue;
    shown.push({key:`call:${call.id}`,type:'call',group:'calls',title:call.title||'Emergency call',
      status:call.status||'open',details:call.details||'',location:call.location||'On map',
      x:call.positionX,z:call.positionZ,point});
  }
  const stateLabel = el('cadMapState');
  if (stateLabel) stateLabel.textContent = !state.playerSyncAt ? 'Waiting for first ER:LC sync' :
    state.serverOnline === false ? 'ER:LC server offline — player positions hidden' :
    !fresh ? 'Last player snapshot is stale — positions hidden' :
    `API snapshot ${Math.max(0, Math.round(age / 1000))} seconds old · ${allPlayers.length} players in snapshot`;
  el('cadMapPlayerCount').textContent = String(allPlayers.length);
  el('cadMapCallCount').textContent = String((state.calls||[]).filter(c => c.status!=='closed').length);
  el('cadMapPinCount').textContent = String(shown.length);
  pins.replaceChildren(); side.replaceChildren();
  if (!shown.length) {
    const message=document.createElement('p');message.className='map-empty';
    message.textContent=state.playerSyncAt ? 'No current positions match this filter. In-game coordinates are necessary to plot a marker.' : 'No snapshot yet. Connect your private server with /erlc setup.';
    side.append(message);
  }
  for (const item of shown) {
    const pin=document.createElement('button');pin.type='button';pin.className=`cad-map-marker ${item.group}`;
    pin.dataset.key=item.key;pin.style.left=`${item.point.x}%`;pin.style.top=`${item.point.y}%`;
    pin.textContent=item.type==='call'?'!':(item.callsign||item.title).slice(0,3).toUpperCase();
    pin.setAttribute('aria-label',`${item.type==='call'?'911 incident':'Player'}: ${item.title}, ${item.location||''}`);
    pin.title=`${item.title} · ${item.location||'Unknown street'}`;
    pin.addEventListener('click',()=>showMarker(item));pins.append(pin);
    const row=document.createElement('button');row.type='button';row.className='map-player-row';
    const badge=document.createElement('span');badge.className=`map-team-dot ${item.group}`;
    const text=document.createElement('span');text.className='map-player-copy';
    const name=document.createElement('strong');name.textContent=item.title;
    const location=document.createElement('small');location.textContent=item.location||`X ${item.x.toFixed(0)} Z ${item.z.toFixed(0)}`;
    text.append(name,location);row.append(badge,text);
    row.addEventListener('click',()=>showMarker(item));side.append(row);
  }
  if (selected) {
    const match=shown.find(x=>x.key===selected);
    if (match) showMarker(match);else {selected=null;clearDetails();}
  }
}

function initMapControls() {
  const stage=el('cadMapStage'), image=el('cadMapImage');
  if (!stage) return;
  image?.addEventListener('error',()=>{
    el('cadMapImageError').hidden=false;
  });
  el('cadMapFilter')?.addEventListener('change',event=>{currentFilter=event.target.value;selected=null;clearDetails();if(snapshot)renderCadMap(snapshot);});
  const setZoom=value=>{zoom=Math.max(1,Math.min(4,value));if(zoom===1){panX=0;panY=0;}applyTransform();};
  el('cadMapZoomIn')?.addEventListener('click',()=>setZoom(zoom+.3));
  el('cadMapZoomOut')?.addEventListener('click',()=>setZoom(zoom-.3));
  el('cadMapReset')?.addEventListener('click',()=>setZoom(1));
  stage.addEventListener('wheel',event=>{event.preventDefault();setZoom(zoom+(event.deltaY<0?.2:-.2));},{passive:false});
  let dragging=null;
  stage.addEventListener('pointerdown',event=>{
    if (event.target.closest('.cad-map-marker') || zoom<=1) return;
    dragging={x:event.clientX,y:event.clientY,px:panX,py:panY};
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove',event=>{if(!dragging)return;const bound=stage.clientWidth*(zoom-1)/2;
    panX=Math.max(-bound,Math.min(bound,dragging.px+event.clientX-dragging.x));
    panY=Math.max(-bound,Math.min(bound,dragging.py+event.clientY-dragging.y));applyTransform();});
  stage.addEventListener('pointerup',()=>{dragging=null;});
  stage.addEventListener('pointercancel',()=>{dragging=null;});
  applyTransform();
}
initMapControls();
