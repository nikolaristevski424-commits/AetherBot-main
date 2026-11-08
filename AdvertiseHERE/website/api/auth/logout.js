import {clearCookie,deleteSession} from '../_lib/auth.js';
import {only,originGuard,fail} from '../_lib/http.js';
export default async function handler(req,res){if(!only(req,res,'POST')||!originGuard(req,res))return;
 try{await deleteSession(req);res.setHeader('Set-Cookie',clearCookie('ah_session'));return res.status(200).json({ok:true});}catch(error){return fail(res,error);}}
