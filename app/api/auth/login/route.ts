import {NextRequest,NextResponse} from 'next/server';
import {loginUser} from '../../../../lib/auth';
import {rateLimit,clientKey} from '../../../../lib/rate-limit';
import {sameOrigin} from '../../../../lib/security';
export async function POST(r:NextRequest){
  if(!sameOrigin(r))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  if(!await rateLimit(`login:${clientKey(r)}`,8,15*60*1000))return NextResponse.json({error:'Too many login attempts. Try again later.'},{status:429});
  try{const b=await r.json();return NextResponse.json({ok:true,user:await loginUser(String(b.email||''),String(b.password||''))})}
  catch{return NextResponse.json({error:'Invalid email or password.'},{status:401})}
}
