import {NextRequest,NextResponse} from 'next/server';
import {ensurePlatinumSchema,query} from '../../../../lib/db';
import {adminRole} from '../../../../lib/admin';
export async function GET(req:NextRequest){
 const role=adminRole(req);
 if(!role)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  await ensurePlatinumSchema();
  const [stats,attention,reviews,tickets,returns,recent,questions,analytics,rewards,promotions,funnel]=await Promise.all([
   ["owner", "operations"].includes(role)?query(`select count(*)::int orders,coalesce(sum(total_cents),0)::bigint revenue_cents,count(distinct lower(customer_email))::int customers,coalesce(avg(total_cents),0)::bigint aov_cents from orders`):Promise.resolve([]),
   ["owner", "operations"].includes(role)?query(`select order_number,customer_email,status,fulfillment_status,total_cents,created_at from orders where fulfillment_status in ('supplier_attention_required','pending','awaiting_supplier_logistics','awaiting_shipping_details','no_cj_items','supplier_unpaid','paid_pending_supplier','supplier_submitting','supplier_reconciliation_required') order by created_at desc limit 50`):Promise.resolve([]),
   ["owner", "support", "marketing"].includes(role)?query(`select id,product_id,email,rating,title,verified,created_at from reviews where status='pending' order by created_at desc limit 50`):Promise.resolve([]),
   ["owner", "support", "operations"].includes(role)?query(`select t.id,t.email,t.order_number,t.category,t.message,t.status,t.created_at,(select m.message from support_messages m where m.ticket_id=t.id order by m.created_at desc limit 1) latest_message from support_tickets t where t.status='open' order by t.updated_at desc limit 50`):Promise.resolve([]),
   ["owner", "support", "operations"].includes(role)?query(`select r.id,o.order_number,o.total_cents,r.email,r.reason,r.details,r.status,r.refund_cents,r.created_at from returns r join orders o on o.id=r.order_id where r.status in ('requested','approved','received') order by r.created_at desc limit 50`):Promise.resolve([]),
   ["owner", "operations", "support"].includes(role)?query(`select order_number,customer_email,status,fulfillment_status,total_cents,currency,tracking_number,tracking_url,carrier,created_at from orders order by created_at desc limit 25`):Promise.resolve([]),
   ["owner", "support", "marketing"].includes(role)?query(`select id,product_id,email,question,created_at from product_questions where status='pending' order by created_at desc limit 50`):Promise.resolve([]),
   ["owner", "marketing"].includes(role)?query(`select event_name,count(*)::int count from analytics_events where created_at>now()-interval '30 days' group by event_name order by count desc limit 20`):Promise.resolve([]),
   ["owner"].includes(role)?query(`select coalesce(sum(points_balance),0)::bigint points_outstanding,coalesce(sum(store_credit_cents),0)::bigint credit_cents,count(*)::int members from user_rewards`):Promise.resolve([]),
   ["owner", "marketing"].includes(role)?query(`select id,code,kind,value,min_cents,active,starts_at,ends_at,max_uses,uses from promotions order by active desc,created_at desc nulls last,id desc limit 50`).catch(()=>query(`select id,code,kind,value,min_cents,active,starts_at,ends_at,max_uses,uses from promotions order by active desc,id desc limit 50`)):Promise.resolve([]),
   ["owner", "marketing"].includes(role)?query(`select count(*) filter(where event_name='search')::int searches,count(*) filter(where event_name='product_view')::int product_views,count(*) filter(where event_name='add_to_cart')::int add_to_carts,count(*) filter(where event_name='begin_checkout')::int checkouts,count(*) filter(where event_name='purchase')::int purchases from analytics_events where created_at>now()-interval '30 days'`):Promise.resolve([])
  ]);
  return NextResponse.json({role,stats:stats[0]||null,attention,pendingReviews:reviews,openTickets:tickets,returns,recentOrders:recent,pendingQuestions:questions,analytics,rewards:rewards[0],promotions,funnel:funnel[0]});
 }catch(e:any){return NextResponse.json({error:e.message},{status:503})}
}
