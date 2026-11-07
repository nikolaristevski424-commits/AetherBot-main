const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let user = null;
let guildId = null;
let guilds = [];
let board = null;
let activeView = 'overview';
let incidentFilter = 'active';
let fetching = false;
let generation = 0;

function node(tag, cls = '', value = null) {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (value !== null) element.textContent = String(value);
  return element;
}
function empty(message) { return node('div', 'empty', message); }
function fmtTime(time) {
  return Number.isFinite(time) ? new Date(time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—';
}
function label(value) {
  return String(value || 'unknown').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
}
function tag(value) { return node('span', 'tag ' + String(value || '').replace(/[^a-z_]/g, ''), label(value)); }
function notice(message, type = 'error') {
  const n = $('#notice');
  n.textContent = message;
  n.className = 'notice ' + type;
  n.hidden = !message;
}
function setConnection(ok) {
  $('#sideDot').classList.toggle('offline', !ok);
  $('#sideLabel').textContent = ok ? 'CONNECTED' : 'OFFLINE';
  $('#connectionLabel').textContent = ok ? 'Connected' : 'Refresh failed';
}
async function api(url, init = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin', cache: 'no-store',
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
  });
  let data = null;
  if (response.status !== 204) data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Request failed (' + response.status + ')');
  return data;
}
function root() { return '/cad/api/v2/' + encodeURIComponent(guildId); }
function navigate(view) {
  activeView = view;
  for (const button of $$('[data-view]')) button.classList.toggle('active', button.dataset.view === view);
  for (const section of $$('.view')) section.hidden = section.id !== 'view-' + view;
  $('#breadcrumb').textContent = view.toUpperCase();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showLogin(error) {
  $('#app').hidden = true;
  $('#loginScreen').hidden = false;
  const code = error === 'not_configured' ? 'OAuth sign-in has not been set up on this server.' :
    error === 'login_failed' ? 'Discord sign-in was not completed. Please try again.' :
    error && error !== 'unauthenticated' ? error : '';
  $('#loginError').textContent = code;
  $('#loginError').hidden = !code;
}
function setPermissions(p) {
  const canWrite = Boolean(p?.dispatch);
  $$('.dispatch-only').forEach(el => { el.hidden = !canWrite; });
  $('#unitReadOnly').hidden = canWrite;
  $('[data-view="activity"], [data-view="settings"]').forEach(el => { el.hidden = !p?.manager; });
  $('[data-view="commands"]').forEach(el => { el.hidden = !(p?.manager || p?.commands); });
  if ((!p?.manager && ['activity','settings'].includes(activeView)) ||
      (!(p?.manager || p?.commands) && activeView === 'commands')) navigate('overview');
}
function itemMain(title, subtitle, details) {
  const main = node('div', 'item-main');
  main.append(node('div', 'item-title', title));
  main.append(node('div', 'item-sub', subtitle));
  if (details) main.append(node('p', 'item-notes', details));
  return main;
}
function renderOverview() {
  const incidents = board.state.incidents || [];
  const units = board.state.units || [];
  const active = incidents.filter(x => x.status !== 'closed');
  $('#metricIncidents').textContent = active.length;
  $('#metricUnits').textContent = units.filter(x => x.status !== 'off_duty').length;
  $('#metricHigh').textContent = active.filter(x => x.priority === 'critical' || x.priority === 'high').length;
  const synced = board.state.playerSyncAt;
  $('#metricPlayers').textContent = synced ? (board.state.players || []).length : '—';
  $('#metricPlayersSub').textContent = synced ? 'Last sync ' + fmtTime(synced) : 'Waiting for sync';
  const queue = $('#overviewIncidents');
  queue.replaceChildren();
  const priority = { critical: 0, high: 1, routine: 2 };
  for (const incident of active.sort((a, b) => (priority[a.priority] ?? 3) - (priority[b.priority] ?? 3) || b.createdAt - a.createdAt).slice(0, 5)) {
    const row = node('div', 'item-row ' + incident.priority);
    row.append(itemMain(incident.title, incident.reference + ' · ' + incident.location + ' · ' + fmtTime(incident.createdAt), incident.details));
    row.append(tag(incident.priority));
    queue.append(row);
  }
  if (!queue.childElementCount) queue.append(empty('No active incidents. Your queue is clear.'));
  const roster = $('#overviewUnits');
  roster.replaceChildren();
  for (const unit of units.filter(x => x.status !== 'off_duty').slice(0, 6)) {
    const row = node('div', 'item-row');
    row.append(itemMain(unit.callsign, unit.username || '', ''));
    row.append(tag(unit.status));
    roster.append(row);
  }
  if (!roster.childElementCount) roster.append(empty('No units on duty. Set your status to get started.'));
}
function getFilteredIncidents() {
  const search = $('#incidentSearch').value.trim().toLowerCase();
  return (board?.state?.incidents || []).filter(i => {
    if (incidentFilter === 'active' ? i.status === 'closed' : i.status !== incidentFilter) return false;
    return !search || [i.title, i.location, i.reference, i.details].some(v => String(v || '').toLowerCase().includes(search));
  }).sort((a, b) => b.createdAt - a.createdAt);
}
function incidentCard(i) {
  const card = node('article', 'incident-card ' + i.priority);
  const top = node('div', 'incident-top');
  top.append(node('span', 'incident-ref', i.reference || i.id?.slice(0, 8)));
  const badges = node('div');
  badges.style.display = 'flex'; badges.style.gap = '7px';
  badges.append(tag(i.priority), tag(i.status)); top.append(badges); card.append(top);
  const content = node('div', 'incident-main');
  content.append(node('h3', '', i.title), node('p', '', i.details || 'No additional dispatch notes.'));
  card.append(content);
  const meta = node('div', 'incident-meta');
  meta.append(node('span', '', '⌖ ' + i.location), node('span', '', '◷ ' + fmtTime(i.createdAt)));
  const assignedNames = (i.assignedUnitIds || []).map(id => board.state.units.find(u => u.userId === id)?.callsign || id);
  meta.append(node('span', '', '◇ ' + (assignedNames.join(', ') || 'Unassigned')));
  card.append(meta);
  if (board.permissions.dispatch) {
    const actions = node('div', 'incident-actions');
    const statusLabel = node('label', '', 'STATUS');
    const status = node('select');
    status.setAttribute('aria-label', 'Change incident status');
    for (const optionValue of ['pending','dispatched','on_scene','closed']) {
      const option = node('option', '', label(optionValue)); option.value = optionValue; status.append(option);
    }
    status.value = i.status;
    status.addEventListener('change', async () => {
      await mutate(() => api(root() + '/incidents/' + encodeURIComponent(i.id), { method: 'PATCH', body: JSON.stringify({ status: status.value }) }), 'Incident updated');
    });
    statusLabel.append(status);
    const unitLabel = node('label', '', 'ASSIGN UNIT');
    const select = node('select');
    select.setAttribute('aria-label', 'Assign a unit to incident');
    const unassigned = node('option', '', 'Unassigned'); unassigned.value = ''; select.append(unassigned);
    for (const unit of board.state.units.filter(x => x.status !== 'off_duty')) {
      const option = node('option', '', unit.callsign + ' · ' + unit.username); option.value = unit.userId; select.append(option);
    }
    select.value = i.assignedUnitIds?.[0] || '';
    select.addEventListener('change', async () => {
      await mutate(() => api(root() + '/incidents/' + encodeURIComponent(i.id), { method: 'PATCH', body: JSON.stringify({
        assignedUnitIds: select.value ? [select.value] : [],
      }) }), 'Unit assignment updated');
    });
    unitLabel.append(select);
    actions.append(statusLabel, unitLabel);
    card.append(actions);
  }
  return card;
}
function renderIncidents() {
  const list = $('#incidentList'); list.replaceChildren();
  const incidents = getFilteredIncidents();
  for (const incident of incidents) list.append(incidentCard(incident));
  if (!incidents.length) list.append(empty('No incidents found for this filter.'));
}
function renderUnits() {
  const list = $('#unitList'); list.replaceChildren();
  const units = (board.state.units || []).slice().sort((a,b) => (a.callsign||'').localeCompare(b.callsign||''));
  $('#unitTotal').textContent = units.length;
  for (const unit of units) {
    const row = node('div', 'item-row');
    row.append(itemMain(unit.callsign || 'No callsign', unit.username || '', 'Updated ' + fmtTime(unit.updatedAt)));
    row.append(tag(unit.status));
    list.append(row);
  }
  if (!units.length) list.append(empty('No units have joined the roster yet.'));
  const mine = units.find(u => u.userId === user.id);
  if (mine && document.activeElement !== $('#callsign')) {
    $('#callsign').value = mine.callsign;
    $('#unitStatus').value = mine.status;
  }
}
function renderBolos() {
  const list = $('#boloList'); list.replaceChildren();
  const items = (board.state.bolos || []).filter(b => b.active).sort((a,b) => b.createdAt - a.createdAt);
  $('#boloTotal').textContent = items.length;
  for (const bolo of items) {
    const row = node('div', 'item-row');
    row.append(itemMain(bolo.subject, 'Issued by ' + (bolo.createdByName || 'Operator') + ' · ' + fmtTime(bolo.createdAt), bolo.description));
    const actions = node('div', 'item-actions');
    actions.append(tag('high'));
    if (board.permissions.dispatch) {
      const archive = node('button', '', 'Archive');
      archive.type = 'button';
      archive.addEventListener('click', async () => {
        if (!confirm('Archive this BOLO bulletin?')) return;
        await mutate(() => api(root() + '/bolos/' + encodeURIComponent(bolo.id) + '/archive', { method:'PATCH', body:'{}' }), 'BOLO archived');
      });
      actions.append(archive);
    }
    row.append(actions); list.append(row);
  }
  if (!items.length) list.append(empty('No active BOLO bulletins.'));
}
function renderErlc() {
  const { players = [], playerEvents = [], staff = [], serverOnline, playerSyncAt } = board.state;
  const fresh = playerSyncAt && Date.now() - playerSyncAt < 90000;
  $('#erlcStatus').textContent = serverOnline === false ? 'Offline' : fresh ? 'Live' : playerSyncAt ? 'Stale' : 'Not synced';
  $('#erlcCount').textContent = playerSyncAt ? players.length : '—';
  $('#erlcStaff').textContent = playerSyncAt ? players.filter(p => p.isStaff).length : '—';
  $('#erlcSync').textContent = playerSyncAt ? fmtTime(playerSyncAt) : 'Never';
  const tbody = $('#playerRows'); tbody.replaceChildren();
  for (const player of players.slice(0, 200)) {
    const row = node('tr');
    const cells = [player.player || 'Unknown', player.team || '—', player.callsign || '—',
      player.location || '—', player.staffRole || (player.isStaff ? 'Staff' : '—')];
    for (const value of cells) row.append(node('td', '', value));
    tbody.append(row);
  }
  if (!players.length) {
    const row = node('tr'), cell = node('td', '', 'No tracked players. Connect ER:LC using /erlc setup in Discord.');
    cell.colSpan = 5; row.append(cell); tbody.append(row);
  }
  const feed = $('#playerEvents'); feed.replaceChildren();
  for (const event of playerEvents.slice(-25).reverse()) {
    const row = node('div', 'activity-entry');
    row.append(node('span', 'activity-icon', event.type === 'joined' ? '↗' : '↙'));
    const body = node('div');
    body.append(node('strong', '', (event.player || 'Player') + (event.type === 'joined' ? ' joined' : ' left')));
    body.append(node('p', '', event.team || 'ER:LC server'));
    row.append(body, node('time', '', fmtTime(event.at))); feed.append(row);
  }
  if (!feed.childElementCount) feed.append(empty('Join and leave activity will appear after ER:LC syncing.'));
}
function renderActivity() {
  const list = $('#auditList'); list.replaceChildren();
  if (!board.permissions.manager) { list.append(empty('Only server managers can view the audit log.')); return; }
  const events = (board.state.audit || []).slice(-80).reverse();
  for (const entry of events) {
    const row = node('div', 'activity-entry');
    row.append(node('span', 'activity-icon', '✦'));
    const body = node('div');
    body.append(node('strong', '', label(entry.action.replaceAll('.', ' · '))));
    body.append(node('p', '', 'By ' + (entry.actorName || 'Operator')));
    row.append(body, node('time', '', fmtTime(entry.at))); list.append(row);
  }
  if (!events.length) list.append(empty('No operator activity recorded yet.'));
}
function render() {
  if (!board) return;
  setPermissions(board.permissions);
  renderOverview(); renderIncidents(); renderUnits(); renderBolos(); renderErlc(); renderActivity();
  $('#footerTime').textContent = 'Updated ' + new Date().toLocaleTimeString();
}
async function refreshData() {
  if (!guildId || fetching) return;
  const stamp = ++generation; const requested = guildId; fetching = true;
  try {
    const response = await api('/cad/api/v2/' + requested + '/board');
    if (stamp !== generation || requested !== guildId) return;
    board = response;
    render();
    if (activeView === 'settings' && board.permissions.manager) await loadSettings();
    setConnection(true);
    notice('');
  } catch (error) { if (stamp === generation) { setConnection(false); notice(error.message); } }
  finally { fetching = false; }
}
async function mutate(work, success) {
  try {
    await work();
    await refreshData();
    notice(success, 'success');
  } catch (error) { notice(error.message); }
}
function setGuild(id) {
  if (!guilds.some(g => g.id === id)) return;
  guildId = id; generation++; board = null;
  $('#guildSelect').value = id;
  if (fetching) {
    // Discard the previous guild's response, then load the newly selected server.
    const next = () => { if (!fetching && guildId === id) refreshData(); else setTimeout(next, 50); };
    next();
  } else refreshData();
}
async function loadSettings() {
  if (!guildId || !board?.permissions?.manager) return;
  try {
    const requestedGuild = guildId;
    const [details, available] = await Promise.all([
      api('/cad/api/guilds/' + requestedGuild),
      api('/cad/api/guilds/' + requestedGuild + '/roles'),
    ]);
    if (requestedGuild !== guildId) return;
    for (const [id, values] of [
      ['dispatchRoles', details.config?.dispatchRoleIds || []],
      ['commandRoles', details.config?.commandRoleIds || []],
    ]) {
      const select = $('#' + id);
      select.replaceChildren();
      const chosen = new Set(values);
      for (const role of (available.roles || [])) {
        const option = node('option', '', role.name);
        option.value = role.id; option.selected = chosen.has(role.id);
        select.append(option);
      }
    }
  } catch (error) { notice('Role settings could not be loaded: ' + error.message); }
}
async function initialize() {
  const authError = new URLSearchParams(location.search).get('authError');
  try {
    const session = await api('/cad/api/session');
    user = session.user;
    $('#accountName').textContent = user.username || 'Discord user';
    $('#accountAvatar').textContent = (user.username || 'A').slice(0,1).toUpperCase();
    const guildResponse = await api('/cad/api/guilds');
    guilds = guildResponse.guilds || [];
    const picker = $('#guildSelect'); picker.replaceChildren();
    for (const guild of guilds) { const option = node('option', '', guild.name); option.value = guild.id; picker.append(option); }
    $('#loginScreen').hidden = true; $('#app').hidden = false;
    if (guilds.length) setGuild(guilds[0].id);
    else notice('No Discord server grants this account access to Aether CAD.');
  } catch (error) {
    showLogin(authError || (error.message.includes('Sign in') ? 'unauthenticated' : error.message));
    try {
      const cfg = await api('/cad/auth/config');
      if (!cfg.enabled) {
        $('#loginButton').hidden = true;
        $('#setupError').hidden = false;
      }
    } catch {}
  }
}
for (const button of $('[data-view]')) button.addEventListener('click', () => {
  navigate(button.dataset.view);
  if (button.dataset.view === 'settings') loadSettings();
});
for (const button of $$('[data-jump]')) button.addEventListener('click', () => navigate(button.dataset.jump));
for (const button of $$('[data-open]')) button.addEventListener('click', () => {
  if (!board?.permissions?.dispatch) return;
  $('#' + button.dataset.open + 'Dialog').showModal();
});
for (const button of $$('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
$('#incidentSearch').addEventListener('input', renderIncidents);
$('#incidentFilters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]'); if (!button) return;
  incidentFilter = button.dataset.filter;
  $$('#incidentFilters [data-filter]').forEach(el => el.classList.toggle('selected', el === button));
  renderIncidents();
});
$('#guildSelect').addEventListener('change', event => setGuild(event.target.value));
$('#refreshButton').addEventListener('click', refreshData);
$('#logoutButton').addEventListener('click', async () => {
  try { await api('/cad/api/logout', { method: 'POST' }); }
  finally { location.href = '/cad/'; }
});
$('#incidentForm').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
  try {
    await api(root() + '/incidents', { method:'POST', body:JSON.stringify({
      title:$('#incidentTitle').value, location:$('#incidentLocation').value,
      details:$('#incidentDetails').value, priority:$('#incidentPriority').value,
    }) });
    $('#incidentDialog').close(); event.currentTarget.reset();
    navigate('incidents'); await refreshData(); notice('Incident created.', 'success');
  } catch (error) { notice(error.message); }
  finally { submit.disabled = false; }
});
$('#unitForm').addEventListener('submit', async event => {
  event.preventDefault();
  await mutate(() => api(root() + '/unit', { method:'PUT', body:JSON.stringify({
    callsign:$('#callsign').value, status:$('#unitStatus').value,
  }) }), 'Duty status saved.');
});
$('#boloForm').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
  try {
    await api(root() + '/bolos', { method:'POST', body:JSON.stringify({
      subject:$('#boloSubject').value, description:$('#boloDescription').value,
    }) });
    $('#boloDialog').close(); event.currentTarget.reset();
    await refreshData(); notice('BOLO published.', 'success');
  } catch (error) { notice(error.message); }
  finally { submit.disabled = false; }
});
$('#commandForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!board?.permissions?.commands && !board?.permissions?.manager) return notice('ER:LC command permission is required.');
  const command = $('#commandInput').value.trim();
  if (!command || command.length > 200) return notice('Enter a valid single-line ER:LC command.');
  if (!confirm('Send this command to the selected ER:LC private server?\n\n' + command)) return;
  const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
  try {
    await api('/cad/api/guilds/' + guildId + '/commands', { method:'POST', body: JSON.stringify({ command }) });
    $('#commandInput').value = '';
    notice('ER:LC command sent and recorded.', 'success');
  } catch (error) { notice(error.message); }
  finally { submit.disabled = false; }
});
$('#rolesForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!board?.permissions?.manager) return notice('Only server managers may change CAD permissions.');
  const selected = id => [...$('#' + id).selectedOptions].map(option => option.value);
  const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
  try {
    await api('/cad/api/guilds/' + guildId + '/settings', { method:'PUT', body: JSON.stringify({
      dispatchRoleIds: selected('dispatchRoles'), commandRoleIds: selected('commandRoles'),
    }) });
    await refreshData();
    notice('Role permissions saved.', 'success');
  } catch (error) { notice(error.message); }
  finally { submit.disabled = false; }
});
$('#syncPlayers').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try {
    await api('/cad/api/guilds/' + guildId + '/sync-players', { method:'POST', body:'{}' });
    await refreshData(); notice('ER:LC sync requested.', 'success');
  } catch (error) { notice(error.message); }
  finally { button.disabled = false; }
});
setInterval(() => { if (!document.hidden) refreshData(); }, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshData(); });
initialize();