(() => {
 const $=id=>document.getElementById(id);
 const ah=window.AdvertiseHERE;
 const fmt=n=>Number.isSafeInteger(n)&&n>=0?n.toLocaleString(): '—';
 Promise.all([ah.getJson('/api/listings'),ah.getJson('/api/health')]).then(([listings,health])=>{
  const cards=$('homeListings');
  if(listings.httpStatus===200 && Array.isArray(listings.listings) && listings.listings.length){
    cards.innerHTML=listings.listings.slice(0,3).map(ah.listingCard).join('');
  } else if(listings.httpStatus!==200){
    cards.innerHTML=ah.emptyState('Discovery is warming up','The bot connection is being configured. Verified communities will appear here when the directory is online.','<a class="btn btn-outline" href="/status/">View connection status ↗</a>');
  }
  const stats=health.bot?.stats;
  if(health.bot?.connected && stats){
    $('statListings').textContent=fmt(stats.approvedListings);
    $('statBumps').textContent=fmt(stats.totalBumps);
    $('statConnected').textContent=fmt(stats.connectedGuilds);
    $('statNote').textContent='Live counts from the connected bot.';
  }
 }).catch(()=>{});
})();
