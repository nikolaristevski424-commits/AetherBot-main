import {getSession,authorizedGuilds,oauthConfigured} from './_lib/auth.js';
import {only,fail} from './_lib/http.js';
export default async function handler(req,res){if(!only(req,res,'GET'))return;
 if(!oauthConfigured())return res.json({authenticated:false,configured:false});
 try{const session=await getSession(req);if(!session)return res.json({authenticated:false,configured:true});
 const guilds=await authorizedGuilds(session.accessToken);
 return res.json({authenticated:true,configured:true,user:{id:session.discord_id,name:session.username,avatar:session.avatar},guilds});
 }catch(error){if(error.status===401)return res.status(401).json({authenticated:false,configured:true,error:error.message});return fail(res,error);}}
