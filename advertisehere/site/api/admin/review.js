import { botRequest, BackendUnavailable } from '../_lib/bot.js';
import { sessionUser, requireSameOrigin, json } from '../_lib/security.js';
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
 const user=sessionUser(req); if(!user)return json(res,401,{error:'Sign in with Discord'});
 if(!requireSameOrigin(req))return json(res,403,{error:'Invalid request origin'});
 const {guildId,decision}=req.body||{};
 if(typeof guildId!=='string'||!/^\d{17,20}$/.test(guildId)||!['approved','rejected'].includes(decision))return json(res,400,{error:'Invalid review request'});
 try{const response=await botRequest('/internal/review',{method:'POST',body:{actorId:user.id,guildId,decision}});return json(res,response.status,response.data);}
 catch(error){return json(res,503,{error:error instanceof BackendUnavailable?error.message:'Moderation service unavailable'});}
}
