(async()=>{
  const el=id=>document.getElementById(id);
  async function refresh(){
    try{
      const r=await fetch('/api/health',{cache:'no-store'});if(!r.ok)throw new Error('website API unreachable');const data=await r.json();
      el('webHealth').textContent='Operational';el('webDot').className='status-icon online';
      const connected=data.bot?.connected===true;
      el('botHealth').textContent=connected?'Online':(data.bot?.status==='not-connected'?'Not connected':'Unavailable');
      el('botDot').className='status-icon '+(connected?'online':'offline');
      el('authHealth').textContent=data.discordOAuthConfigured?'Configured':'Setup required';el('authDot').className='status-icon '+(data.discordOAuthConfigured?'online':'');
      el('statusHeading').textContent=connected?'Website and bot API connected':'Website online · bot integration pending';
      el('statusDescription').textContent=connected?'Live health from the connected Discord bot and website.':'The website is online. Discord features require the new Wispbyte bot and environment variables; this is not proof the old bot is offline.';
      el('checkedAt').textContent=new Date(data.checkedAt).toLocaleString();
      const stats=data.bot?.stats; const fmt=n=>Number.isSafeInteger(n)&&n>=0?n.toLocaleString():'—';
      el('healthListings').textContent=connected?fmt(stats?.approvedListings):'—';
      el('healthBumps').textContent=connected?fmt(stats?.totalBumps):'—';
      el('healthGuilds').textContent=connected?fmt(stats?.connectedGuilds):'—';
    }catch{el('webHealth').textContent='Health check failed';el('webDot').className='status-icon offline';}
  }
  await refresh();setInterval(refresh,60_000);
})();
