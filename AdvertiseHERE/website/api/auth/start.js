import {cookie,createOAuthState,oauthConfigured,callbackUrl} from '../_lib/auth.js';
export default function handler(req,res){
 if(req.method!=='GET')return res.status(405).send('Method not allowed');
 if(!oauthConfigured())return res.redirect('/dashboard/?setup=required');
 const state=createOAuthState();
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Set-Cookie',cookie('ah_auth_state',state,{age:600,path:'/api/auth'}));
 const u=new URL('https://discord.com/oauth2/authorize');
 u.searchParams.set('client_id',process.env.DISCORD_CLIENT_ID);u.searchParams.set('redirect_uri',callbackUrl());
 u.searchParams.set('response_type','code');u.searchParams.set('scope','identify guilds');u.searchParams.set('state',state);u.searchParams.set('prompt','consent');
 return res.redirect(302,u.toString());
}
