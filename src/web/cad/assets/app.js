const loginView = document.querySelector('#loginView');
const appView = document.querySelector('#appView');
const loginError = document.querySelector('#loginError');
const appNotice = document.querySelector('#appNotice');
const guildSelect = document.querySelector('#serverSelect');
const avatar = document.querySelector('#userAvatar');
const initials = document.querySelector('#userInitials');
const views = ['dispatch', 'erlc', 'settings'];

let currentUser = null;
let currentGuild = null;
let currentData = null;
let guilds = [];
let currentCallFilter = 'active';
let refreshInFlight = false;

function showNotice(message, isError = false) {
  appNotice.textContent = message;
  appNotice.classList.toggle('error', isError);
  appNotice.hidden = !message;
}

function setNavStatus(state) {
  const labels = { live: 'LIVE', stale: 'STALE', offline: 'OFFLINE', idle: 'NO DATA', error: 'ERROR' };
  const dot = document.querySelector('#navStatusDot');
  dot.className = `live-dot ${state}`;
  document.querySelector('#navStatusLabel').textContent = labels[state] || labels.idle;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatTime(timestamp) {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp);
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '—';
  const totalMinutes = Math.floor(durationMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function setView(name) {
  for (const view of views) {
    document.querySelector(`#view-${view}`).hidden = view !== name;
    document.querySelector(`[data-view="${view}"]`).classList.toggle('active', view === name);
  }
}

function showLogin(error) {
  appView.hidden = true;
  loginView.hidden = false;
  if (error) {
    loginError.textContent = error === 'not_configured'
      ? 'CAD sign-in has not been configured by the bot operator.'
      : 'Discord sign-in did not complete. Please try again.';
    loginError.classList.add('error');
    loginError.hidden = false;
  }
  if (error === 'not_configured') {
    document.querySelector('#loginButton').hidden = true;
    document.querySelector('#setupNotice').hidden = false;
  }
}

function renderGuildOptions() {
  guildSelect.replaceChildren(...guilds.map((guild) => {
    const option = document.createElement('option');
    option.value = guild.id;
    option.textContent = guild.name;
    return option;
  }));
  if (currentGuild) guildSelect.value = currentGuild;
}

function renderCalls(calls) {
  const activeCalls = calls.filter((call) => call.status !== 'closed');
  document.querySelector('#urgentCallCount').textContent = activeCalls.filter((call) => call.priority === 'urgent').length;
  const query = document.querySelector('#callSearch').value.trim().toLowerCase();
  const filteredCalls = calls.filter((call) => {
    if (currentCallFilter === 'active' && call.status === 'closed') return false;
    if (currentCallFilter !== 'active' && call.status !== currentCallFilter) return false;
    if (!query) return true;
    return [call.title, call.location, call.details, call.createdByName, ...(call.assignedUnitIds || [])]
      .some((value) => String(value || '').toLowerCase().includes(query));
  }).sort((left, right) => {
    if (left.priority !== right.priority) return left.priority === 'urgent' ? -1 : 1;
    return left.createdAt - right.createdAt;
  });
  document.querySelector('#openCallCount').textContent = activeCalls.length;
  document.querySelector('#callQueueCount').textContent = filteredCalls.length;
  const list = document.querySelector('#callsList');
  if (!filteredCalls.length) {
    list.innerHTML = `<p class="empty-state">${query ? 'No calls match this search.' : 'No calls in this view.'}</p>`;
    return;
  }
  list.innerHTML = filteredCalls.map((call) => `
    <article class="call-row ${call.priority === 'urgent' ? 'urgent' : ''} ${call.status === 'closed' ? 'closed' : ''}">
      <span class="call-bar" aria-hidden="true"></span>
      <div class="call-main">
        <h3 class="call-title">${escapeHtml(call.title)}</h3>
        <div class="call-meta"><span>${escapeHtml(call.location)}</span><span>${formatTime(call.createdAt)}</span><span>${call.status === 'assigned' ? 'Assigned' : escapeHtml(call.status)}</span></div>
        ${call.details ? `<p class="call-details">${escapeHtml(call.details)}</p>` : ''}
      </div>
      <div class="call-actions">
        ${call.status === 'open' ? `<button class="mini-button" data-action="assign-me" data-id="${escapeHtml(call.id)}">Assign me</button>` : ''}
        ${call.status === 'closed' ? `<button class="mini-button" data-action="reopen-call" data-id="${escapeHtml(call.id)}">Reopen</button>` : `<button class="mini-button close-call" data-action="close-call" data-id="${escapeHtml(call.id)}">Close</button>`}
      </div>
    </article>`).join('');
}

function renderUnits(units) {
  const active = units.filter((unit) => unit.status !== 'off_duty');
  document.querySelector('#unitCount').textContent = active.length;
  const list = document.querySelector('#unitsList');
  if (!units.length) {
    list.innerHTML = '<p class="empty-state">No units signed in.</p>';
    return;
  }
  list.innerHTML = units.slice().sort((left, right) => (left.callsign || left.username).localeCompare(right.callsign || right.username)).map((unit) => `
    <div class="unit-row"><div><span class="unit-name">${escapeHtml(unit.username)}</span><span class="unit-callsign">${escapeHtml(unit.callsign || 'No callsign')}</span></div><span class="unit-status ${escapeHtml(unit.status || 'off_duty')}">${escapeHtml((unit.status || 'off_duty').replace('_', ' '))}</span></div>`).join('');
  const ownUnit = units.find((unit) => unit.userId === currentUser.id);
  if (ownUnit) {
    document.querySelector('#callsignInput').value = ownUnit.callsign || '';
    document.querySelector('#unitStatusSelect').value = ownUnit.status || 'available';
  }
}

function renderPlayers(players, syncedAt, serverOnline, staff, events) {
  const isFresh = Boolean(syncedAt && Date.now() - syncedAt <= 90_000);
  const statusLabel = serverOnline === false ? 'Offline' : !syncedAt ? 'Waiting for sync' : isFresh ? 'Live tracking' : 'Snapshot stale';
  const onlineStaff = players.filter((player) => player.isStaff).length;
  setNavStatus(serverOnline === false ? 'offline' : !syncedAt ? 'idle' : isFresh ? 'live' : 'stale');
  document.querySelector('#playerCount').textContent = syncedAt ? players.length : '—';
  document.querySelector('#onlinePlayerCount').textContent = syncedAt ? players.length : '—';
  document.querySelector('#onlineStaffCount').textContent = syncedAt ? onlineStaff : '—';
  document.querySelector('#rosterCount').textContent = syncedAt ? players.length : '0';
  document.querySelector('#playerSyncTime').textContent = syncedAt ? formatTime(syncedAt) : 'Not synced';
  document.querySelector('#serverLinkStatus').innerHTML = `<i class="status-dot ${serverOnline === false ? 'offline' : isFresh ? 'ready' : ''}"></i> ${statusLabel}`;
  const table = document.querySelector('#playersTable');
  if (!players.length) {
    table.innerHTML = `<tr><td colspan="6" class="empty-state">${syncedAt ? serverOnline === false ? 'The private server is offline.' : 'No players in the ER:LC server.' : 'Waiting for the first ER:LC sync.'}</td></tr>`;
  } else {
    table.innerHTML = players.slice().sort((left, right) => {
      if (left.isStaff !== right.isStaff) return left.isStaff ? -1 : 1;
      return left.player.localeCompare(right.player);
    }).map((player) => {
      const robloxId = String(player.robloxId || '');
      const playerName = escapeHtml(player.player || 'Unknown player');
      const profile = /^\d+$/.test(robloxId)
        ? `<a class="player-profile" href="https://www.roblox.com/users/${encodeURIComponent(robloxId)}/profile" target="_blank" rel="noopener noreferrer">${playerName}</a>`
        : `<strong>${playerName}</strong>`;
      const staffBadge = player.isStaff ? `<span class="staff-badge">${escapeHtml(player.staffRole || 'Staff')}</span>` : '';
      const sessionDuration = Date.now() - (player.firstSeenAt || syncedAt || Date.now());
      const coordinates = Number.isFinite(player.locationX) && Number.isFinite(player.locationZ)
        ? `X ${player.locationX.toFixed(0)} / Z ${player.locationZ.toFixed(0)}`
        : '';
      return `<tr class="${player.isStaff ? 'player-is-staff' : ''}">
        <td>${profile}${staffBadge}<small class="player-id">${robloxId ? `ID ${escapeHtml(robloxId)}` : ''}</small></td>
        <td><strong>${escapeHtml(player.team || 'Unknown')}</strong><small class="player-permission">${escapeHtml(player.permission || 'Normal')}</small></td>
        <td>${escapeHtml(player.callsign || '—')}</td>
        <td>${escapeHtml(player.location || 'Location unavailable')}<small class="player-coordinates">${coordinates}</small></td>
        <td>${formatDuration(sessionDuration)}</td>
        <td class="${player.wantedStars > 0 ? 'wanted' : ''}">${player.wantedStars > 0 ? `${escapeHtml(player.wantedStars)} ★` : '—'}</td>
      </tr>`;
    }).join('');
  }

  const staffList = document.querySelector('#staffRosterList');
  if (!staff.length) {
    staffList.innerHTML = '<p class="empty-state">No configured ER:LC staff found.</p>';
  } else {
    staffList.innerHTML = staff.slice().sort((left, right) => left.role.localeCompare(right.role) || left.username.localeCompare(right.username)).map((member) => `
      <div class="staff-row"><div><strong>${escapeHtml(member.username)}</strong><small>${escapeHtml(member.robloxId)}</small></div><span class="staff-badge">${escapeHtml(member.role)}</span></div>`).join('');
  }

  const activityList = document.querySelector('#playerActivityList');
  const recentEvents = events.slice().sort((left, right) => right.at - left.at).slice(0, 24);
  if (!recentEvents.length) {
    activityList.innerHTML = '<p class="empty-state">Join and leave events will appear here.</p>';
  } else {
    activityList.innerHTML = recentEvents.map((event) => {
      const joined = event.type === 'joined';
      const action = joined ? 'Joined' : 'Left';
      const detail = joined ? (event.team || 'Entered server') : `Session ${formatDuration(event.durationMs)}`;
      return `<div class="activity-event ${joined ? 'joined' : 'left'}">
        <span class="activity-mark" aria-hidden="true">${joined ? '+' : '−'}</span>
        <div class="activity-copy"><strong>${escapeHtml(event.player)}</strong><small>${action} · ${escapeHtml(detail)}</small></div>
        <time>${formatTime(event.at)}</time>
      </div>`;
    }).join('');
  }
}

function renderSettings(data) {
  const settingsForm = document.querySelector('#settingsFormSection');
  const readOnly = document.querySelector('#settingsReadOnly');
  settingsForm.hidden = !data.permissions.manager;
  readOnly.hidden = data.permissions.manager;
  document.querySelector('#commandSection').hidden = !data.permissions.commands;
  if (!data.permissions.manager) return;

  const selectedDispatch = new Set(data.config?.dispatchRoleIds || []);
  const selectedCommand = new Set(data.config?.commandRoleIds || []);
  for (const [selectId, selected] of [['dispatchRoles', selectedDispatch], ['commandRoles', selectedCommand]]) {
    const select = document.querySelector(`#${selectId}`);
    for (const option of select.options) option.selected = selected.has(option.value);
  }
}

function renderData(data) {
  currentData = data;
  document.querySelector('#footerServer').textContent = data.guild.name;
  const dispatchNav = document.querySelector('[data-view="dispatch"]');
  dispatchNav.hidden = !data.permissions.dispatch;
  document.querySelector('[data-view="erlc"]').hidden = !data.permissions.dispatch && !data.permissions.commands;
  document.querySelector('[data-view="settings"]').hidden = !data.permissions.manager;
  document.querySelector('#newCallButton').hidden = !data.permissions.dispatch;
  document.querySelector('#unitForm').hidden = !data.permissions.dispatch;
  document.querySelector('#syncPlayersButton').hidden = !data.permissions.dispatch;
  renderCalls(data.state.calls || []);
  renderUnits(data.state.units || []);
  renderPlayers(data.state.players || [], data.state.playerSyncAt, data.state.serverOnline, data.state.staff || [], data.state.playerEvents || []);
  renderSettings(data);
  document.querySelector('#syncIndicator').classList.add('ready');
  document.querySelector('#syncIndicator').classList.remove('error');
  document.querySelector('#lastUpdateLabel').textContent = `Updated ${formatTime(Date.now())}`;
  if (!data.permissions.dispatch && data.permissions.commands) setView('erlc');
  if (data.permissions.manager && !data.permissions.dispatch && !data.permissions.commands) setView('settings');
}

async function loadGuildData() {
  if (!guildSelect.value) return;
  currentGuild = guildSelect.value;
  const guild = guilds.find((item) => item.id === currentGuild);
  document.querySelector('#footerServer').textContent = guild?.name || 'CAD';
  showNotice('');
  try {
    const data = await api(`/cad/api/guilds/${encodeURIComponent(currentGuild)}`);
    renderData(data);
    renderGuildOptions();
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function refreshData() {
  if (refreshInFlight || !currentGuild) return;
  refreshInFlight = true;
  const refreshButton = document.querySelector('#refreshButton');
  try {
    const data = await api(`/cad/api/guilds/${encodeURIComponent(currentGuild)}`);
    renderData(data);
  } catch (error) {
    document.querySelector('#syncIndicator').classList.add('error');
    document.querySelector('#syncIndicator').classList.remove('ready');
    document.querySelector('#lastUpdateLabel').textContent = 'Refresh failed';
    setNavStatus('error');
    showNotice(error.message, true);
  } finally {
    refreshInFlight = false;
    refreshButton.disabled = false;
  }
}

async function handleAction(action) {
  if (!currentGuild) return;
  const target = action.target.closest('[data-action]');
  if (!target) return;
  const callId = target.dataset.id;
  try {
    if (target.dataset.action === 'close-call') {
      await api(`/cad/api/guilds/${currentGuild}/calls/${callId}`, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) });
    } else if (target.dataset.action === 'assign-me') {
      const units = currentData.state.units || [];
      if (!units.some((unit) => unit.userId === currentUser.id)) throw new Error('Set your unit status before assigning calls.');
      const call = currentData.state.calls.find((entry) => entry.id === callId);
      await api(`/cad/api/guilds/${currentGuild}/calls/${callId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'assigned', assignedUnitIds: [...new Set([...(call?.assignedUnitIds || []), currentUser.id])] }),
      });
    } else if (target.dataset.action === 'reopen-call') {
      await api(`/cad/api/guilds/${currentGuild}/calls/${callId}`, { method: 'PATCH', body: JSON.stringify({ status: 'open' }) });
    }
    await refreshData();
  } catch (error) {
    showNotice(error.message, true);
  }
}

async function initialize() {
  document.querySelector('#todayLabel').textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date()).toUpperCase();
  try {
    const session = await api('/cad/api/session');
    currentUser = session.user;
    document.querySelector('#userName').textContent = currentUser.username;
    initials.textContent = currentUser.username.slice(0, 1).toUpperCase();
    if (currentUser.avatar) {
      avatar.src = `https://cdn.discordapp.com/avatars/${encodeURIComponent(currentUser.id)}/${encodeURIComponent(currentUser.avatar)}.png?size=64`;
      avatar.hidden = false;
      initials.hidden = true;
    }
    const guildData = await api('/cad/api/guilds');
    guilds = guildData.guilds;
    appView.hidden = false;
    loginView.hidden = true;
    renderGuildOptions();
    if (!guilds.length) {
      showNotice('No bot-enabled Discord servers currently grant your account CAD access.', true);
      guildSelect.disabled = true;
      return;
    }
    guildSelect.value = guilds[0].id;
    currentGuild = guildSelect.value;
    await loadGuildData();
  } catch (error) {
    if (/sign in with discord/i.test(error.message)) {
      showLogin(new URLSearchParams(location.search).get('authError'));
      return;
    }
    showLogin();
    loginError.textContent = error.message;
    loginError.hidden = false;
  }
}

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
guildSelect.addEventListener('change', loadGuildData);
document.querySelector('#logoutButton').addEventListener('click', async () => {
  try { await api('/cad/api/logout', { method: 'POST' }); } finally { location.assign('/cad/'); }
});
document.querySelector('#newCallButton').addEventListener('click', () => document.querySelector('#callDialog').showModal());
document.querySelector('#closeDialogButton').addEventListener('click', () => document.querySelector('#callDialog').close());
document.querySelector('#cancelCallButton').addEventListener('click', () => document.querySelector('#callDialog').close());
document.querySelector('#callForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api(`/cad/api/guilds/${currentGuild}/calls`, {
      method: 'POST',
      body: JSON.stringify({
        title: document.querySelector('#callTitle').value,
        location: document.querySelector('#callLocation').value,
        details: document.querySelector('#callDetails').value,
        priority: document.querySelector('#callPriority').value,
      }),
    });
    document.querySelector('#callDialog').close();
    event.currentTarget.reset();
    await refreshData();
  } catch (error) { setNavStatus('error'); showNotice(error.message, true); }
});
document.querySelector('#callsList').addEventListener('click', handleAction);
document.querySelector('#callSearch').addEventListener('input', () => renderCalls(currentData?.state.calls || []));
document.querySelector('#callFilters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  currentCallFilter = button.dataset.filter;
  for (const filterButton of document.querySelectorAll('.filter-button')) {
    filterButton.classList.toggle('active', filterButton === button);
  }
  renderCalls(currentData?.state.calls || []);
});
document.querySelector('#refreshButton').addEventListener('click', refreshData);
document.querySelector('#unitForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api(`/cad/api/guilds/${currentGuild}/units/me`, {
      method: 'PUT',
      body: JSON.stringify({ callsign: document.querySelector('#callsignInput').value, status: document.querySelector('#unitStatusSelect').value }),
    });
    await refreshData();
  } catch (error) { showNotice(error.message, true); }
});
document.querySelector('#syncPlayersButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api(`/cad/api/guilds/${currentGuild}/sync-players`, { method: 'POST', body: '{}' });
    await refreshData();
    setView('erlc');
  } catch (error) { showNotice(error.message, true); }
  finally { button.disabled = false; }
});
document.querySelector('#commandForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#commandInput');
  try {
    await api(`/cad/api/guilds/${currentGuild}/commands`, { method: 'POST', body: JSON.stringify({ command: input.value }) });
    input.value = '';
    showNotice('ER:LC command sent.');
  } catch (error) { showNotice(error.message, true); }
});
document.querySelector('#settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const selectedValues = (selector) => [...document.querySelector(selector).selectedOptions].map((option) => option.value);
  try {
    const result = await api(`/cad/api/guilds/${currentGuild}/settings`, {
      method: 'PUT',
      body: JSON.stringify({ dispatchRoleIds: selectedValues('#dispatchRoles'), commandRoleIds: selectedValues('#commandRoles') }),
    });
    currentData.config = result.config;
    showNotice('CAD role access saved.');
    await refreshData();
  } catch (error) { showNotice(error.message, true); }
});

async function loadRoles() {
  if (!currentGuild || !currentData?.permissions.manager) return;
  try {
    const { roles } = await api(`/cad/api/guilds/${currentGuild}/roles`);
    for (const selector of ['#dispatchRoles', '#commandRoles']) {
      const select = document.querySelector(selector);
      select.replaceChildren(...roles.map((role) => {
        const option = document.createElement('option');
        option.value = role.id;
        option.textContent = role.name;
        return option;
      }));
    }
    renderSettings(currentData);
  } catch (error) { showNotice(error.message, true); }
}

document.querySelector('[data-view="settings"]').addEventListener('click', loadRoles);
setInterval(() => {
  if (!appView.hidden && document.visibilityState === 'visible') refreshData();
}, 15000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !appView.hidden) refreshData();
});
initialize();