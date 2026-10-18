import {NextRequest,NextResponse} from 'next/server';
import {sameOrigin} from '../../../../lib/security';
import {resetPassword} from '../../../../lib/password-reset';
export async function POST(r:NextRequest){
 if(!sameOrigin(r))return NextResponse.json({error:'Invalid request origin.'},{status:403});
 try{const b=await r.json();await resetPassword(String(b.token||''),String(b.password||''));return NextResponse.json({ok:true})}
 catch{return NextResponse.json({error:'Invalid or expired reset request.'},{status:400})}
}
