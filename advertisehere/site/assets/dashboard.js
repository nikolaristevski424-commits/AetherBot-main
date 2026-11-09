(async () => {
  const ah=window.AdvertiseHERE, $=id=>document.getElementById(id),notify=(message,kind='info')=>{
    const el=$('feedback');el.hidden=false;el.textContent=String(message).slice(0,500);el.dataset.kind=kind;
    ah.toast(message,kind);
  };
  const [auth, config] = await Promise.all([ah.getJson('/api/auth/me'), ah.getJson('/api/config')]);
  if(config.inviteUrl){ $('connectBotButton').href = config.inviteUrl; $('connectBotButton').hidden = false; }
  if(!auth.authenticated){
    $('signedOut').hidden=false;
    if(!auth.configured) {
      notify('Discord login is not configured yet. The public site is available, but the owner workspace requires OAuth setup.');
      const signIn=$('signinButton'); signIn.removeAttribute('href');signIn.setAttribute('aria-disabled','true');signIn.classList.replace('btn-primary','btn-outline');signIn.textContent='Discord connection pending';
    }
    if(new URLSearchParams(location.search).has('error'))notify('Discord login did not complete. Verify your OAuth settings and try again.','error');
    return;
  }
  $('signedOut').hidden=true;$('signedIn').hidden=false;
  const guildResult=await ah.getJson('/api/my-guilds');
  if(guildResult.httpStatus!==200 || !Array.isArray(guildResult.guilds)) {
    $('guilds').innerHTML=ah.emptyState('Your bot connection is needed.',guildResult.error||'Your managed Discord servers will appear here after the AdvertiseHERE bot is connected.','<a class="btn btn-outline" href="/status/">Check connection ↗</a>');
    $('metricServers').textContent='—';$('metricApproved').textContent='—';$('metricBumps').textContent='—';
    notify('Signed in successfully. Could not load bot-connected servers yet.');
    return;
  }
  const guilds=guildResult.guilds;
  $('greeting').textContent=`Signed in as ${auth.user.username}. Select a connected server to edit.`;
  const updateMetrics=()=>{
    $('metricServers').textContent=ah.formatCount(guilds.length);
    $('metricApproved').textContent=ah.formatCount(guilds.filter(g=>g.listing?.status==='approved').length);
    $('metricBumps').textContent=ah.formatCount(guilds.reduce((n,g)=>n+(Number(g.listing?.bumpCount)||0),0));
  };
  updateMetrics();
  if(!guilds.length){
    $('guilds').innerHTML=ah.emptyState('No managed servers connected.','Add AdvertiseHERE to a Discord server where you have Manage Server permission, then refresh this page.',config.inviteUrl?`<a class="btn btn-primary" href="${ah.escapeHtml(config.inviteUrl)}" target="_blank" rel="noopener noreferrer">Add bot ↗</a>`:'<a class="btn btn-outline" href="/guide/">Read the setup guide ↗</a>');
    return;
  }
  let current=null, cooldownTimer=null;
  $('guilds').innerHTML=guilds.map(g=>{
    const status=g.listing?.status || 'Not listed';
    const safeStatus=ah.escapeHtml(status);
    return `<div class="guild-card" data-card="${ah.escapeHtml(g.id)}"><div class="listing-avatar">${ah.escapeHtml((g.name||'S').slice(0,2).toUpperCase())}</div><div class="guild-info"><strong>${ah.escapeHtml(g.name||'Server')}</strong><small>${safeStatus} · ${ah.formatCount(g.memberCount)} members</small></div><button type="button" data-guild="${ah.escapeHtml(g.id)}" class="btn btn-outline">Manage ↗</button></div>`;
  }).join('');
  const cooldownMs=2*60*60*1000;
  const tickCooldown=()=>{
    if(!current) return;
    const l=current.listing;
    const approved=l?.status==='approved';
    $('bumpButton').hidden=!approved;
    $('cooldownCard').hidden=!approved;
    if(!approved) return;
    const at=Number(l.lastBumpAt)||0;
    const remaining=Math.max(0,at+cooldownMs-Date.now());
    $('bumpButton').disabled=remaining>0;
    $('cooldownTitle').textContent=remaining>0?'Bump cooldown active':'Ready to bump';
    const clock=remaining>0?`${Math.floor(remaining/3600000)}h ${Math.floor((remaining%3600000)/60000)}m remaining`:'Your listing is eligible for a bump.';
    $('cooldownText').textContent=clock;
    const progress=at ? Math.min(100,100-(remaining/cooldownMs*100)) : 100;
    $('cooldownProgress').style.width=progress.toFixed(1)+'%';
  };
  const renderPreview=()=>{
    const title=$('title').value.trim()||'Your community';
    const desc=$('description').value.trim()||'Your community description will appear here as you type.';
    const category=$('category').value;
    $('listingPreview').innerHTML=`<div class="listing-card-head"><div class="listing-avatar">${ah.escapeHtml(title.slice(0,2).toUpperCase())}</div><div><h3>${ah.escapeHtml(title)}</h3><p>${ah.escapeHtml(ah.labelCategory(category))}</p></div></div><p class="listing-description">${ah.escapeHtml(desc)}</p><div class="listing-foot"><span>Preview only</span><span>Join community ↗</span></div>`;
    $('descriptionCount').textContent=`${$('description').value.length} / 600`;
  };
  function selectGuild(g){
    current=g;
    document.querySelectorAll('[data-card]').forEach(card=>card.classList.toggle('selected',card.dataset.card===g.id));
    $('listingEditor').hidden=false;
    $('guildId').value=g.id;
    $('selectedGuild').textContent=g.name;
    const l=g.listing;
    const status=l?.status||'Not listed';
    $('listingStatus').textContent=l?`Current status: ${status}. Editing resubmits your listing for moderation.`:'Create a listing to enter the staff review queue.';
    $('editorBadge').textContent=status.toUpperCase();
    $('editorBadge').className=`status-chip ${['approved','rejected','suspended'].includes(status)?status:''}`;
    $('title').value=l?.title||g.name;
    $('category').value=l?.category||'roleplay';
    $('description').value=l?.description||'';
    $('invite').value=l?.invite||'';
    renderPreview();tickCooldown();
    if(cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer=setInterval(tickCooldown,30000);
    $('listingEditor').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }
  $('guilds').querySelectorAll('[data-guild]').forEach(button=>button.addEventListener('click',()=>{
    const g=guilds.find(g=>g.id===button.dataset.guild);
    if(g) selectGuild(g);
  }));
  for(const id of ['title','category','description']) $(id).addEventListener('input',renderPreview);
  $('listingForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!current) return;
    const form=$('listingForm');
    if(!form.checkValidity()){form.reportValidity();return;}
    const submit=$('submitListing');submit.disabled=true;const original=submit.innerHTML;submit.textContent='Submitting…';
    try{
      const body={guildId:current.id,title:$('title').value.trim(),category:$('category').value,description:$('description').value.trim(),invite:$('invite').value.trim()};
      const r=await ah.getJson('/api/listings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(r.httpStatus===201){current.listing=r.listing;notify(r.message||'Listing submitted for review.','success');selectGuild(current);updateMetrics();}
      else notify(r.error||'Could not submit the listing.','error');
    }finally{submit.disabled=false;submit.innerHTML=original;}
  });
  $('bumpButton').addEventListener('click',async()=>{
    if(!current || current.listing?.status!=='approved')return;
    $('bumpButton').disabled=true;
    const response=await ah.getJson('/api/bump',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guildId:current.id})});
    if(response.ok){current.listing=response.listing;notify('Your listing was bumped successfully.','success');updateMetrics();}
    else notify(response.error||'Your server is not eligible to bump yet.','error');
    tickCooldown();
  });
  $('logout').addEventListener('click',async()=>{await ah.getJson('/api/auth/logout',{method:'POST'});location.reload();});
  const preselected=new URLSearchParams(location.search).get('server');
  if(preselected){const target=guilds.find(g=>g.id===preselected);if(target)selectGuild(target);}
})();
