import pg from 'pg';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL missing; integrity verification was not run.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
const checks={
 missing_migration:"select count(*)::int n from (select 1 where not exists(select 1 from schema_migrations where version='002_launch_safety.sql')) s",
 duplicate_orders:'select count(*)::int n from (select stripe_session_id from orders group by stripe_session_id having count(*)>1) s',
 orphan_items:'select count(*)::int n from order_items i left join orders o on o.id=i.order_id where o.id is null',
 orders_without_items:'select count(*)::int n from orders o where not exists(select 1 from order_items i where i.order_id=o.id)',
 negative_rewards:'select count(*)::int n from user_rewards where points_balance<0 or store_credit_cents<0',
 over_reserved_credit:"select count(*)::int n from user_rewards u where store_credit_cents<(select coalesce(sum(amount_cents),0) from store_credit_reservations r where r.user_id=u.user_id and status='reserved')",
 unknown_supplier_submissions:"select count(*)::int n from fulfillment_attempts where state in ('unknown','submitting')",
 refund_overpayments:'select count(*)::int n from orders o where total_cents<(select coalesce(sum(refund_cents),0) from returns r where r.order_id=o.id)',
 email_manual_review:"select count(*)::int n from email_outbox where last_error='manual_review_required'"
};
try{
 const results={};for(const [name,sql] of Object.entries(checks))results[name]=(await pool.query(sql)).rows[0].n;
 console.log(JSON.stringify({ok:Object.values(results).every(x=>x===0),checks:results},null,2));
 if(Object.values(results).some(x=>x!==0))process.exitCode=1;
}finally{await pool.end()}
