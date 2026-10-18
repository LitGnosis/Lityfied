import {NextRequest,NextResponse} from 'next/server';
import {currentUser} from '../../../lib/auth';
import {ensurePlatinumSchema,query} from '../../../lib/db';
import {sameOrigin} from '../../../lib/security';
import {rateLimit,clientKey} from '../../../lib/rate-limit';

export async function GET(){
  const u=await currentUser();if(!u)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{await ensurePlatinumSchema();const subscriptions=await query<any>(`select id,email,product_id,kind,target_price_cents,active,created_at from notification_subscriptions where user_id=$1 order by active desc,created_at desc`,[u.id]);return NextResponse.json({subscriptions})}catch(e:any){return NextResponse.json({error:e.message||'Unable to load notifications'},{status:503})}
}

export async function POST(r:NextRequest){
  if(!sameOrigin(r))return NextResponse.json({error:'Invalid origin'},{status:403});
  if(!await rateLimit(`notify:${clientKey(r)}`,20,3600000))return NextResponse.json({error:'Too many requests'},{status:429});
  try{
    const b=await r.json(),u=await currentUser(),email=String(u?.email||b.email||'').trim().toLowerCase(),kind=String(b.kind||''),productId=b.productId?String(b.productId).slice(0,200):null;
    if(!/^\S+@\S+\.\S+$/.test(email)||!['back_in_stock','price_drop','marketing'].includes(kind))throw new Error('Invalid subscription');
    if(kind!=='marketing'&&!productId)throw new Error('Product is required for this alert.');
    await ensurePlatinumSchema();
    if(kind==='marketing'){
      const existing=(await query<any>(`select id from notification_subscriptions where lower(email)=lower($1) and kind='marketing' and product_id is null order by created_at desc limit 1`,[email]))[0];
      if(existing)await query(`update notification_subscriptions set user_id=coalesce($1,user_id),active=true,target_price_cents=null where id=$2`,[u?.id||null,existing.id]);
      else await query(`insert into notification_subscriptions(user_id,email,product_id,kind,target_price_cents) values($1,$2,null,'marketing',null)`,[u?.id||null,email]);
    }else{
      await query(`insert into notification_subscriptions(user_id,email,product_id,kind,target_price_cents) values($1,$2,$3,$4,$5) on conflict(email,product_id,kind) do update set user_id=coalesce(excluded.user_id,notification_subscriptions.user_id),active=true,target_price_cents=excluded.target_price_cents`,[u?.id||null,email,productId,kind,b.targetPriceCents||null]);
    }
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({error:e.message||'Unable to subscribe'},{status:400})}
}

export async function DELETE(r:NextRequest){
  if(!sameOrigin(r))return NextResponse.json({error:'Invalid origin'},{status:403});
  const u=await currentUser();if(!u)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{const b=await r.json();await ensurePlatinumSchema();if(b.id)await query('update notification_subscriptions set active=false where id=$1 and user_id=$2',[Number(b.id),u.id]);else if(b.kind==='marketing')await query(`update notification_subscriptions set active=false where user_id=$1 and kind='marketing' and product_id is null`,[u.id]);else return NextResponse.json({error:'Subscription id required'},{status:400});return NextResponse.json({ok:true})}catch(e:any){return NextResponse.json({error:e.message||'Unable to unsubscribe'},{status:400})}
}
