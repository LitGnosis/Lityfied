import {shippingEmail,safeTrackingUrl} from '../../../../lib/shipping-email';
import {NextRequest,NextResponse} from 'next/server';
import {ensurePlatinumSchema,query,transaction} from '../../../../lib/db';
import {cjOrderDetailsBatch} from '../../../../lib/cj';
import {sendEmail} from '../../../../lib/email';

function authorized(r:NextRequest){const secret=process.env.CRON_SECRET;return Boolean(secret)&&r.headers.get('authorization')===`Bearer ${secret}`}
function mapStatus(status:string){const s=String(status||'').toUpperCase();if(s==='DELIVERED')return'delivered';if(s==='SHIPPED')return'shipped';if(s==='CANCELLED')return'cancelled';if(['PENDING','PROCESSING','UNSHIPPED'].includes(s))return'processing';if(s==='UNPAID')return'supplier_unpaid';return'supplier_order_created'}
async function sendStateEmail(order:any,state:string,tracking:string,carrier:string,trackingUrl:string){
 const eventType=state==='shipped'?'shipment_email':state==='delivered'?'delivery_email':'';if(!eventType)return false;
 const prior=(await query<any>('select 1 from order_events where order_id=$1 and event_type=$2 limit 1',[order.id,eventType]))[0];if(prior)return false;
 const subject=state==='shipped'?`Your Lityfied order ${order.order_number} shipped`:`Your Lityfied order ${order.order_number} was delivered`;
 const html=shippingEmail(order.order_number,state,tracking,carrier,trackingUrl,process.env.NEXT_PUBLIC_SITE_URL);
 return transaction(async()=>{
  const queued=await query('insert into email_outbox(dedupe_key,recipient,subject,html) values($1,$2,$3,$4) on conflict do nothing returning id',[`${eventType}-${order.id}`,order.customer_email,subject,html]);
  if(queued.length)await query('insert into order_events(order_id,event_type,detail_json) values($1,$2,$3)',[order.id,eventType,JSON.stringify({queued:true,tracking,carrier,trackingUrl})]);
  return queued.length>0;
 });
}
export async function GET(r:NextRequest){
 if(!authorized(r))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  await ensurePlatinumSchema();
  const orders=await query<any>(`select id,order_number,customer_email,cj_order_id,fulfillment_status,tracking_number,tracking_url,carrier from orders where cj_order_id is not null and fulfillment_status not in ('cancelled','refunded') order by updated_at asc limit 80`);
  const details=await cjOrderDetailsBatch(orders.map((o:any)=>String(o.cj_order_id)));let updated=0,emails=0;
  for(const o of orders){
   const d=details.find((x:any)=>String(x.orderId||x.cjOrderId||x.cjOrderCode||'')===String(o.cj_order_id)||String(x.orderNum||'')===String(o.order_number));if(!d)continue;
   const next=mapStatus(d.orderStatus||d.subStatus),tracking=String(d.trackNumber||d.trackingNumber||d.cjTrackingNumber||o.tracking_number||''),carrier=String(d.trackingProvider||d.logisticName||o.carrier||''),trackingUrl=safeTrackingUrl(d.trackingUrl||o.tracking_url||'');
   const changed=next!==o.fulfillment_status||tracking!==String(o.tracking_number||'')||trackingUrl!==String(o.tracking_url||'')||carrier!==String(o.carrier||'');
   if(changed){await query(`update orders set fulfillment_status=$1,tracking_number=nullif($2,''),carrier=nullif($3,''),tracking_url=nullif($4,''),updated_at=now() where id=$5`,[next,tracking,carrier,trackingUrl,o.id]);await query(`insert into order_events(order_id,event_type,detail_json) values($1,'supplier_sync',$2)`,[o.id,JSON.stringify({status:next,tracking,carrier,trackingUrl,cjStatus:d.orderStatus,subStatus:d.subStatus})]);updated++}
   if((next==='shipped'||next==='delivered')&&await sendStateEmail(o,next,tracking,carrier,trackingUrl))emails++;
  }
  return NextResponse.json({ok:true,checked:orders.length,updated,emails});
 }catch(e:any){console.error('LITYFIED_FULFILLMENT_SYNC_ERROR',e?.message||e);return NextResponse.json({error:e?.message||'Sync failed'},{status:500})}
}
