const q = selector => document.querySelector(selector);
const menu = q('#menuToggle');
menu?.addEventListener('click', () => {
  const expanded = menu.getAttribute('aria-expanded') === 'true';
  menu.setAttribute('aria-expanded', String(!expanded));
  q('#navLinks').classList.toggle('open', !expanded);
});
document.querySelectorAll('.nav-links a').forEach(link => link.addEventListener('click', () => {
  q('#navLinks').classList.remove('open');
  menu?.setAttribute('aria-expanded', 'false');
}));
q('#year').textContent = String(new Date().getFullYear());
function setInvite(url) {
  for (const id of ['inviteTop', 'inviteStep', 'inviteBottom']) {
    const el = q('#' + id);
    if (url) { el.href = url; el.removeAttribute('aria-disabled'); el.classList.remove('disabled-link'); }
    else { el.title = 'Bot invitation is not configured on this host'; }
  }
}
async function loadConfiguration() {
  try {
    const response = await fetch('/api/public/config', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setInvite(data.inviteUrl || null);
    if (data.supportUrl) {
      const el = q('#supportLink');
      el.href = data.supportUrl;
      el.hidden = false;
      el.rel = 'noopener noreferrer';
      el.target = '_blank';
    }
  } catch { /* Keep the CTA disabled when the service is offline. */ }
}
function uptime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  return days ? days + 'd ' + hours + 'h' : hours + 'h ' + Math.floor(seconds % 3600 / 60) + 'm';
}
async function refreshStatus() {
  q('#systemStatus').textContent = 'Checking connection…';
  try {
    const response = await fetch('/api/public/overview', { cache: 'no-store' });
    if (!response.ok) throw new Error('API unavailable');
    const data = await response.json();
    q('#systemStatus').textContent = data.ready ? 'All systems connected' : 'Bot not connected';
    q('#statusDot').classList.toggle('offline', !data.ready);
    q('#statServers').textContent = data.ready ? Number(data.servers || 0).toLocaleString() : '—';
    q('#statCommands').textContent = data.ready ? Number(data.commands || 0).toLocaleString() : '—';
    q('#statUptime').textContent = data.ready ? uptime(data.uptimeSeconds) : '—';
    q('#statPing').textContent = data.ready && Number.isFinite(data.gatewayPingMs) ? Math.round(data.gatewayPingMs) + ' ms' : '—';
    q('#lastChecked').textContent = 'Checked ' + new Date().toLocaleTimeString();
  } catch {
    q('#systemStatus').textContent = 'Connection unavailable';
    q('#statusDot').classList.add('offline');
    for (const id of ['statServers', 'statCommands', 'statUptime', 'statPing']) q('#' + id).textContent = '—';
    q('#lastChecked').textContent = 'Live statistics could not be loaded.';
  }
}
q('#refreshStatus').addEventListener('click', refreshStatus);
loadConfiguration();
refreshStatus();
setInterval(refreshStatus, 60000);
