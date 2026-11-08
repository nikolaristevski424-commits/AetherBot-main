export function setSecurity(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');}
export function only(req,res,method){setSecurity(res);if(req.method!==method){res.setHeader('Allow',method);res.status(405).json({error:'Method not allowed'});return false;}return true;}
export function originGuard(req,res){
  try {const expected=new URL(process.env.SITE_URL||'').origin;
    if(!req.headers.origin || new URL(req.headers.origin).origin!==expected){res.status(403).json({error:'Invalid request origin'});return false;}
    return true;
  } catch {res.status(503).json({error:'Website origin is not configured'});return false;}
}
export function fail(res,error){const status=[400,401,403,404,409,429,503].includes(error?.status)?error.status:500;
 if(status===500) console.error('[api]',error?.message||'Unknown error');
 return res.status(status).json({error:status===500?'Unable to complete request':error?.message||'Service unavailable'});
}
export function parseBody(req){
  const length=Number(req.headers['content-length']); if(Number.isFinite(length)&&length>12_000){const e=new Error('Request too large');e.status=400;throw e;}
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)){const e=new Error('Expected a JSON object');e.status=400;throw e;}
  return req.body;
}
