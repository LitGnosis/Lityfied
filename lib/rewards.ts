import crypto from 'crypto';
import {ensurePlatinumSchema,query,transaction} from './db';

export function referralCode(){return `LIT${crypto.randomBytes(5).toString('hex').toUpperCase()}`}

export async function ensureRewardsForUser(userId:number|string,referredByCode?:string){
  await ensurePlatinumSchema();
  let referrerId:null|number=null;
  if(referredByCode){const r=await query<any>('select user_id from user_rewards where upper(referral_code)=upper($1)',[referredByCode.trim()]);referrerId=r[0]?.user_id||null}
  for(let i=0;i<5;i++){
    try{
      await query(`insert into user_rewards(user_id,referral_code,referred_by_user_id) values($1,$2,$3) on conflict(user_id) do nothing`,[userId,referralCode(),referrerId]);
      break;
    }catch(e:any){if(!String(e?.message||'').includes('duplicate'))throw e}
  }
}

export async function awardOrderPoints(email:string,orderId:number,totalCents:number){
  return transaction(async()=>{
  await ensurePlatinumSchema();
  const users=await query<any>('select id from users where lower(email)=lower($1)',[email]);
  const userId=users[0]?.id;if(!userId)return;
  await ensureRewardsForUser(userId);
  await query('select user_id from user_rewards where user_id=$1 for update',[userId]);
  const points=Math.max(1,Math.floor(totalCents/100));
  const inserted=await query<any>(`insert into reward_ledger(user_id,order_id,kind,points_delta,note) values($1,$2,'purchase',$3,'Points earned from purchase') on conflict(user_id,order_id,kind) where order_id is not null do nothing returning id`,[userId,orderId,points]);
  if(!inserted.length)return;
  await query('update user_rewards set points_balance=points_balance+$1,updated_at=now() where user_id=$2',[points,userId]);
  const reward=(await query<any>('select referred_by_user_id from user_rewards where user_id=$1',[userId]))[0];
  if(reward?.referred_by_user_id){
    const hasPrior=(await query<any>(`select 1 from reward_ledger where user_id=$1 and kind='referral_welcome' limit 1`,[userId]))[0];
    if(!hasPrior){
      await query(`insert into reward_ledger(user_id,order_id,kind,points_delta,note) values($1,$2,'referral_welcome',100,'Referral welcome bonus') on conflict do nothing`,[userId,orderId]);
      await query('update user_rewards set points_balance=points_balance+100,updated_at=now() where user_id=$1',[userId]);
      await query(`insert into reward_ledger(user_id,order_id,kind,points_delta,note) values($1,$2,'referral_bonus',100,'Referral purchase bonus') on conflict do nothing`,[reward.referred_by_user_id,orderId]);
      await query('update user_rewards set points_balance=points_balance+100,updated_at=now() where user_id=$1',[reward.referred_by_user_id]);
    }
  }
  });
}
