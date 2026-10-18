import Stripe from 'stripe';
import {reconcileExpiredReservations} from '../../../../lib/reservations';
import {NextRequest,NextResponse} from 'next/server';
import {ensurePlatinumSchema,query} from '../../../../lib/db';
import {sendEmail} from '../../../../lib/email';
function authorized(r:NextRequest){const secret=process.env.CRON_SECRET;return Boolean(secret)&&r.headers.get('authorization')===`Bearer ${secret}`}
function site(){return (process.env.NEXT_PUBLIC_SITE_URL||'').replace(/\/$/,'')}
export async function GET(r:NextRequest){
 if(!authorized(r))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  await ensurePlatinumSchema();
  if(process.env.STRIPE_SECRET_KEY)await reconcileExpiredReservations(new Stripe(process.env.STRIPE_SECRET_KEY,{timeout:12000,maxNetworkRetries:1}));
  const carts=await query<any>(`select u.id user_id,u.email,max(c.updated_at) cart_updated,count(*)::int items from users u join carts c on c.user_id=u.id where c.updated_at between now()-interval '7 days' and now()-interval '3 hours' and exists(select 1 from notification_subscriptions n where n.user_id=u.id and n.kind='marketing' and n.product_id is null and n.active=true) and not exists(select 1 from orders o where lower(o.customer_email)=lower(u.email) and o.created_at>c.updated_at) group by u.id,u.email order by max(c.updated_at) desc limit 100`);
  let cartEmails=0,wishlistEmails=0;
  for(const x of carts){const day=new Date().toISOString().slice(0,10),key=`${day}:${new Date(x.cart_updated).toISOString().slice(0,13)}`;const ins=await query<any>(`insert into lifecycle_deliveries(user_id,kind,dedupe_key) values($1,'abandoned_cart',$2) on conflict do nothing returning id`,[x.user_id,key]);if(!ins.length)continue;const result=await sendEmail(x.email,'Your Lityfied cart is still waiting',`<h1>Your cart is waiting</h1><p>You still have ${x.items} item${Number(x.items)===1?'':'s'} saved in your Lityfied cart.</p><p><a href="${site()}/">Return to your cart</a></p><p style="font-size:12px;color:#666">You received this because marketplace updates are enabled in your Lityfied account.</p>`).catch(()=>({sent:false}));if(result.sent)cartEmails++;else await query(`delete from lifecycle_deliveries where user_id=$1 and kind='abandoned_cart' and dedupe_key=$2`,[x.user_id,key])}
  const wish=await query<any>(`select u.id user_id,u.email,count(*)::int items from users u join wishlists w on w.user_id=u.id where w.created_at<now()-interval '3 days' and exists(select 1 from notification_subscriptions n where n.user_id=u.id and n.kind='marketing' and n.product_id is null and n.active=true) group by u.id,u.email order by count(*) desc limit 100`);
  const now=new Date();const week=`${now.getUTCFullYear()}-W${Math.ceil((((now.getTime()-Date.UTC(now.getUTCFullYear(),0,1))/86400000)+new Date(Date.UTC(now.getUTCFullYear(),0,1)).getUTCDay()+1)/7)}`;
  for(const x of wish){const ins=await query<any>(`insert into lifecycle_deliveries(user_id,kind,dedupe_key) values($1,'wishlist_reminder',$2) on conflict do nothing returning id`,[x.user_id,week]);if(!ins.length)continue;const result=await sendEmail(x.email,'Your Lityfied favorites are waiting',`<h1>Still thinking about your saved finds?</h1><p>You have ${x.items} saved item${Number(x.items)===1?'':'s'} in your Lityfied wishlist.</p><p><a href="${site()}/">See your saved finds</a></p><p style="font-size:12px;color:#666">Marketplace updates can be turned off from your Lityfied account.</p>`).catch(()=>({sent:false}));if(result.sent)wishlistEmails++;else await query(`delete from lifecycle_deliveries where user_id=$1 and kind='wishlist_reminder' and dedupe_key=$2`,[x.user_id,week])}
  return NextResponse.json({ok:true,cartsChecked:carts.length,wishlistsChecked:wish.length,cartEmails,wishlistEmails});
 }catch(e:any){console.error('LITYFIED_LIFECYCLE_CRON_ERROR',e?.message||e);return NextResponse.json({error:e.message||'Lifecycle job failed'},{status:500})}
}
