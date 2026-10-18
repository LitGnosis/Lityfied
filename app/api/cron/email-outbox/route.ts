import {NextRequest,NextResponse} from 'next/server';
import {ensureSchema,query,transaction} from '../../../../lib/db';
import {sendEmail} from '../../../../lib/email';
import {safeEqual} from '../../../../lib/security';
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||!safeEqual(req.headers.get('authorization')||'',`Bearer ${secret}`))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  await ensureSchema();await query('delete from rate_limit_buckets where expires_at<now()');let sent=0,failed=0,review=0;
  for(let i=0;i<25;i++){
   const result=await transaction(async()=>{
    const item=(await query(`select * from email_outbox where sent_at is null and (last_error is null or last_error<>'manual_review_required') order by attempts,created_at for update skip locked limit 1`))[0];
    if(!item)return 'empty';
    // Resend keys expire after 24h; an uncertain old send needs operator review.
    if(Date.now()-new Date(item.created_at).getTime()>23*60*60*1000){
     await query("update email_outbox set last_error='manual_review_required' where id=$1",[item.id]);return 'review';
    }
    try{
     const result=await sendEmail(item.recipient,item.subject,item.html,item.dedupe_key);
     if(!result.sent)throw new Error('Email provider not configured');
     await query('update email_outbox set sent_at=now(),attempts=attempts+1,last_error=null where id=$1',[item.id]);return 'sent';
    }catch{
     await query("update email_outbox set attempts=attempts+1,last_error='delivery_failed' where id=$1",[item.id]);return 'failed';
    }
   });
   if(result==='empty')break;
   if(result==='sent')sent++;else if(result==='review')review++;else {failed++;break;}
  }
  return NextResponse.json({ok:failed===0&&review===0,sent,failed,review},{status:failed||review?503:200});
 }catch{return NextResponse.json({error:'Email queue unavailable'},{status:503})}
}
