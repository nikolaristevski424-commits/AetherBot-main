(async () => {
  const ah = window.AdvertiseHERE;
  const $ = id => document.getElementById(id);
  const grid = $('listingGrid'), search = $('listingSearch'), category = $('listingCategory'), sort = $('listingSort'), count = $('resultCount');
  if (!grid) return;
  let listings = [];
  let ready = false;
  const params = new URLSearchParams(location.search);
  const value = params.get('category');
  if ([...category.options].some(x => x.value === value)) category.value = value;
  function draw() {
    if (!ready) return;
    const q = search.value.trim().toLocaleLowerCase();
    const c = category.value;
    const shown = listings.filter(item => (!c || item.category === c) && (!q || `${item.title} ${item.description} ${ah.labelCategory(item.category)}`.toLocaleLowerCase().includes(q)));
    shown.sort((a,b) => sort.value === 'members' ? (b.memberCount || 0) - (a.memberCount || 0)
      : sort.value === 'bumps' ? (b.bumpCount || 0) - (a.bumpCount || 0)
      : sort.value === 'name' ? String(a.title).localeCompare(String(b.title))
      : (b.lastBumpAt || b.updatedAt || 0) - (a.lastBumpAt || a.updatedAt || 0));
    grid.innerHTML = shown.length ? shown.map(ah.listingCard).join('') : ah.emptyState('No communities match yet.', 'Try a different search or category, or help the directory grow with your own listing.', '<a class="btn btn-primary" href="/dashboard/">List your server ↗</a>');
    count.textContent = `${shown.length} ${shown.length === 1 ? 'community' : 'communities'} found`;
    document.querySelectorAll('[data-category]').forEach(button => {
      button.classList.toggle('active', button.dataset.category === c);
      button.setAttribute('aria-pressed', String(button.dataset.category === c));
    });
    const query = new URLSearchParams(location.search);
    if (c) query.set('category', c); else query.delete('category');
    history.replaceState(null, '', location.pathname + (query.size ? `?${query}` : ''));
  }
  async function load() {
    count.textContent = 'Checking directory…';
    const response = await ah.getJson('/api/listings');
    if (response.httpStatus !== 200 || !Array.isArray(response.listings)) {
      ready = false;
      count.textContent = 'Directory connection pending';
      grid.innerHTML = ah.emptyState('The live directory is being connected.', 'No invented listings. Verified communities will appear when the AdvertiseHERE bot API is online.', '<a href="/status/" class="btn btn-outline">Check platform status ↗</a>');
      return;
    }
    ready = true;
    listings = response.listings;
    draw();
  }
  search.addEventListener('input', draw);
  category.addEventListener('change', draw);
  sort.addEventListener('change', draw);
  document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => { category.value = button.dataset.category; draw(); }));
  $('viewGrid').addEventListener('click', () => { grid.classList.remove('list-layout'); $('viewGrid').classList.add('active'); $('viewList').classList.remove('active'); $('viewGrid').setAttribute('aria-pressed','true'); $('viewList').setAttribute('aria-pressed','false'); });
  $('viewList').addEventListener('click', () => { grid.classList.add('list-layout'); $('viewList').classList.add('active'); $('viewGrid').classList.remove('active'); $('viewGrid').setAttribute('aria-pressed','false'); $('viewList').setAttribute('aria-pressed','true'); });
  $('refreshDirectory').addEventListener('click', load);
  document.addEventListener('keydown', e => { if (e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName || '')) { e.preventDefault(); search.focus(); } });
  await load();
})();
