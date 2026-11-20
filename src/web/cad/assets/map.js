/* ER:LC v2 position snapshots on the published PRC map. No browser API keys. */
const MAP_SIZE = 5355;
let snapshot = null;
let currentFilter = 'all';
let zoom = 1;
let panX = 0;
let panY = 0;
let selected = null;
let pendingLandmark = null;
let savingCalibration = false;

const el = id => document.getElementById(id);
function asPosition(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const transform = snapshot?.mapTransform;
  const mx = transform?.coeffX?.length === 3
    ? transform.coeffX[0] * x + transform.coeffX[1] * z + transform.coeffX[2]
    : (x + MAP_SIZE / 2) / MAP_SIZE * 100;
  const my = transform?.coeffY?.length === 3
    ? transform.coeffY[0] * x + transform.coeffY[1] * z + transform.coeffY[2]
    : (z + MAP_SIZE / 2) / MAP_SIZE * 100;
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
  updateCalibrationPanel(data, allPlayers);
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
    `API snapshot ${Math.max(0, Math.round(age / 1000))} seconds old · ${allPlayers.length} players in snapshot${data.mapTransform ? ' · calibrated map' : ' · map alignment approximate'}`;
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


// Role-checked map alignment: the server saves reference points and fits the affine transform.
// Client access to the controls does not grant manager permission; the API independently checks roles.
function calibrationMessage(message, error = false) {
  const node = el('cadCalibrationStatus');
  if (!node) return;
  node.textContent = message;
  node.style.color = error ? '#a52626' : '';
}
function updateCalibrationPanel(data, players) {
  const panel = el('cadCalibrationPanel'), select = el('cadCalibrationPlayer'), list = el('cadCalibrationList');
  if (!panel || !select || !list) return;
  panel.hidden = !data.permissions?.manager;
  if (panel.hidden) { pendingLandmark = null; return; }
  const previous = select.value;
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.textContent = 'Select player at known landmark'; select.append(placeholder);
  for (const player of players) {
    if (!Number.isFinite(player.locationX) || !Number.isFinite(player.locationZ)) continue;
    const option = document.createElement('option');
    option.value = String(player.robloxId || player.player);
    option.textContent = `${player.player} • X ${player.locationX.toFixed(0)} Z ${player.locationZ.toFixed(0)}`;
    select.append(option);
  }
  if ([...select.options].some(o => o.value === previous)) select.value = previous;
  const anchors = data.calibration || [];
  list.replaceChildren();
  for (const [index, anchor] of anchors.entries()) {
    const row = document.createElement('div'); row.className = 'calibration-anchor';
    row.textContent = `${index + 1}. ${anchor.label || 'Landmark'}: X ${anchor.worldX.toFixed(0)}, Z ${anchor.worldZ.toFixed(0)} → ${anchor.mapX.toFixed(1)}%, ${anchor.mapY.toFixed(1)}%`;
    list.append(row);
  }
  const quality = data.mapTransform?.rmsErrorPercent;
  const status = Number.isFinite(quality)
    ? `Calibrated with ${anchors.length} landmarks · residual ${quality.toFixed(2)}% of map size. Recheck after any map update.`
    : `${anchors.length} / 3 minimum landmarks placed. Until calibration is complete, marker positions use approximate defaults.`;
  if (!pendingLandmark) calibrationMessage(status);
}
async function sendCalibration(anchors) {
  if (savingCalibration || !snapshot?.guild?.id) return;
  savingCalibration = true;
  try {
    const response = await fetch(`/cad/api/guilds/${encodeURIComponent(snapshot.guild.id)}/mdt/calibration`, {
      method: 'PUT', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anchors }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Calibration rejected (${response.status})`);
    snapshot.calibration = result.calibration.anchors;
    snapshot.mapTransform = result.calibration.transform;
    pendingLandmark = null;
    renderCadMap(snapshot);
  } catch (error) { calibrationMessage(error.message, true); }
  finally { savingCalibration = false; }
}

function initMapControls() {
  const stage=el('cadMapStage'), image=el('cadMapImage');
  el('cadCalibrationArm')?.addEventListener('click', () => {
    if (!snapshot?.permissions?.manager) return;
    const key = el('cadCalibrationPlayer')?.value;
    const player = (snapshot.state?.players || []).find(p => String(p.robloxId || p.player) === key);
    const age = Date.now() - (snapshot.state?.playerSyncAt || 0);
    if (!player || !Number.isFinite(player.locationX) || !Number.isFinite(player.locationZ) || age > 90_000) {
      calibrationMessage('Select a player from a fresh ER:LC snapshot to place a landmark.', true); return;
    }
    pendingLandmark = { worldX: player.locationX, worldZ: player.locationZ, label: el('cadCalibrationLabel')?.value.trim().slice(0,60) || player.location || player.player };
    calibrationMessage(`Click the exact location of ${pendingLandmark.label} on the map image. Use at least three different locations.`);
  });
  el('cadCalibrationReset')?.addEventListener('click', () => {
    if (!snapshot?.permissions?.manager) return;
    if (window.confirm('Remove all saved calibration points for this Discord server?')) void sendCalibration([]);
  });
  stage?.addEventListener('click', event => {
    if (!pendingLandmark || savingCalibration || !snapshot?.permissions?.manager) return;
    if (event.target.closest('.cad-map-marker')) return;
    const canvas = el('cadMapCanvas');
    const rect = canvas.getBoundingClientRect();
    const mapX = (event.clientX - rect.left) / rect.width * 100;
    const mapY = (event.clientY - rect.top) / rect.height * 100;
    if (!Number.isFinite(mapX) || !Number.isFinite(mapY) || mapX < 0 || mapX > 100 || mapY < 0 || mapY > 100) {
      calibrationMessage('Choose a point inside the map image.', true); return;
    }
    const anchors = [...(snapshot.calibration || []), { ...pendingLandmark, mapX, mapY }];
    if (anchors.length > 8) { calibrationMessage('Maximum eight landmarks. Reset first to recalibrate.', true);return; }
    void sendCalibration(anchors);
  });
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
