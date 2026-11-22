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
  const featureModules = {
    cad: { eyebrow:'Operational visibility',title:'Dispatch with context.',description:'Respond to roleplay emergencies, assign units, inspect BOLOs and open the same CAD from Discord or your browser.',url:'https://aether.wispbyte.app/cad/',artTitle:'Active dispatch',rows:[['911 call reported','Received'],['Unit 1-Adam-12 assigned','Assigned'],['BOLO record updated','Review']] },
    moderation: { eyebrow:'Keep your community safe',title:'Moderate with clarity.',description:'Record the why behind each warning and timeout. Staff permissions and Discord role hierarchy remain enforced by the bot.',url:'/staff/',artTitle:'Moderation desk',rows:[['Rule violation reviewed','Case'],['Member warning issued','Logged'],['Staff history updated','Synced']] },
    staff: { eyebrow:'One team, one workspace',title:'Give staff their own desk.',description:'Review recent cases, use permission-checked actions, and handle assignments without losing context between Discord and the web.',url:'/staff/',artTitle:'Staff operations',rows:[['Moderator permissions','Checked'],['Recent cases','Visible'],['Staff action','Audited']] },
    erlc: { eyebrow:'A connected private server',title:'Bring Liberty County closer.',description:'Use ER:LC API snapshots to show available player locations, 911 calls and server data while respecting API entitlements and rate limits.',url:'https://aether.wispbyte.app/cad/',artTitle:'ER:LC integration',rows:[['Player position snapshots','Timed'],['911 incidents imported','Linked'],['Liberty County map','Calibrated']] },
  };
  const tabs = document.querySelectorAll('[data-feature]');
  const setFeature = key => {
    const feature = featureModules[key];if(!feature)return;
    tabs.forEach(tab => { const active = tab.dataset.feature===key;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1; });
    const nodes={eyebrow:document.querySelector('#featureEyebrow'),title:document.querySelector('#featureTitle'),desc:document.querySelector('#featureDescription'),link:document.querySelector('#featureLink'),art:document.querySelector('#artTitle'),rows:document.querySelector('#artRows')};
    if(nodes.eyebrow)nodes.eyebrow.textContent=feature.eyebrow;
    if(nodes.title)nodes.title.textContent=feature.title;
    if(nodes.desc)nodes.desc.textContent=feature.description;
    if(nodes.link)nodes.link.href=feature.url;
    if(nodes.art)nodes.art.textContent=feature.artTitle;
    if(nodes.rows){nodes.rows.replaceChildren();feature.rows.forEach(([name,status])=>{
      const row=document.createElement('div');row.className='art-row';const dot=document.createElement('i');dot.className='art-dot';
      const text=document.createTextNode(' '+name+' ');const b=document.createElement('b');b.textContent=status;row.append(dot,text,b);nodes.rows.append(row);
    });}
  };
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>setFeature(tab.dataset.feature));
    tab.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const idx=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[idx].focus();setFeature(tabs[idx].dataset.feature);});
  });
  fetch('/api/config',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(config=>{
    if(!config)return;
    for(const a of document.querySelectorAll('[data-invite]')){
      if(config.inviteUrl){a.href=config.inviteUrl;a.target='_blank';a.rel='noopener noreferrer';} else {a.href='/docs/';a.title='Bot invite URL will be available when its application ID is configured';}
    }
  }).catch(()=>{});
})();
