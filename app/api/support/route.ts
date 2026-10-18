import {NextRequest,NextResponse} from 'next/server';
import {ensurePlatinumSchema,query,transaction} from '../../../lib/db';
import {sameOrigin} from '../../../lib/security';
import {rateLimit,clientKey} from '../../../lib/rate-limit';
import {currentUser} from '../../../lib/auth';
import {escapeHtml} from '../../../lib/html';
export const dynamic='force-dynamic';
export async function GET(){
  const u=await currentUser();if(!u)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!u.email_verified)return NextResponse.json({error:'Verify your email to view support cases.'},{status:403});
  try{await ensurePlatinumSchema();const tickets=await query<any>(`select id,order_number,category,message,status,created_at,updated_at from support_tickets where lower(email)=lower($1) order by updated_at desc limit 50`,[u.email]);
  const ids=tickets.map((x:any)=>x.id);const messages=ids.length?await query<any>(`select id,ticket_id,sender,message,created_at from support_messages where ticket_id=any($1::bigint[]) order by created_at asc`,[ids]):[];
  return NextResponse.json({tickets:tickets.map((t:any)=>({...t,messages:messages.filter((m:any)=>String(m.ticket_id)===String(t.id))}))});}catch(e:any){return NextResponse.json({error:e.message||'Unable to load support cases'},{status:503})}
}
export async function POST(r:NextRequest){
  if(!sameOrigin(r))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  if(!await rateLimit(`support:${clientKey(r)}`,10,10*60*1000))return NextResponse.json({error:'Too many support requests. Please try again later.'},{status:429});
  try{
    await ensurePlatinumSchema();const b=await r.json();const u=await currentUser().catch(()=>null);
    const email=String(u?.email||b.email||'').trim().toLowerCase().slice(0,320),message=String(b.message||'').trim().slice(0,3000);
    if(!/^\S+@\S+\.\S+$/.test(email)||message.length<5)return NextResponse.json({error:'A valid email and message are required.'},{status:400});
    const ticketId=Number(b.ticketId||0);
    if(ticketId){if(!u)return NextResponse.json({error:'Sign in to reply to a support case.'},{status:401});if(!u.email_verified)return NextResponse.json({error:'Verify your email to reply to support cases.'},{status:403});const ticket=(await query<any>('select id,status from support_tickets where id=$1 and lower(email)=lower($2)',[ticketId,u.email]))[0];if(!ticket)return NextResponse.json({error:'Support case not found.'},{status:404});await query(`insert into support_messages(ticket_id,sender,message) values($1,'customer',$2)`,[ticketId,message]);await query("update support_tickets set status='open',updated_at=now() where id=$1",[ticketId]);return NextResponse.json({ok:true,ticketId});}
    const orderNumber=String(b.orderNumber||'').trim().slice(0,120)||null,category=String(b.category||'general').trim().slice(0,80);
    if(orderNumber){const match=(await query<any>('select 1 from orders where order_number=$1 and lower(customer_email)=lower($2)',[orderNumber,email]))[0];if(!match)return NextResponse.json({error:'That order number does not match this email.'},{status:400})}
    const x=await transaction(async()=>{
      const rows=await query<any>('insert into support_tickets(email,order_number,category,message) values($1,$2,$3,$4) returning id,status',[email,orderNumber,category,message]);
      await query(`insert into support_messages(ticket_id,sender,message) values($1,'customer',$2)`,[rows[0].id,message]);
      await query(`insert into email_outbox(dedupe_key,recipient,subject,html) values($1,$2,$3,$4) on conflict(dedupe_key) do nothing`,[`support-case-${rows[0].id}`,email,`Lityfied support case #${rows[0].id}`,`<h1>We received your message</h1><p>Your support case is <b>#${rows[0].id}</b>.</p>${orderNumber?`<p>Order: <b>${escapeHtml(orderNumber)}</b></p>`:''}<p>You can view and reply from your Lityfied account.</p>`]);
      return rows;
    });
    return NextResponse.json({ticket:x[0]});
  }catch(e:any){return NextResponse.json({error:e.message||'Unable to create ticket'},{status:500})}
}
