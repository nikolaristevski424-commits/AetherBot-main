import { buildMapMarkers, DEFAULT_MAP_LAYER, getPlayerSnapshot, MAP_LAYERS } from './mapModel.js';

let snapshot = null;
let currentFilter = 'all';
let zoom = 1;
let panX = 0;
let panY = 0;
let selected = null;
let pendingLandmark = null;
let savingCalibration = false;
let follow = false;
let markers = [];
let layer = DEFAULT_MAP_LAYER;

const el = id => document.getElementById(id);

function applyTransform() {
  const stage = el('cadMapStage');
  const canvas = el('cadMapCanvas');
  if (stage && canvas) {
    const maxX = stage.clientWidth * (zoom - 1) / 2;
    const maxY = stage.clientHeight * (zoom - 1) / 2;
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
    canvas.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
  }
  el('cadMapZoomValue').textContent = `${Math.round(zoom * 100)}%`;
}

function centerMarker(item) {
  const stage = el('cadMapStage');
  if (!item?.point || !stage?.clientWidth) return;
  zoom = Math.max(2, zoom);
  panX = (0.5 - item.point.x / 100) * stage.clientWidth * zoom;
  panY = (0.5 - item.point.y / 100) * stage.clientHeight * zoom;
  applyTransform();
}

function clearDetails() {
  selected = null;
  follow = false;
  el('cadMapDetails').textContent = 'Select a player or 911 call to inspect it.';
  el('cadMapFollow').disabled = true;
  el('cadMapFollow').setAttribute('aria-pressed', 'false');
}

function showMarker(item, center = false) {
  selected = item.key;
  const detail = el('cadMapDetails');
  const header = document.createElement('h3'); header.textContent = item.title;
  const coordinates = item.point ? `X ${item.x.toFixed(0)} / Z ${item.z.toFixed(0)}` : 'No position on this map';
  const lines = [item.type === 'call' ? `911 dispatch · ${item.status}` : item.team,
    item.location || 'Location unavailable', coordinates,
    item.type === 'call' ? item.details : item.callsign ? `Callsign: ${item.callsign}` : ''];
  const list = document.createElement('div');
  list.className = 'map-info-lines';
  for (const entry of lines.filter(Boolean)) {
    const line = document.createElement('p'); line.textContent = String(entry).slice(0, 450); list.append(line);
  }
  detail.replaceChildren(header, list);
  for (const button of document.querySelectorAll('#cadMapPins button, #cadMapList button')) {
    button.classList.toggle('selected', button.dataset.key === item.key);
  }
  el('cadMapFollow').disabled = item.type !== 'player' || !item.point;
  el('cadMapFollow').setAttribute('aria-pressed', String(follow));
  if (center || follow) centerMarker(item);
}

function renderMarkerButtons(parent, entries, create, update) {
  const existing = new Map([...parent.querySelectorAll('[data-key]')].map(button => [button.dataset.key, button]));
  let cursor = parent.firstChild;
  for (const marker of entries) {
    const button = existing.get(marker.key) || create(marker);
    existing.delete(marker.key);
    update(button, marker);
    if (cursor !== button) parent.insertBefore(button, cursor);
    cursor = button.nextSibling;
  }
  while (cursor) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
}

function itemButton(item, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.key = item.key;
  button.addEventListener('click', () => {
    const marker = markers.find(entry => entry.key === button.dataset.key);
    if (!marker) return;
    if (selected !== marker.key) follow = false;
    showMarker(marker, className === 'map-player-row');
  });
  return button;
}

function renderPins(entries) {
  renderMarkerButtons(el('cadMapPins'), entries.filter(item => item.point), item => itemButton(item, 'cad-map-marker'), (pin, item) => {
    pin.className = `cad-map-marker ${item.group}`;
    pin.style.left = `${item.point.x}%`;
    pin.style.top = `${item.point.y}%`;
    pin.textContent = item.type === 'call' ? '!' : (item.callsign || item.title).slice(0, 3).toUpperCase();
    pin.setAttribute('aria-label', `${item.type === 'call' ? '911 incident' : 'Player'}: ${item.title}, ${item.location || 'location unavailable'}`);
    pin.title = `${item.title} · ${item.location || 'Location unavailable'}`;
  });
}

function renderRoster(entries, message) {
  const roster = el('cadMapList');
  renderMarkerButtons(roster, entries, item => {
    const button = itemButton(item, 'map-player-row');
    const badge = document.createElement('span');
    badge.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    copy.className = 'map-player-copy';
    copy.append(document.createElement('strong'), document.createElement('small'));
    button.append(badge, copy);
    return button;
  }, (row, item) => {
    const [badge, copy] = row.children;
    badge.className = `map-team-dot ${item.group}`;
    copy.children[0].textContent = item.title;
    copy.children[1].textContent = [item.type === 'call' ? '911' : item.callsign || item.team, item.location || 'Location unavailable', item.point ? '' : 'No pin'].filter(Boolean).join(' · ');
  });
  if (!entries.length) {
    const empty = document.createElement('p'); empty.className = 'map-empty'; empty.textContent = message;
    roster.append(empty);
  }
}

export function renderCadMap(data) {
  const previousGuild = snapshot?.guild?.id;
  if (previousGuild && previousGuild !== data?.guild?.id) clearDetails();
  snapshot = data;
  const state = data?.state || {};
  const live = getPlayerSnapshot(state);
  const tracking = data?.tracking;
  const count = live.players.length;
  const located = live.players.filter(player => Number.isFinite(player.locationX) && Number.isFinite(player.locationZ)).length;
  const note = live.status === 'current' ? `Updated ${Math.round(live.age / 1000)}s ago`
    : live.status === 'delayed' ? `Delayed · last update ${Math.round(live.age / 1000)}s ago`
    : live.status === 'expired' ? 'Snapshot expired · player positions hidden'
    : live.status === 'offline' ? 'Private server offline' : 'Waiting for the first snapshot';
  const status = el('cadMapState');
  const message = tracking?.message && tracking.status !== 'current' ? `${note}. ${tracking.message}` : note;
  if (status.textContent !== message) status.textContent = message;
  status.dataset.state = live.status;
  el('cadMapPlayerCount').textContent = String(count);
  el('cadMapLocatedCount').textContent = String(located);
  el('cadMapCallCount').textContent = String((state.calls || []).filter(call => call.status !== 'closed').length);
  const search = el('cadMapSearch').value;
  markers = buildMapMarkers(state, data?.mapTransform, search, currentFilter);
  renderPins(markers);
  renderRoster(markers, search || currentFilter !== 'all' ? 'No results match these filters.' : tracking?.message || 'No current players or open calls.');
  if (selected) {
    const item = markers.find(marker => marker.key === selected);
    if (item) showMarker(item);
    else clearDetails();
  }
  if (data) updateCalibrationPanel(data, live.players);
  else {
    el('cadCalibrationPanel').hidden = true;
    pendingLandmark = null;
    clearDetails();
  }
}

export function focusCadMapPlayer(id) {
  const item = markers.find(marker => marker.key === 'player:' + id);
  if (!item) return false;
  showMarker(item, true);
  return true;
}

function loadMapLayer() {
  const image = el('cadMapImage');
  if (!image) return;
  el('cadMapImageError').hidden = true;
  image.hidden = false;
  image.dataset.fallback = '0';
  image.src = '/cad/map-image/' + layer;
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
  image?.addEventListener('load', () => { el('cadMapImageError').hidden = true; });
  image?.addEventListener('error', () => {
    if (image.dataset.fallback !== '1') {
      image.dataset.fallback = '1';
      image.src = 'https://api.erlc.gg/maps/' + MAP_LAYERS[layer];
      return;
    }
    image.hidden = true;
    el('cadMapImageError').hidden = false;
  });
  el('cadMapSeason')?.addEventListener('change', chooseLayer);
  el('cadMapPostals')?.addEventListener('change', chooseLayer);
  function chooseLayer() {
    const value = el('cadMapSeason').value + (el('cadMapPostals').checked ? '-postals' : '');
    if (Object.hasOwn(MAP_LAYERS, value)) { layer = value; loadMapLayer(); }
  }
  el('cadMapRetry')?.addEventListener('click', loadMapLayer);
  el('cadMapSearch')?.addEventListener('input', () => { if (snapshot) renderCadMap(snapshot); });
  el('cadMapFollow')?.addEventListener('click', () => {
    follow = !follow;
    const item = markers.find(marker => marker.key === selected);
    if (item) showMarker(item);
  });
  loadMapLayer();
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
    panY=dragging.py+event.clientY-dragging.y;applyTransform();});
  stage.addEventListener('pointerup',()=>{dragging=null;});
  stage.addEventListener('pointercancel',()=>{dragging=null;});
  applyTransform();
}
initMapControls();
