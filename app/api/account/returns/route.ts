import {NextRequest,NextResponse} from 'next/server';
import {currentUser} from '../../../../lib/auth';
import {sameOrigin} from '../../../../lib/security';
import {rateLimit,clientKey} from '../../../../lib/rate-limit';
import {requestReturn,ReturnError} from '../../../../lib/returns';
export async function POST(r:NextRequest){
 if(!sameOrigin(r))return NextResponse.json({error:'Invalid request origin.'},{status:403});
 try{
  const u=await currentUser();if(!u)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!u.email_verified)return NextResponse.json({error:'Verify your email before accessing orders or returns.'},{status:403});
  if(!await rateLimit(`return:${clientKey(r)}`,10,60000))return NextResponse.json({error:'Too many requests.'},{status:429});
  let b;try{b=await r.json()}catch{return NextResponse.json({error:'Invalid request.'},{status:400})}
  if(!b||typeof b!=='object')return NextResponse.json({error:'Invalid request.'},{status:400});
  const row=await requestReturn(u.email,String(b.orderNumber||'').trim().slice(0,120),String(b.reason||'').trim().slice(0,120),String(b.details||'').trim().slice(0,1000));
  return NextResponse.json({return:row});
 }catch(e){return NextResponse.json({error:e instanceof ReturnError?e.message:'Return requests are temporarily unavailable.'},{status:e instanceof ReturnError?e.status:503})}
}
