import {neon} from '@neondatabase/serverless';
import {randomUUID,createHash,timingSafeEqual} from 'node:crypto';
const sql=process.env.LITYFIED_GROWTH_DATABASE_URL?neon(process.env.LITYFIED_GROWTH_DATABASE_URL):null;
const q=(s,p=[])=>sql.query(s,p);
const sha=s=>createHash('sha256').update(s).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const err=(res,n,s)=>res.status(n).json({error:s});
const enabled=()=>process.env.LAB_ENABLE_RUNS==='true'&&!!process.env.GENYMOTION_API_TOKEN&&uuid.test(process.env.GENYMOTION_RECIPE_UUID||'')&&!!process.env.LAB_WORKER_SECRET&&/^https:\/\//.test(process.env.LAB_WORKER_URL||'');
const eq=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y)};
function cookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('lityfied_session='))?.slice(17)||''}
async function auth(req){const c=cookie(req);if(!c||c.length>120)return null;const a=await q("SELECT s.user_id,s.csrf FROM growth.sessions s WHERE s.token_hash=$1 AND s.expires_at>now() LIMIT 1",[sha(c)]);return a[0]||null}
async function membership(userId,wid){if(!uuid.test(wid))return false;const a=await q("SELECT 1 FROM growth.workspaces WHERE id=$1 AND user_id=$2 LIMIT 1",[wid,userId]);return !!a.length}
async function provider(method,path,payload){if(!process.env.GENYMOTION_API_TOKEN)throw new Error('provider_unconfigured');
 const r=await fetch('https:¶»§q«^