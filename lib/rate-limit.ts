import {createHash} from 'node:crypto';
import {query} from './db';
export async function rateLimit(key:string,limit:number,windowMs:number,strict=false){
 if(!process.env.DATABASE_URL){if(strict)throw new Error('Rate limiter unavailable');return false;}
 const bucket=Math.floor(Date.now()/windowMs);
 const id=createHash('sha256').update(`${key}:${windowMs}:${bucket}`).digest('hex');
 try{
  const row=(await query(`insert into rate_limit_buckets(id,hits,expires_at) values($1,1,to_timestamp($2)) on conflict(id) do update set hits=rate_limit_buckets.hits+1 returning hits`,[id,(bucket+2)*windowMs/1000]))[0];
  return row.hits<=limit;
 }catch{if(strict)throw new Error('Rate limiter unavailable');return false;}
}
export function clientKey(req:Request){return req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'}
