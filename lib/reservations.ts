import type Stripe from 'stripe';
import {query,transaction} from './db';
import {recordPaidOrder} from './orders';
import {fulfillOrder} from './fulfillment';
export async function reconcileExpiredReservations(stripe:Stripe){
 const rows=await query(`select stripe_session_id from store_credit_reservations where status='reserved' and expires_at<=now() union select stripe_session_id from promotion_reservations where status='reserved' and expires_at<=now() limit 50`);
 let released=0,recovered=0;
 for(const row of rows){
  const session=await stripe.checkout.sessions.retrieve(row.stripe_session_id);
  // A delayed paid webhook must not free credit that has already been spent.
  if(session.payment_status==='paid'){
   await recordPaidOrder(stripe,session.id);await fulfillOrder(stripe,session.id);recovered++;
  }else if(session.status==='expired'){
   await transaction(async()=>{
    await query("update store_credit_reservations set status='released' where stripe_session_id=$1 and status='reserved'",[session.id]);
    await query("update promotion_reservations set status='released' where stripe_session_id=$1 and status='reserved'",[session.id]);
   });released++;
  }
 }
 return {checked:rows.length,released,recovered};
}
