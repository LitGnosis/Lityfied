import {NextRequest,NextResponse} from 'next/server';
import {currentUser} from '../../../../../lib/auth';
import {db,ensurePlatinumSchema} from '../../../../../lib/db';
import {sameOrigin} from '../../../../../lib/security';
import {rateLimit,clientKey} from '../../../../../lib/rate-limit';

const POINTS_PER_DOLLAR=100;
const MIN_POINTS=500;

export async function POST(r:NextRequest){
  if(!sameOrigin(r))return NextResponse.json({error:'Invalid request origin.'},{status:403});
  if(!await rateLimit(`reward-redeem:${clientKey(r)}`,8,60*60*1000))return NextResponse.json({error:'Too many reward requests. Please try again later.'},{status:429});
  const u=await currentUser();if(!u)return NextResponse.json({error:'Unauthorized'},{status:401});
  try{
    const b=await r.json();const requested=Math.floor(Number(b.points||0));
    if(!Number.isFinite(requested)||requested<MIN_POINTS||requested%POINTS_PER_DOLLAR!==0)return NextResponse.json({error:`Redeem at least ${MIN_POINTS} points in ${POINTS_PER_DOLLAR}-point increments.`},{status:400});
    await ensurePlatinumSchema();const c=await db().connect();
    try{
      await c.query('begin');
      const row=(await c.query('select points_balance,store_credit_cents from user_rewards where user_id=$1 for update',[u.id])).rows[0];
      if(!row||Number(row.points_balance)<requested){await c.query('rollback');return NextResponse.json({error:'Not enough reward points.'},{status:409})}
      const creditCents=Math.floor(requested/POINTS_PER_DOLLAR)*100;
      await c.query('update user_rewards set points_balance=points_balance-$1,store_credit_cents=store_credit_cents+$2,updated_at=now() where user_id=$3',[requested,creditCents,u.id]);
      await c.query(`insert into reward_ledger(user_id,kind,points_delta,credit_cents_delta,note) values($1,'points_to_credit',$2,$3,$4)`,[u.id,-requested,creditCents,`${requested} points converted to store credit`]);
      await c.query('commit');
      return NextResponse.json({ok:true,pointsRedeemed:requested,creditCents});
    }catch(e){await c.query('rollback').catch(()=>{});throw e}finally{c.release()}
  }catch(e:any){return NextResponse.json({error:e?.message||'Unable to redeem rewards.'},{status:500})}
}
