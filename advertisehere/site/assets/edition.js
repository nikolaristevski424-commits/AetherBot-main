/* Edition 02 UX: progressive enhancement. No privileged API calls, tokens, or fake metrics. */
(() => {
  const current = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const dest = new URL(a.href, location.origin).pathname.replace(/\/$/, '') || '/';
    if (dest === current && dest !== '/') { a.classList.add('active'); a.setAttribute('aria-current', 'page'); }
  });
  const header = document.querySelector('.site-header');
  if (header) {
    const checkScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
    addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
  }
  // A lightweight product navigation dock on all management and discovery surfaces.
  const management = current === '/dashboard' || current === '/staff' || current === '/browse';
  if (management) {
    const main = document.querySelector('main');
    const anchor = main?.querySelector('.container');
    if (anchor) {
      const dock = document.createElement('section');
      dock.className = 'ah-dock';
      dock.setAttribute('aria-label', 'Platform quick navigation and connection');
      const links = document.createElement('nav');
      links.className = 'ah-dock-links';
      [['/browse/', 'Discover servers'],['/dashboard/', 'My dashboard'],['/staff/', 'Review desk'],['/guide/', 'Setup guide']].forEach(([href,label]) => {
        const a = document.createElement('a'); a.href=href; a.textContent=label;
        if (href.replace(/\/$/, '')===current) a.setAttribute('aria-current','page');
        links.appendChild(a);
      });
      const state = document.createElement('div'); state.className='ah-dock-state';
      const dot = document.createElement('span'); dot.className='ah-indicator'; dot.setAttribute('aria-hidden','true');
      const text = document.createElement('span'); text.textContent='Checking live connection'; text.setAttribute('aria-live','polite');
      state.append(dot,text); dock.append(links,state);
      anchor.insertBefore(dock, anchor.firstChild);
      const ctl = new AbortController(); const stop = setTimeout(()=>ctl.abort(),5000);
      fetch('/api/health',{cache:'no-store',signal:ctl.signal}).then(r=>r.ok?r.json():null).then(info=>{
        if (!info) throw Error('unreachable');
        const online = info.bot?.connected===true && info.bot?.ready===true;
        const configured = info.bot?.connected===true;
        dot.classList.add(online?'online':'offline');
        text.textContent=online?'Bot connected · Live directory':configured?'Bot connection active · Checking readiness':'Bot integration not connected yet';
      }).catch(()=>{dot.classList.add('offline');text.textContent='Live connection unavailable';}).finally(()=>clearTimeout(stop));
    }
  }
  if (current === '/dashboard') {
    const workspace = document.querySelector('.workspace-shell');
    const content = workspace?.querySelector('.workspace-content, .workspace-body, .workspace-main-content') || workspace?.children?.[1];
    if (content) {
      const block = document.createElement('section'); block.className='ah-onboarding';
      block.setAttribute('aria-label','Getting started with AdvertiseHERE');
      block.innerHTML = '<div class="ah-onboarding-top"><span class="ah-onboarding-title">Your growth workspace</span><span class="ah-onboarding-status">GET STARTED IN 3 STEPS</span></div><div class="ah-onboarding-steps"><div class="ah-onboarding-step"><span class="ah-step-num">01</span><b>Connect your Discord server</b><p>Sign in, install the bot, and verify Manage Server access.</p></div><div class="ah-onboarding-step"><span class="ah-step-num">02</span><b>Submit a listing</b><p>Give visitors a clear description and a working invite link.</p></div><div class="ah-onboarding-step"><span class="ah-step-num">03</span><b>Get discovered</b><p>Once approved, use /bump or the dashboard on the shared two-hour cooldown.</p></div></div>';
      const existing = content.querySelector('#workspaceOverview');
      if (existing) existing.insertAdjacentElement('afterend',block); else content.insertBefore(block, content.firstChild);
    }
  }
})();