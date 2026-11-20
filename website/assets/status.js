(async function(){
  const el=id=>document.getElementById(id);
  function set(id,label,kind){const node=el(id);node.textContent=label;node.className='state-text '+(kind||'');}
  async function refresh(){el('statusRefresh').disabled=true;el('statusUpdated').textContent='Refreshing service checks...';
    try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw Error('Service check unavailable');const x=await r.json();
      set('webState',x.website==='operational'?'Operational':'Unknown',x.website==='operational'?'good':'wait');
      set('botState',x.bot==='reachable'?'HTTPS responding':x.bot==='unreachable'?'HTTPS unreachable':'Not monitored',x.bot==='reachable'?'good':'wait');
      set('cadState',x.cad==='gateway_configured'?'Gateway configured':'Not connected',x.cad==='gateway_configured'?'good':'wait');
      set('authState',x.auth==='configured'?'Configured':'Not configured',x.auth==='configured'?'good':'wait');
      el('statusUpdated').textContent=`Checked ${new Date(x.updatedAt).toLocaleString()}. ${x.note||''}`;
    }catch{el('statusUpdated').textContent='Unable to complete status checks right now.';set('webState','Unknown','wait');}
    finally{el('statusRefresh').disabled=false;}}
  el('statusRefresh')?.addEventListener('click',refresh);await refresh();
})();
