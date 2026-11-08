(async()=>{
 const ah=window.AdvertiseHERE,$=id=>document.getElementById(id),notify=(text,kind='info')=>{$('feedback').hidden=false;$('feedback').textContent=text;$('feedback').dataset.kind=kind;};
 const auth=await ah.getJson('/api/auth/me');
 if(!auth.authenticated){ $('signedOut').hidden=false; $('signedIn').hidden=true;
   if(!auth.configured) notify('Discord sign-in is not configured yet. The website is live, but its owner dashboard is pending setup.');
   if(new URLSearchParams(location.search).has('error')) notify('Discord sign-in could not be completed. Check your OAuth configuration and try again.','error');
   return;
 }
 $('signedOut').hidden=true;$('signedIn').hidden=false;$('greeting').textContent=`Welcome, ${auth.user.username}`;
 const data=await ah.getJson('/api/my-guilds');
 const guilds=Array.isArray(data.guilds)?data.guilds:[];
 if(data.httpStatus!==200){ $('guilds').innerHTML=ah.emptyState('Bot connection required',data.error||'This dashboard will show your managed servers once the AdvertiseHERE bot is connected.'); return; }
 if(!guilds.length){$('guilds').innerHTML=ah.emptyState('No connected servers','Add the AdvertiseHERE bot to a server you manage, then return here.');return;}
 $('guilds').innerHTML=guilds.map(g=>`<div class="guild-card"><div class="listing-avatar">${ah.escapeHtml(g.name?.[0]||'S')}</div><div class="guild-info"><strong>${ah.escapeHtml(g.name)}</strong><small>${g.listing?.status?`Listing: ${ah.escapeHtml(g.listing.status)}`:'Not listed yet'} · ${Number(g.memberCount||0).toLocaleString()} members</small></div><button data-guild="${ah.escapeHtml(g.id)}" class="btn btn-outline">Manage ↗</button></div>`).join('');
 for(const button of $('guilds').querySelectorAll('button[data-guild]'))button.addEventListener('click',()=>{
   const g=guilds.find(g=>g.id===button.dataset.guild);if(!g)return;
   $('guildId').value=g.id;$('selectedGuild').textContent=g.name;$('listingEditor').hidden=false;$('listingEditor').scrollIntoView({behavior:'smooth'});
   $('title').value=g.listing?.title||g.name;$('description').value=g.listing?.description||'';$('category').value=g.listing?.category||'roleplay';$('invite').value=g.listing?.invite||'';
   $('bumpButton').hidden=g.listing?.status!=='approved';$('listingStatus').textContent=g.listing?.status?`Listing status: ${g.listing.status}`:'Create your first listing';
 });
 $('listingForm').addEventListener('submit',async event=>{
  event.preventDefault();const submit=$('submitListing');submit.disabled=true;submit.textContent='Saving…';
  const body={guildId:$('guildId').value,title:$('title').value,description:$('description').value,category:$('category').value,invite:$('invite').value};
  const r=await ah.getJson('/api/listings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  notify(r.message||r.error||'Unexpected result',r.httpStatus===201?'success':'error');submit.disabled=false;submit.textContent='Submit for review ↗';
 });
 $('bumpButton').addEventListener('click',async()=>{
  $('bumpButton').disabled=true;const r=await ah.getJson('/api/bump',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guildId:$('guildId').value})});
  const message=r.ok?'Server bumped successfully. It now has higher placement in discovery.':r.error||'Bump unavailable';notify(message,r.ok?'success':'error');$('bumpButton').disabled=false;
 });
 $('logout').addEventListener('click',async()=>{await ah.getJson('/api/auth/logout',{method:'POST'});location.reload();});
})();
