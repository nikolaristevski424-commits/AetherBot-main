/* Aether public-site interaction layer: accessible motion, no fake metrics. */
(() => {
  document.documentElement.classList.add('js');
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
  const menu = document.querySelector('#menuToggle');
  const nav = document.querySelector('#siteNav');
  menu?.addEventListener('click', () => {
    const open = nav?.classList.toggle('open'); menu.setAttribute('aria-expanded', String(!!open));
  });
  const closeMenu = () => {
    nav?.classList.remove('open');
    menu?.setAttribute('aria-expanded', 'false');
  };
  document.addEventListener('click', e => {
    if (!nav?.contains(e.target) && !menu?.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav?.classList.contains('open')) {
      closeMenu();
      menu?.focus();
    }
  });
  nav?.addEventListener('click', e => {
    if (e.target.closest('a')) closeMenu();
  });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('visible'); io.unobserve(entry.target); }
    }, { threshold: .09, rootMargin: '0px 0px -15px 0px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  } else document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  const header = document.querySelector('#siteHeader');
  if (header) {
    let frame = 0;
    const update = () => {
      frame = 0;
      header.classList.toggle('sticky', window.scrollY > 20);
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      header.style.setProperty('--page-progress', (Math.max(0,Math.min(1,window.scrollY / maxScroll)) * 100).toFixed(2) + '%');
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, { passive:true });
    window.addEventListener('resize', schedule, { passive:true });
    update();
  }
  // Give existing content reveals a subtle editorial rhythm without timers or
  // repeated animations. The visibility observer respects reduced-motion.
  document.querySelectorAll('.feature-card,.timeline .step,.status-panel').forEach((card,index)=>{
    card.style.setProperty('--aether-enter-delay',Math.min(index%6*65,325)+'ms');
  });
  fetch('/api/config',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(config=>{
    if(!config)return;
    for(const a of document.querySelectorAll('[data-invite]')){
      if(config.inviteUrl){a.href=config.inviteUrl;a.target='_blank';a.rel='noopener noreferrer';} else {a.href='/docs/';a.title='Bot invite URL will be available when its application ID is configured';}
    }
  }).catch(()=>{});
})();
