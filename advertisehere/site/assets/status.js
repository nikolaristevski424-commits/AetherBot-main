(() => {
  const ah = window.AdvertiseHERE, $ = id => document.getElementById(id);
  const state = (id, dot, label, kind) => {
    const el = $(id); el.className = `service-badge ${kind}`;
    el.innerHTML = `<i id="${dot}"></i> ${ah.escapeHtml(label)}`;
  };
  async function refresh() {
    $('statusHeading').textContent = 'Checking service health…';
    const h = await ah.getJson('/api/health');
    const good = h.httpStatus === 200 && h.website === 'online';
    state('webHealth', 'webDot', good ? 'Operational' : 'Check failed', good ? 'online' : 'unknown');
    if (!good) {
      state('botHealth','botDot','Unknown','unknown');state('authHealth','authDot','Unknown','unknown');
      $('statusHeading').textContent='Status could not be verified.';
      $('statusDescription').textContent='The health endpoint is not responding. Please retry.';
      return;
    }
    const bot = h.bot || {};
    state('botHealth','botDot', bot.connected ? 'Connected' : bot.status === 'not-connected' || bot.status === 'not-configured' ? 'Not connected' : 'Unable to verify', bot.connected ? 'online' : 'unknown');
    state('authHealth','authDot',h.discordOAuthConfigured ? 'Configured' : 'Setup required', h.discordOAuthConfigured ? 'online' : 'unknown');
    $('checkedAt').textContent = h.checkedAt ? new Date(h.checkedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : 'Just now';
    $('statusHeading').textContent = bot.connected && h.discordOAuthConfigured ? 'Core services connected.' : 'Some integrations need setup.';
    $('statusDescription').textContent = bot.connected ? 'Verified live bot response received.' : 'Website is responding. Discord integration has not yet been verified.';
    const stats = bot.connected ? bot.stats : null;
    $('healthListings').textContent = stats ? ah.formatCount(stats.approvedListings) : '—';
    $('healthBumps').textContent = stats ? ah.formatCount(stats.totalBumps) : '—';
    $('healthGuilds').textContent = stats ? ah.formatCount(stats.connectedGuilds) : '—';
  }
  $('refreshHealth')?.addEventListener('click', refresh);
  refresh();
})();
