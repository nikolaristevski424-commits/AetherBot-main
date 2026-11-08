(() => {
  document.documentElement.classList.add('js');
  const menuBtn = document.querySelector('#menuToggle');
  const mobileNav = document.querySelector('#mobileNav');
  menuBtn?.addEventListener('click', () => {
    const next = mobileNav.hasAttribute('hidden');
    mobileNav.toggleAttribute('hidden', !next);
    menuBtn.setAttribute('aria-expanded', String(next));
  });
  document.querySelectorAll('#mobileNav a').forEach(link => link.addEventListener('click', () => {
    mobileNav.setAttribute('hidden', '');
    menuBtn?.setAttribute('aria-expanded', 'false');
  }));
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(items => {
    for (const item of items) if (item.isIntersecting) { item.target.classList.add('revealed'); observer.unobserve(item.target); }
  }, { threshold: 0.09, rootMargin: '0px 0px -25px 0px' }) : null;
  document.querySelectorAll('[data-reveal]').forEach(el => observer ? observer.observe(el) : el.classList.add('revealed'));
})();
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const labelCategory = s => ({roleplay:'ER:LC / Roleplay',gaming:'Gaming',creative:'Creative',development:'Development',social:'Social',other:'Other'}[s] || 'Community');
function listingCard(listing) {
  const title=escapeHtml(listing.title), category=escapeHtml(labelCategory(listing.category)), description=escapeHtml(listing.description);
  const invite = typeof listing.invite==='string' && /^https:\/\/discord\.gg\/[a-zA-Z0-9-]{2,64}$/.test(listing.invite) ? listing.invite : '#';
  const members = Number.isInteger(listing.memberCount) && listing.memberCount >= 0 ? `${listing.memberCount.toLocaleString()} members` : 'Discord community';
  return `<article class="listing-card"><div class="listing-top"><div class="listing-avatar">${title[0] || 'A'}</div><div><h3 class="listing-title">${title}</h3><div class="listing-category">${category}</div></div></div><p class="listing-desc">${description}</p><div class="listing-bottom"><small>${members} · ${Number(listing.bumpCount || 0)} bumps</small><a href="${escapeHtml(invite)}" target="_blank" rel="noopener noreferrer nofollow">Join server ↗</a></div></article>`;
}
function emptyState(title, message, cta = '') {
  return `<div class="empty-state"><div class="empty-symbol">◌</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>${cta}</div>`;
}
async function getJson(path, options) {
  const r = await fetch(path, { cache:'no-store', ...options });
  let j;try{j=await r.json();}catch{j={error:'Unexpected response from server'};}
  return {...j, httpStatus:r.status};
}
window.AdvertiseHERE = { escapeHtml, labelCategory, listingCard, emptyState, getJson };
