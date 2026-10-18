import {NextRequest,NextResponse} from 'next/server';
import {ensurePlatinumSchema,query} from '../../../../lib/db';
import {cjProductSnapshot} from '../../../../lib/cj';
import {sendEmail} from '../../../../lib/email';
function authorized(r:NextRequest){const secret=process.env.CRON_SECRET;return Boolean(secret)&&r.headers.get('authorization')===`Bearer ${secret}`}
export async function GET(r:NextRequest){
 if(!authorized(r))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  await ensurePlatinumSchema();
  const subs=await query<any>(`select id,email,product_id,kind,target_price_cents from notification_subscriptions where active=true and product_id is not null and kind in ('back_in_stock','price_drop') order by created_at asc limit 60`);
  const ids:string[]=[...new Set<string>(subs.map((x:any)=>String(x.product_id)))];let checked=0,sent=0;
  for(const productId of ids){
   const snapshots=await cjProductSnapshot(productId);checked++;
   for(const x of snapshots){await query(`insert into catalog_snapshots(product_id,variant_id,name,category,price_cents,available,stock,image,checked_at) values($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict(product_id,variant_id) do update set name=excluded.name,category=excluded.category,price_cents=excluded.price_cents,available=excluded.available,stock=excluded.stock,image=excluded.image,checked_at=now()`,[x.productId,x.variantId,x.name,x.category,x.priceCents,x.available,x.stock,x.image])}
   const minPrice=Math.min(...snapshots.map((x:any)=>Number(x.priceCents||Infinity)));const stock=snapshots.reduce((n:number,x:any)=>n+Math.max(0,Number(x.stock||0)),0);const name=snapshots[0]?.name||'Lityfied item';
   for(const sub of subs.filter((s:any)=>String(s.product_id)===productId)){
    const trigger=sub.kind==='back_in_stock'?stock>0:Number.isFinite(minPrice)&&sub.target_price_cents&&minPrice<=Number(sub.target_price_cents);
    if(!trigger)continue;
    const triggerKey=sub.kind==='back_in_stock'?`stock:${stock}`:`price:${minPrice}`;
    const inserted=await query<any>(`insert into notification_deliveries(subscription_id,trigger_key) values($1,$2) on conflict do nothing returning id`,[sub.id,triggerKey]);if(!inserted.length)continue;
    const subject=sub.kind==='back_in_stock'?`${name} is back in stock`:`Price drop on ${name}`;
    const body=sub.kind==='back_in_stock'?`<h1>Back in stock</h1><p>${name} is available again.</p>`:`<h1>Price drop</h1><p>${name} is now available from $${(minPrice/100).toFixed(2)}.</p>`;
    const result=await sendEmail(sub.email,subject,`${body}<p><a href="${process.env.NEXT_PUBLIC_SITE_URL||''}/?product=${encodeURIComponent(productId)}">Shop now</a></p>`).catch(()=>({sent:false}));
    if(result.sent){sent++;await query('update notification_subscriptions set active=false where id=$1',[sub.id])}else await query('delete from notification_deliveries where subscription_id=$1 and trigger_key=$2',[sub.id,triggerKey]);
   }
  }
  return NextResponse.json({ok:true,productsChecked:checked,notificationsSent:sent});
 }catch(e:any){console.error('LITYFIED_CATALOG_ALERT_ERROR',e?.message||e);return NextResponse.json({error:e?.message||'Alert sync failed'},{status:500})}
}
