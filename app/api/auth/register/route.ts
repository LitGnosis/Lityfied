import crypto from 'crypto';
import {NextRequest,NextResponse} from 'next/server';
import {createUser,loginUser} from '../../../../lib/auth';
import {ensurePlatinumSchema,query} from '../../../../lib/db';
import {rateLimit,clientKey} from '../../../../lib/rate-limit';
import {sameOrigin} from '../../../../lib/security';
import {sendEmail} from '../../../../lib/email';
export async function POST(r:NextRequest){
  if(!sameOrigin(r))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  if(!await rateLimit(`register:${clientKey(r)}`,5,60*60*1000))return NextResponse.json({error:'Too many registration attempts. Try again later.'},{status:429});
  try{
    const b=await r.json();
    const created=await createUser(String(b.email||''),String(b.password||''),String(b.name||''),String(b.referralCode||''));
    const user=await loginUser(String(b.email||''),String(b.password||''));
    await ensurePlatinumSchema();
    const token=crypto.randomBytes(32).toString('hex');
    const hash=crypto.createHash('sha256').update(token).digest('hex');
    await query('delete from email_verifications where user_id=$1 or expires_at<now()',[created.id]);
    await query("insert into email_verifications(user_id,token_hash,expires_at) values($1,$2,now()+interval '24 hours')",[created.id,hash]);
    const base=(process.env.NEXT_PUBLIC_SITE_URL||r.nextUrl.origin).replace(/\/$/,'');
    sendEmail(created.email,'Welcome to Lityfied — verify your email',`<h1>Welcome to Lityfied</h1><p>Your member account is ready. Verify your email to secure order, support and reward communications.</p><p><a href="${base}/api/auth/verify-email?token=${token}">Verify my email</a></p><p>This verification link expires in 24 hours.</p>`).catch(()=>{});
    return NextResponse.json({ok:true,user});
  }catch(e:any){return NextResponse.json({error:e.message||'Registration failed'},{status:400})}
}
