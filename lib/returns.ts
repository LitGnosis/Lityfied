import {query,transaction} from './db';
export class ReturnError extends Error{constructor(message:string,public status:number){super(message)}}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function requestReturn(email:string,orderNumber:string,reason:string,details:string){
 if(!reason.trim())throw new ReturnError('Choose a return reason.',400);
 return transaction(async()=>{
  // Serialize requests for this order before checking for an existing return.
  const order=(await query('select id,status from orders where order_number=$1 and lower(customer_email)=lower($2) for update',[orderNumber,email]))[0];
  if(!order)throw new ReturnError('Order not found.',404);
  if(order.status==='refunded')throw new ReturnError('This order has already been refunded.',409);
  if((await query("select id from returns where order_id=$1 and status not in ('rejected','closed')",[order.id])).length)throw new ReturnError('A return request already exists for this order.',409);
  const row=(await query('insert into returns(order_id,email,reason,details) values($1,$2,$3,$4) returning id,status',[order.id,email,reason,details]))[0];
  await query('insert into order_events(order_id,event_type,detail_json) values($1,$2,$3)',[order.id,'return_requested',JSON.stringify({returnId:row.id,reason})]);
  await query('insert into email_outbox(dedupe_key,recipient,subject,html) values($1,$2,$3,$4)',[`return-request-${row.id}`,email,`Return request for ${orderNumber}`,`<h1>Return request received</h1><p>Order: ${escapeHtml(orderNumber)}</p><p>Reason: ${escapeHtml(reason)}</p><p>Follow the status from your Lityfied account.</p>`]);
  return row;
 });
}
