import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {getPool} from './db.js';
import {isManagerPermission} from './validation.js';
const COOKIE='ah_session'; const STATE='ah_auth_state';
const duration=50*60*1000;
const key=()=>createHash('sha256').update(String(process.env.SESSION_SECRET)).digest();
const hash=v=>createHash('sha256').update(v).digest('hex');
const secretOk=()=>typeof process.env.SESSION_SECRET==='string'&&process.env.SESSION_SECRET.length>=32;
export function oauthConfigured(){return !!(secretOk()&&process.env.DISCORD_CLIENT_ID&&process.env.DISCORD_CLIENT_SECRET&&process.env.DATABASE_URL&&validSite());}
function validSite(){try {const u=new URL(process.env.SITE_URL||'');return u.protocol==='https:'&&u.pathname==='/'&&!u.search&&!u.hash&&!u.port;}catch{return false;}}
export function siteOrigin(){return new URL(process.env.SITE_URL).origin;}
export function cookie(name,value,{age=300,path='/' }={}){return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;}
export function clearCookie(name,path='/'){return cookie(name,'',{age:0,path});}
export function getCookies(req){const out={}; for(const raw of String(req.headers.cookie||'').split(';')){const i=raw.indexOf('=');if(i<0)continue;try {out[raw.slice(0,i).trim()]=decodeURIComponent(raw.slice(i+1).trim());}catch{}}return out;}
function sign(value){const s=createHmac('sha256',key()).update(value).digest('base64url');return `${value}.${s}`;}
function verify(value){if(typeof value!=='string')return null;const i=value.lastIndexOf('.');if(i<=0)return null;const raw=value.slice(0,i),sig=value.slice(i+1),expected=createHmac('sha256',key()).update(raw).digest();let supplied;try{supplied=Buffer.from(sig,'base64url');}catch{return null;}return supplied.length===expected.length&&timingSafeEqual(supplied,expected)?raw:null;}
export function createOAuthState(){const payload=JSON.stringify({random:randomBytes(24).toString('base64url'),exp:Date.now()+10*60_000});const token=sign(Buffer.from(payload).toString('base64url'));return token;}
export function verifyOAuthState(value,cookieValue){if(!value||!cookieValue||value!==cookieValue)return false;const raw=verify(value);if(!raw)return false;try{const p=JSON.parse(Buffer.from(raw,'base64url'));return Number.isFinite(p.exp)&&p.exp>Date.now();}catch{return false;}}
function encrypt(value){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');}
function decrypt(value){const [a,b,c]=String(value).split('.');const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(a,'base64url'));decipher.setAuthTag(Buffer.from(b,'base64url'));return Buffer.concat([decipher.update(Buffer.from(c,'base64url')),decipher.final()]).toString('utf8');}
export async function createSession({user,accessToken,expiresIn}){
 const raw=randomBytes(32).toString('base64url');
 const expires=new Date(Date.now()+Math.min(duration, Math.max(120,Number(expiresIn)-60)*1000));
 const pool=getPool();await pool.query('INSERT INTO ah_sessions(session_hash,discord_id,username,avatar,encrypted_access_token,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[hash(raw),user.id,String(user.global_name||user.username).slice(0,100),user.avatar,encrypt(accessToken),expires]);
 return {sessionId:raw, maxAge:Math.max(60,Math.floor((expires-Date.now())/1000))};
}
export async function getSession(req){
 if(!secretOk())return null;
 const sid=getCookies(req)[COOKIE];if(typeof sid!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(sid))return null;
 const pool=getPool();if(!pool)return null;
 const {rows}=await pool.query('SELECT * FROM ah_sessions WHERE session_hash=$1 AND expires_at>NOW() LIMIT 1',[hash(sid)]);
 if(!rows.length)return null;
 try {return {...rows[0],accessToken:decrypt(rows[0].encrypted_access_token),sid};}catch{return null;}
}
export async function deleteSession(req){const sid=getCookies(req)[COOKIE];const pool=getPool();if(pool&&sid&&/^[A-Za-z0-9_-]{43}$/.test(sid))await pool.query('DELETE FROM ah_sessions WHERE session_hash=$1',[hash(sid)]);}
export async function authorizedGuilds(token){
 const r=await fetch('https://discord.com/api/v10/users/@me/guilds',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(6000)});
 if(!r.ok){const e=new Error('Discord session expired. Please sign in again.');e.status=401;throw e;}
 const list=await r.json();if(!Array.isArray(list))throw new Error('Invalid Discord response');
 return list.filter(g=>g&&typeof g.id==='string'&&(g.owner===true||isManagerPermission(g.permissions))).slice(0,200).map(g=>({id:g.id,name:g.name,icon:g.icon||null,owner:!!g.owner}));
}
export async function requiredSession(req){const session=await getSession(req);if(!session){const e=new Error('Sign in with Discord to continue');e.status=401;throw e;}return session;}
export function callbackUrl(){return `${siteOrigin()}/api/auth/callback`;}
