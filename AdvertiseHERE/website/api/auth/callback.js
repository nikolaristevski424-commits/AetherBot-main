import {oauthConfigured,verifyOAuthState,getCookies,clearCookie,cookie,callbackUrl,createSession} from '../_lib/auth.js';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).send('Method not allowed');
 res.setHeader('Cache-Control','no-store');res.setHeader('Set-Cookie',clearCookie('ah_auth_state','/api/auth'));
 if(!oauthConfigured())return res.redirect('/dashboard/?error=not-configured');
 if(!verifyOAuthState(req.query?.state,getCookies(req).ah_auth_state)||typeof req.query?.code!=='string')return res.redirect('/dashboard/?error=invalid-state');
 try{
  const tokenRes=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,client_secret:process.env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code:req.query.code,redirect_uri:callbackUrl()}),signal:AbortSignal.timeout(8000)});
  if(!tokenRes.ok)throw new Error('Discord did not authorize the sign in');
  const tokens=await tokenRes.json();if(!tokens.access_token)throw new Error('Missing OAuth access token');
  const userRes=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bearer ${tokens.access_token}`},signal:AbortSignal.timeout(6000)});
  if(!userRes.ok)throw new Error('Unable to load Discord profile');
  const user=await userRes.json();if(!/^\d{17,20}$/.test(user.id||''))throw new Error('Invalid user profile');
  const session=await createSession({user,accessToken:tokens.access_token,expiresIn:tokens.expires_in});
  res.setHeader('Set-Cookie',[clearCookie('ah_auth_state','/api/auth'),cookie('ah_session',session.sessionId,{age:session.maxAge})]);
  return res.redirect(302,'/dashboard/');
 }catch(error){console.warn('[oauth]',error.message);return res.redirect('/dashboard/?error=login-failed');}
}
