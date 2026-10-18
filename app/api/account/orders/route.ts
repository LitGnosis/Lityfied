import {NextResponse} from 'next/server';
import {currentUser} from '../../../../lib/auth';
import {ensureSchema,query} from '../../../../lib/db';
export async function GET(){
  const u=await currentUser();
  if(!u)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!u.email_verified)return NextResponse.json({error:'Verify your email to view orders.'},{status:403});
  try{
    await ensureSchema();
    const orders=await query(`select order_number,status,fulfillment_status,total_cents,currency,cj_order_id,tracking_number,carrier,created_at from orders where lower(customer_email)=lower($1) order by created_at desc limit 100`,[u.email]);
    return NextResponse.json({orders});
  }catch(e:any){return NextResponse.json({error:e.message},{status:503})}
}
