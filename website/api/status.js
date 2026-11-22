import { authResponse, loginReady } from '../lib/auth.js';
import { bridgeReady, botOrigin } from '../lib/bridge.js';

// A status request is a *snapshot*, not evidence of historical uptime.
// Never report an overall "operational" bot unless /ready confirms Discord
// gateway and persistent database readiness.
export default async function handler(req, res) {
  if (req.method !== 'GET') return authResponse(res, 405, { error: 'Method not allowed' });
  const origin=botOrigin(), base={
    website:'operational',bot:'unmonitored',readiness:'unmonitored',
    cad:bridgeReady()?'gateway_configured':'gateway_not_configured',
    auth:loginReady()?'configured':'not_configured',
    updatedAt:new Date().toISOString(),
    processUptimeSeconds:null,
  };
  if(!origin)return authResponse(res,200,{...base,note:'Bot HTTPS origin is not configured. No historical uptime is being tracked.'});
  const abort=new AbortController();
  const timeout=setTimeout(()=>abort.abort(),4500);
  try{
    const health=await fetch(origin+'/health',{signal:abort.signal,cache:'no-store',redirect:'manual'});
    if(!health.ok)return authResponse(res,200,{...base,bot:'unreachable',readiness:'unknown',
      note:'HTTPS endpoint did not report healthy. The Discord bot may still be online.'});
    let uptime=null;
    try{
      const data=await health.json();
      if(Number.isFinite(data?.uptime)&&data.uptime>=0)uptime=Math.floor(data.uptime);
      else if(data?.status!=='healthy')throw new Error('Invalid health response');
    }catch{
      return authResponse(res,200,{...base,bot:'unreachable',readiness:'unknown',note:'The hosting endpoint responded without a valid Aether health report.'});
    }
    let ready='unknown';
    try {
      const response=await fetch(origin+'/ready',{signal:abort.signal,cache:'no-store',redirect:'manual'});
      if(response.ok){
        const body=await response.json().catch(()=>null);
        ready=body?.ready===true?'ready':'unknown';
      }else if(response.status===503)ready='not_ready';
    }catch{/* preserve the valid /health response */}
    return authResponse(res,200,{...base,bot:'reachable',readiness:ready,processUptimeSeconds:uptime,
      note:ready==='ready'?'HTTPS and Discord/database readiness checks passed. No historical uptime tracked.':
        ready==='not_ready'?'HTTP server responds, but Discord or database is not ready.':
        'HTTPS responds, but Discord/database readiness could not be confirmed.'});
  }catch{
    return authResponse(res,200,{...base,bot:'unreachable',readiness:'unknown',
      note:'Bot health endpoint could not be reached. This does not necessarily mean Discord is offline.'});
  }finally{clearTimeout(timeout);}
}
