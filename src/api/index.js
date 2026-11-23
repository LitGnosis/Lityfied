import {neon} from '@neondatabase/serverless';
import {randomUUID,randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
const sql=process.env.LITYFIED_GROWTH_DATABASE_URL?neon(process.env.LITYFIED_GROWTH_DATABASE_URL):null;
const q=(s,p=[])=>sql.query(s,p),sha=s=>createHash('sha256').update(s).digest('hex'),err=(res,c,s)=>res.status(c).json({error:s});
const allowed=['youtube','instagram','tiktok','twitch','kick','facebook','x','linkedin'];
const str=(v,n=300)=>typeof v==='string'?v.trim().slice(0,n):'';
function cookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('lityfied_session='))?.slice(17)||''}
async function session(req){const raw=cookie(req);if(!raw||raw.length>120)return null;const a=await q('SELECT s.user_id,s.csrf,u.email FROM growth.sessions s JOIN growth.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() LIMIT 1',[sha(raw)]);return a[0]||null}
async function login(res,id){const key=randomBytes(32).toString('hex'),csrf=randomBytes(20).toString('hex');await q("INSERT INTO growth.sessions(token_hash,csrf,user_id,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",[sha(key),csrf,id]);res.setHeader('Set-Cookie','lityfied_session='+key+'; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800');return res.status(200).json({ok:true})}
async function rate(key,max){const a=await q("INSERT INTO growth.rate_limits(key,hits,window_start) VALUES($1,1,now()) ON CONFLICT(key) DO UPDATE SET hits=CAS¶»§q«^