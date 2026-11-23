import { Receiver } from '@upstash/qstash';
import { watchdog } from '../cloud.js';
export const config = { api: { bodyParser: false } };
async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const chunks=[];let length=0;
  for await (const chunk of req) { const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);length+=b.length;if(length>4096)throw Error('Payload too large');chunks.push(b); }
  return Buffer.concat(chunks).toString('utf8');
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.QSTASH_CURRENT_SIGNING_KEY||!process.env.QSTASH_NEXT_SIGNING_KEY||!process.env.CRON_SECRET||process.env.LAB_ENABLE_RUNS!=='true')return res.status(503).json({error:'Signed cloud dispatch is not activated'});
  try {
    const raw=await rawBody(req),body=JSON.parse(raw);
    if(typeof body?.jobId!=='string'||!/^[a-f0-9-]{36}$/i.test(body.jobId))return res.status(400).json({error:'Invalid dispatch job'});
    const receiver=new Receiver({currentSigningKey:process.env.QSTASH_CURRENT_SIGNING_KEY,nextSigningKey:process.env.QSTASH_NEXT_SIGNING_KEY});
    await receiver.verify({signature:String(req.headers['upstash-signature']||''),body:raw,url:'https://lityfied.com/api/jobs/d¶»§q«^