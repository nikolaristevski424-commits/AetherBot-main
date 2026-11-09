(() => {
  document.documentElement.classList.add('js');
  const menu = document.getElementById('menuToggle');
  const mobile = document.getElementById('mobileNav');
  function closeMenu() { if (!mobile) return; mobile.hidden = true; menu?.setAttribute('aria-expanded', 'false'); }
  menu?.addEventListener('click', () => {
    if (!mobile) return;
    mobile.hidden = !mobile.hidden;
    menu.setAttribute('aria-expanded', String(!mobile.hidden));
  });
  mobile?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveal = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    const obs = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('revealed'); obs.unobserve(e.target); }
    }, { threshold: 0.06, rootMargin: '0px 0px -15px 0px' });
    reveal.forEach(el => obs.observe(el));
  } else reveal.forEach(el => el.classList.add('revealed'));
})();

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const labelCategory = key => ({ roleplay:'ER:LC & roleplay', gaming:'Gaming', creative:'Creative studios', development:'Development', social:'Social', other:'Other' }[key] || 'Community');
const formatCount = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '—';
function verifiedInvite(value) { return typeof value === 'string' && /^https:\/\/discord\.gg\/[a-zA-Z0-9-]{2,64}$/.test(value) ? value : null; }
function listingCard(item) {
  const title = escapeHtml(item.title || 'Discord community');
  const initials = escapeHtml((item.title || 'AD').slice(0, 2).toUpperCase());
  const desc = escapeHtml(item.description || 'Discover this community on Discord.');
  const cat = escapeHtml(labelCategory(item.category));
  const invite = verifiedInvite(item.invite);
  const memberCount = Number.isSafeInteger(item.memberCount) && item.memberCount >= 0 ? `${formatCount(item.memberCount)} members` : 'Members not reported';
  const bumpCount = Number.isSafeInteger(item.bumpCount) && item.bumpCount >= 0 ? `${formatCount(item.bumpCount)} bumps` : 'Bumps unavailable';
  const action = invite ? `<a href="${escapeHtml(invite)}" target="_blank" rel="noopener noreferrer nofollow">Join community ↗</a>` : '<span>Invite unavailable</span>';
  return `<article class="listing-card"><div class="listing-card-head"><div class="listing-avatar">${initials}</div><div><h3>${title}</h3><p>${cat}</p></div></div><p class="listing-description">${desc}</p><div class="listing-foot"><span>${memberCount} · ${bumpCount}</span>${action}</div></article>`;
}
function emptyState(title, message, action = '') {
  return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">✳</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>${action}</div>`;
}
async function getJson(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { cache:'no-store', credentials:'same-origin', ...options, signal:controller.signal });
    let data;
    try { data = await response.json(); } catch { data = { error:'Unexpected response from the server' }; }
    return { ...data, httpStatus:response.status };
  } catch { return { error:'The connection could not be completed. Please try again.', httpStatus:0 }; }
  finally { clearTimeout(timeout); }
}
function toast(message, kind='info') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = String(message).slice(0, 400);
  region.appendChild(el);
  setTimeout(() => el.remove(), 5400);
}
window.AdvertiseHERE = { escapeHtml, labelCategory, formatCount, verifiedInvite, listingCard, emptyState, getJson, toast };
