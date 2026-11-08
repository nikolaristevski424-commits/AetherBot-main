import { botRequest, BackendUnavailable } from '../_lib/bot.js';
import { sessionUser, json } from '../_lib/security.js';
export default async function handler(req,res){
 if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
 const user=sessionUser(req); if(!user)return json(res,401,{error:'Sign in with Discord'});
 try{const response=await botRequest(`/internal/pending/${user.id}`);return json(res,response.status,response.data);}
 catch(error){return json(res,503,{error:error instanceof BackendUnavailable?error.message:'Unable to load review queue'});}
}
