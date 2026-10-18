import Stripe from 'stripe';
import {db} from './database';
import {products} from './catalog';

export function paidCart(session: Stripe.Checkout.Session) {
  if(session.metadata?.integration !== 'lityfied-v1' || session.payment_status !== 'paid') return null;
  const cart = (session.metadata.cart || '').split(',').map(line => {
    const [slug, count] = line.split(':');
    const product = products.find(p => p.slug === slug);
    const quantity = Number(count);
    if(!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('Invalid paid cart');
    return {product, quantity};
  });
  if(session.currency !== 'usd' || cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0) !== session.amount_subtotal) throw new Error('Paid amount mismatch');
  return cart;
}

export async function persistPayment(session: Stripe.Checkout.Session) {
  const cart = paidCart(session);
  if(!cart) return false;
  const sql = db();
  const payload = JSON.stringify(cart.map(({product, quantity}) => ({slug:product.slug, quantity, price:product.price, kind:product.fulfillment || 'physical'})));
  // One database transaction: retries cannot strand an event ahead of its order/jobs.
  await sql.transaction([
    sql`insert into orders(stripe_session_id,status,subtotal_cents,tax_cents,shipping_cents)
      values(${session.id},'paid',${session.amount_subtotal!},${session.total_details?.amount_tax || 0},${session.total_details?.amount_shipping || 0}) on conflict(stripe_session_id) do nothing`,
    sql`insert into order_items(order_id,product_slug,quantity,unit_price_cents)
      select o.id,j.slug,j.quantity,j.price from orders o,
      jsonb_to_recordset(${payload}::jsonb) as j(slug text,quantity int,price int,kind text)
      where o.stripe_session_id=${session.id}
      and not exists(select 1 from order_items i where i.order_id=o.id and i.product_slug=j.slug)`,
    sql`insert into fulfillment_jobs(session_id,kind,customer_email,payload)
      select ${session.id},j.kind,${session.customer_details?.email || null},${JSON.stringify(session)}::jsonb
      from jsonb_to_recordset(${payload}::jsonb) as j(slug text,quantity int,price int,kind text)
      group by j.kind on conflict(session_id,kind) do nothing`
  ]);
  return true;
}

export async function dispatchFulfillment(sessionId: string) {
  const sql = db();
  const jobs = await sql`select * from fulfillment_jobs where session_id=${sessionId} and status='pending'`;
  for(const job of jobs) {
    const session = job.payload as Stripe.Checkout.Session;
    const cart = paidCart(session)!;
    const downloads: Record<string,string> = JSON.parse(process.env.DIGITAL_DOWNLOAD_URLS || '{}');
    const digital = cart.filter(({product}) => product.fulfillment === 'digital');
    const to = job.kind === 'digital' ? job.customer_email : process.env.FULFILLMENT_NOTIFY_EMAIL;
    if(!to || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || (job.kind === 'digital' && digital.some(({product}) => !downloads[product.slug] || !downloads[product.slug].startsWith('https://')))) continue;
    const rows = await sql`update fulfillment_jobs set status='sending',attempted_at=now() where id=${job.id} and status='pending' returning id`;
    if(!rows.length) continue;
    // Do not blindly retry ambiguous sends: provider idempotency expires after 24 hours.
    const text = job.kind === 'digital'
      ? digital.map(({product}) => `${product.name}: ${downloads[product.slug]}`).join('\n')
      : `Paid order ${session.id}\n${cart.filter(({product}) => product.fulfillment !== 'digital').map(({product,quantity}) => `${quantity} x ${product.name}`).join('\n')}\nCustomer/shipping details: ${JSON.stringify(session.customer_details)}\nShipping details: ${JSON.stringify(session.collected_information?.shipping_details)}\nShip this order manually. This notification does not mean it has shipped.`;
    const body = {from:process.env.EMAIL_FROM,to:[to],subject:job.kind === 'digital' ? 'Your Lityfied downloads' : 'Lityfied paid order — shipping required',text};
    try {
      const response = await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`fulfillment/${job.id}`},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error('Email not confirmed');
      await sql`update fulfillment_jobs set status='sent' where id=${job.id}`;
    } catch {
      await sql`update fulfillment_jobs set status='needs_review' where id=${job.id}`;
      throw new Error('Fulfillment delivery needs review');
    }
  }
}
