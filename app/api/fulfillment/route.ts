import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {db} from '@/lib/database';
import {dispatchFulfillment} from '@/lib/fulfillment';
export async function GET(request:NextRequest){
 const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '';
 const provided = request.headers.get('authorization') || '';
 if(!expected || Buffer.byteLength(expected)!==Buffer.byteLength(provided) || !timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return NextResponse.json({error:'Unauthorized'},{status:401});
 const sql=db();
 // Ambiguous or interrupted sends require reconciliation, not a blind resend.
 await sql`update fulfillment_jobs set status='needs_review' where status='sending' and attempted_at < now()-interval '10 minutes'`;
 const jobs=await sql`select distinct session_id from fulfillment_jobs where status='pending' order by session_id limit 25`;
 let failed=0;
 for(const job of jobs){try{await dispatchFulfillment(job.session_id)}catch{failed++}}
 return NextResponse.json({checked:jobs.length,failed});
}
