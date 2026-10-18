import {NextRequest,NextResponse} from 'next/server';
import {adminRole,roleAllows} from '../../../../lib/admin';
import {ensurePlatinumSchema,query,transaction} from '../../../../lib/db';
import {escapeHtml} from '../../../../lib/html';
import {refundReturn} from '../../../../lib/refunds';

function queueEmail(dedupe:string,recipient:string,subject:string,html:string){
 return query(`insert into email_outbox(dedupe_key,recipient,subject,html) values($1,$2,$3,$4) on conflict(dedupe_key) do nothing`,[dedupe,recipient,subject,html]);
}

export async function POST(r:NextRequest){
 const role=adminRole(r);if(!role)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  await ensurePlatinumSchema();const b=await r.json();const action=String(b.action||''),id=Number(b.id||0);
  if(action==='promotion_create'){
   if(!roleAllows(role,['owner','marketing']))return NextResponse.json({error:'Forbidden'},{status:403});
   const code=String(b.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,40),kind=String(b.kind||'percent').toLowerCase(),value=Number(b.value||0),minCents=Math.max(0,Number(b.minCents||0)),maxUses=b.maxUses?Math.max(1,Number(b.maxUses)):null;
   if(code.length<3||!['percent','percentage','fixed'].includes(kind)||value<=0)return NextResponse.json({error:'Invalid promotion'},{status:400});
   const normalizedKind=kind==='percentage'?'percent':kind,normalizedValue=kind==='fixed'?Math.max(1,Math.round(value)):Math.min(100,Math.round(value));
   const row=await query<any>(`insert into promotions(code,kind,value,min_cents,max_uses,active,starts_at,ends_at) values($1,$2,$3,$4,$5,true,coalesce($6::timestamptz,now()),$7::timestamptz) on conflict(code) do update set kind=excluded.kind,value=excluded.value,min_cents=excluded.min_cents,max_uses=excluded.max_uses,active=true,starts_at=excluded.starts_at,ends_at=excluded.ends_at returning *`,[code,normalizedKind,normalizedValue,minCents,maxUses,b.startsAt||null,b.endsAt||null]);
   return NextResponse.json({ok:true,promotion:row[0]});
  }
  if(!id)return NextResponse.json({error:'Missing record id'},{status:400});
  if(action==='review_approve'||action==='review_reject'){
   if(!roleAllows(role,['owner','support','marketing']))return NextResponse.json({error:'Forbidden'},{status:403});
   await query('update reviews set status=$1 where id=$2',[action==='review_approve'?'approved':'rejected',id]);return NextResponse.json({ok:true});
  }
  if(action==='question_answer'){
   if(!roleAllows(role,['owner','support','marketing']))return NextResponse.json({error:'Forbidden'},{status:403});
   const answer=String(b.answer||'').trim().slice(0,3000);if(answer.length<2)return NextResponse.json({error:'Answer is required'},{status:400});
   await transaction(async()=>{const q=(await query<any>("update product_questions set answer=$1,status='answered',answered_at=now() where id=$2 returning email,question",[answer,id]))[0];if(q)await queueEmail(`question-answer-${id}`,q.email,'Your Lityfied product question was answered',`<h1>We answered your question</h1><p><b>Q:</b> ${escapeHtml(q.question)}</p><p><b>A:</b> ${escapeHtml(answer)}</p>`)});
   return NextResponse.json({ok:true});
  }
  if(action==='reward_adjust'){
   if(!roleAllows(role,['owner']))return NextResponse.json({error:'Forbidden'},{status:403});
   const points=Math.max(-100000,Math.min(100000,Math.trunc(Number(b.points||0)))),credit=Math.max(-10000000,Math.min(10000000,Math.trunc(Number(b.creditCents||0))));
   const row=(await query<any>('select user_id from user_rewards where user_id=$1',[id]))[0];if(!row)return NextResponse.json({error:'Member rewards not found'},{status:404});
   await transaction(async()=>{await query('select user_id from user_rewards where user_id=$1 for update',[id]);await query('update user_rewards set points_balance=greatest(0,points_balance+$1),store_credit_cents=greatest(0,store_credit_cents+$2),updated_at=now() where user_id=$3',[points,credit,id]);await query(`insert into reward_ledger(user_id,kind,points_delta,credit_cents_delta,note) values($1,'admin_adjustment',$2,$3,$4)`,[id,points,credit,String(b.note||'Admin adjustment').slice(0,300)])});
   return NextResponse.json({ok:true});
  }
  if(action==='ticket_reply'){
   if(!roleAllows(role,['owner','support','operations']))return NextResponse.json({error:'Forbidden'},{status:403});
   const message=String(b.message||'').trim().slice(0,3000);if(message.length<2)return NextResponse.json({error:'Reply is required'},{status:400});
   await transaction(async()=>{const t=(await query<any>('select id,email from support_tickets where id=$1 for update',[id]))[0];if(!t)throw new Error('Ticket not found');const m=(await query<any>(`insert into support_messages(ticket_id,sender,message) values($1,'staff',$2) returning id`,[id,message]))[0];await query("update support_tickets set status='open',updated_at=now() where id=$1",[id]);await queueEmail(`ticket-reply-${m.id}`,t.email,`Reply to Lityfied support case #${id}`,`<h1>Support replied</h1><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(process.env.NEXT_PUBLIC_SITE_URL||'')}/account">View your support case</a></p>`)});
   return NextResponse.json({ok:true});
  }
  if(action==='ticket_close'){
   if(!roleAllows(role,['owner','support','operations']))return NextResponse.json({error:'Forbidden'},{status:403});
   await transaction(async()=>{const t=(await query<any>("update support_tickets set status='closed',updated_at=now() where id=$1 returning email,order_number",[id]))[0];if(t)await queueEmail(`ticket-close-${id}`,t.email,`Lityfied support case #${id} resolved`,`<h1>Your support case is marked resolved</h1>${t.order_number?`<p>Order: <b>${escapeHtml(t.order_number)}</b></p>`:''}<p>If you still need help, open a new message through Lityfied support.</p>`)});
   return NextResponse.json({ok:true});
  }
  if(action==='return_approve'||action==='return_reject'||action==='return_close'){
   if(!roleAllows(role,['owner','operations','support']))return NextResponse.json({error:'Forbidden'},{status:403});
   const status=action==='return_approve'?'approved':action==='return_reject'?'rejected':'closed';
   await transaction(async()=>{const ret=(await query<any>(`update returns r set status=$1,updated_at=now() from orders o where r.id=$2 and o.id=r.order_id returning r.email,o.order_number`,[status,id]))[0];if(ret)await queueEmail(`return-status-${id}-${status}`,ret.email,`Return ${status}: ${ret.order_number}`,`<h1>Return update</h1><p>Your return for order <b>${escapeHtml(ret.order_number)}</b> is now <b>${escapeHtml(status)}</b>.</p>`)});
   return NextResponse.json({ok:true});
  }
  if(action==='refund'){
   if(!roleAllows(role,['owner','operations']))return NextResponse.json({error:'Forbidden'},{status:403});
   if(!process.env.STRIPE_SECRET_KEY)return NextResponse.json({error:'Stripe not configured'},{status:503});
   return NextResponse.json(await refundReturn(id,b.amountCents));
  }
  if(action==='promotion_deactivate'){if(!roleAllows(role,['owner','marketing']))return NextResponse.json({error:'Forbidden'},{status:403});await query('update promotions set active=false where id=$1',[id]);return NextResponse.json({ok:true});}
  return NextResponse.json({error:'Unknown action'},{status:400});
 }catch(e:any){return NextResponse.json({error:e.message||'Action failed'},{status:500})}
}
