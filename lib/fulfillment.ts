import type Stripe from 'stripe';
import {query,transaction} from './db';
import {cjToken} from './cj';
import {supplierEnabled} from './launch';
export async function fulfillOrder(stripe:Stripe,sessionId:string){
 const session=await stripe.checkout.sessions.retrieve(sessionId);
 if(session.payment_status!=='paid')throw new Error('Order is not paid.');
 if(!supplierEnabled(session.livemode))return {fulfillment_state:session.livemode?'launch_gated':'test_payment_no_supplier_order'};
 if(!process.env.CJ_DEFAULT_LOGISTICS||!process.env.CJ_API_KEY)return {fulfillment_state:'awaiting_supplier_logistics'};
 const token=await cjToken(); // Authenticate before claiming an external submission.
 const claimed=await transaction(async()=>{
  const order=(await query('select * from orders where stripe_session_id=$1 for update',[sessionId]))[0];
  if(!order)throw new Error('Persist the paid order before supplier submission.');
  if(order.status!=='paid')throw new Error('Refunded orders cannot be fulfilled.');
  if(order.cj_order_id)return {existing:{fulfillment_state:order.fulfillment_status,cj_order_id:order.cj_order_id}};
  const previous=(await query('select state from fulfillment_attempts where order_id=$1',[order.id]))[0];
  if(previous&&previous.state!=='rejected')return {existing:{fulfillment_state:'supplier_reconciliation_required'}};
  const items=await query('select * from order_items where order_id=$1 order by id',[order.id]);
  const shipping=order.shipping_json,address=shipping?.address;
  if(!address?.country||!address?.city||!address?.line1||!items.length)throw new Error('Shipping address or order items missing.');
  const body={orderNumber:order.order_number,shippingZip:address.postal_code||'',shippingCountry:address.country,shippingCountryCode:address.country,shippingProvince:address.state||'',shippingCity:address.city,shippingPhone:session.customer_details?.phone||'',shippingCustomerName:shipping.name||session.customer_details?.name||'Customer',shippingAddress:address.line1,shippingAddress2:address.line2||'',email:order.customer_email,payType:process.env.CJ_AUTO_PAY_BALANCE==='true'?2:3,logisticName:process.env.CJ_DEFAULT_LOGISTICS,fromCountryCode:process.env.CJ_DEFAULT_FROM_COUNTRY||'CN',platform:'Api',orderFlow:1,products:items.map(x=>({vid:x.variant_id,quantity:x.quantity,storeLineItemId:String(x.id)}))};
  await query("insert into fulfillment_attempts(order_id,state) values($1,'submitting') on conflict(order_id) do update set state='submitting',error=null,updated_at=now()",[order.id]);
  await query("update orders set fulfillment_status='supplier_submitting',updated_at=now() where id=$1",[order.id]);
  return {order,body};
 });
 if(claimed.existing)return claimed.existing;
 const {order,body}=claimed;
 try{
  const response=await fetch('https://developers.cjdropshipping.com/api2.0/v1/shopping/order/createOrderV2',{method:'POST',headers:{'CJ-Access-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)});
  const result=await response.json();
  // Only an explicit rejection is safe to retry. Timeouts/5xx/invalid responses require reconciliation.
  if(response.ok&&result?.result===false){
   await transaction(async()=>{
    await query("update fulfillment_attempts set state='rejected',error=$1,updated_at=now() where order_id=$2",[String(result.message||'Supplier rejected order').slice(0,400),order.id]);
    await query("update orders set fulfillment_status='supplier_attention_required',updated_at=now() where id=$1",[order.id]);
   });
   return {fulfillment_state:'supplier_attention_required'};
  }
  const supplierId=String(result?.data?.orderId||'');
  if(!response.ok||result?.result!==true||!supplierId)throw new Error('Supplier outcome is uncertain; reconcile before retrying.');
  const state=body.payType===2?'supplier_paid_processing':'supplier_order_created';
  await transaction(async()=>{
   await query("update fulfillment_attempts set state='succeeded',supplier_order_id=$1,updated_at=now() where order_id=$2",[supplierId,order.id]);
   await query('update orders set cj_order_id=$1,fulfillment_status=$2,updated_at=now() where id=$3',[supplierId,state,order.id]);
  });
  return {fulfillment_state:state,cj_order_id:supplierId};
 }catch(error:any){
  await transaction(async()=>{
   await query("update fulfillment_attempts set state='unknown',error=$1,updated_at=now() where order_id=$2",[String(error.message||'Unknown supplier outcome').slice(0,400),order.id]);
   await query("update orders set fulfillment_status='supplier_reconciliation_required',updated_at=now() where id=$1",[order.id]);
  });
  return {fulfillment_state:'supplier_reconciliation_required'};
 }
}
