(() => {
  const ah=window.AdvertiseHERE,$=id=>document.getElementById(id),notice=$('staffNotice'),queue=$('reviewQueue'),count=$('queueCount');
  let auth=null;
  async function refresh(){
    if(!auth?.authenticated) return;
    const r=await ah.getJson('/api/admin/pending');
    if(r.httpStatus===403){notice.textContent='Your account is not authorized to review listings.';queue.innerHTML=ah.emptyState('Staff access only.','Your Discord ID must be listed in the platform team permissions.');count.textContent='—';return;}
    if(r.httpStatus!==200){notice.textContent='The moderation backend is unavailable.';queue.innerHTML=ah.emptyState('Review queue unavailable.',r.error||'Try again shortly.');count.textContent='—';return;}
    const pending=Array.isArray(r.listings)?r.listings:[];
    notice.textContent=`Signed in as ${auth.user.username}. All decisions are recorded by the bot.`;
    count.textContent=`${pending.length} pending`;
    if(!pending.length){queue.innerHTML=ah.emptyState('All caught up.','There are no listings waiting for review.');return;}
    queue.innerHTML=pending.map(l=>{
      const invite=ah.verifiedInvite(l.invite);
      return `<article class="review-card"><div class="review-meta">${ah.escapeHtml(ah.labelCategory(l.category))} / ${ah.escapeHtml(l.guildId)}</div><h3>${ah.escapeHtml(l.title)}</h3><p>${ah.escapeHtml(l.description)}</p><div class="review-actions">${invite?`<a class="btn btn-outline" href="${ah.escapeHtml(invite)}" target="_blank" rel="noopener noreferrer nofollow">Inspect invite ↗</a>`:'<span class="status-chip rejected">Invalid invite</span>'}<button class="btn btn-primary" type="button" data-decision="approved" data-id="${ah.escapeHtml(l.guildId)}">Approve</button><button class="btn btn-outline" type="button" data-decision="rejected" data-id="${ah.escapeHtml(l.guildId)}">Reject</button></div></article>`;
    }).join('');
    queue.querySelectorAll('button[data-decision]').forEach(button=>button.addEventListener('click',async()=>{
      const decision=button.dataset.decision,guildId=button.dataset.id;
      if(decision==='rejected'&&!confirm('Reject this server listing?'))return;
      const card=button.closest('.review-card');card.querySelectorAll('button').forEach(b=>b.disabled=true);
      const r=await ah.getJson('/api/admin/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guildId,decision})});
      if(r.httpStatus===200){ah.toast(`Listing ${decision}.`,'success');await refresh();}
      else{notice.textContent=r.error||'Could not save the review.';card.querySelectorAll('button').forEach(b=>b.disabled=false);}
    }));
  }
  async function start(){
    auth=await ah.getJson('/api/auth/me');
    if(!auth.authenticated){notice.textContent=auth.configured?'Sign in with Discord to view the review desk.':'Discord OAuth is not configured yet.';queue.innerHTML=ah.emptyState('Sign in required.','Only authorized AdvertiseHERE team members can view pending listings.',auth.configured?'<a href="/api/auth/login" class="btn btn-primary">Sign in with Discord ↗</a>':'<a href="/status/" class="btn btn-outline">View connection status ↗</a>');return;}
    await refresh();
  }
  $('refreshQueue')?.addEventListener('click',refresh);
  start();
})();
