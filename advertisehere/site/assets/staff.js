(async()=>{
 const ah=window.AdvertiseHERE,notice=document.querySelector('#staffNotice'),queue=document.querySelector('#reviewQueue'),count=document.querySelector('#queueCount');
 const auth=await ah.getJson('/api/auth/me');
 if(!auth.authenticated){notice.textContent=auth.configured?'Please sign in with Discord to view the moderation desk.':'Discord OAuth has not been configured.';queue.innerHTML=ah.emptyState('Sign-in required','The review desk is only available to AdvertiseHERE team members.','<a class="btn btn-primary" href="/api/auth/login">Sign in with Discord ↗</a>');return;}
 async function refresh(){
  const r=await ah.getJson('/api/admin/pending');
  if(r.httpStatus===403){notice.textContent='Your Discord account does not have AdvertiseHERE moderator access.';queue.innerHTML=ah.emptyState('Team access only','Ask the platform owner to add your Discord ID to AD_OWNER_IDS.');return;}
  if(r.httpStatus!==200){notice.textContent='Moderation connection unavailable.';queue.innerHTML=ah.emptyState('Could not reach the review service',r.error||'Please try again later.');return;}
  notice.textContent='Signed in as '+auth.user.username+' · Platform staff';
  const pending=Array.isArray(r.listings)?r.listings:[];count.textContent=pending.length+' pending';
  queue.innerHTML=pending.length?pending.map(x=>`<article class="review-card"><div class="review-meta">${ah.escapeHtml(ah.labelCategory(x.category))} · ${ah.escapeHtml(x.guildId)}</div><h3>${ah.escapeHtml(x.title)}</h3><p>${ah.escapeHtml(x.description)}</p><div class="review-actions"><a class="btn btn-outline" href="${ah.escapeHtml(x.invite)}" rel="noopener noreferrer nofollow" target="_blank">Inspect invite ↗</a><button class="btn btn-primary" data-decision="approved" data-guild="${ah.escapeHtml(x.guildId)}">Approve</button><button class="btn btn-outline" data-decision="rejected" data-guild="${ah.escapeHtml(x.guildId)}">Reject</button></div></article>`).join(''):ah.emptyState('All caught up','There are no pending submissions right now.');
  queue.querySelectorAll('button[data-decision]').forEach(button=>button.addEventListener('click',async()=>{
    const decision=button.dataset.decision;
    if(decision==='rejected'&&!confirm('Reject this listing?'))return;
    const card=button.closest('.review-card');card.querySelectorAll('button').forEach(x=>x.disabled=true);
    const result=await ah.getJson('/api/admin/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guildId:button.dataset.guild,decision})});
    if(result.httpStatus===200){notice.textContent='Listing '+decision+'.';await refresh();}
    else{notice.textContent=result.error||'Could not save the review.';card.querySelectorAll('button').forEach(x=>x.disabled=false);}
  }));
 }
 await refresh();
})();
