import crypto from 'node:crypto';
import {ensureSchema,query,transaction} from './db';
import {setPassword} from './auth';
export async function resetPassword(token:string,password:string){
 if(token.length<32||token.length>256||password.length<10||password.length>1024)throw new Error('Invalid or expired reset request.');
 await ensureSchema();
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 await transaction(async()=>{
  // One reset token can commit at most once, including across server instances.
  const reset=(await query('select id,user_id from password_resets where token_hash=$1 and used_at is null and expires_at>now() for update',[hash]))[0];
  if(!reset)throw new Error('Invalid or expired reset request.');
  await setPassword(reset.user_id,password);
  await query('update password_resets set used_at=now() where user_id=$1 and used_at is null',[reset.user_id]);
  await query('delete from sessions where user_id=$1',[reset.user_id]);
 });
}
