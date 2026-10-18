import {adminRole} from '../../../lib/admin';
import {NextRequest,NextResponse} from 'next/server';
import {ensureSchema,query} from '../../../lib/db';
import {RELEASE,checkoutBlocker,liveCommerceEnabled} from '../../../lib/launch';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(adminRole(req)!=='owner')return NextResponse.json({error:'Unauthorized'},{status:401});
 let database=false;let unresolvedOperations:number|null=null;
 try{
  await ensureSchema();database=true;
  unresolvedOperations=Number((await query(`select (select count(*) from fulfillment_attempts where state in ('unknown','submitting'))+(select count(*) from email_outbox where last_error='manual_review_required') as n`))[0].n);
 }catch{}
 const checks={database,siteUrl:/^https:\/\//.test(process.env.NEXT_PUBLIC_SITE_URL||''),supportEmail:Boolean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),adminSecret:Boolean(process.env.ADMIN_OWNER_SECRET||process.env.ADMIN_SECRET),cj:Boolean(process.env.CJ_API_KEY),stripe:Boolean(process.env.STRIPE_SECRET_KEY),stripeWebhook:Boolean(process.env.STRIPE_WEBHOOK_SECRET),cjDefaultLogistics:Boolean(process.env.CJ_DEFAULT_LOGISTICS),fulfillmentRecoverySecret:Boolean(process.env.FULFILLMENT_RECOVERY_SECRET),cronSecret:Boolean(process.env.CRON_SECRET),transactionalEmail:Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM),releaseVerified:process.env.LAUNCH_VERIFIED_RELEASE===RELEASE,liveCommerceEnabled:liveCommerceEnabled(),supplierEnabled:process.env.CJ_FULFILLMENT_ENABLED==='true',operationsClear:unresolvedOperations===0};
 const checkoutReady=database&&!checkoutBlocker();
 const publicLaunchReady=Object.values(checks).every(Boolean)&&/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY||'');
 return NextResponse.json({ok:publicLaunchReady,version:RELEASE,checkoutReady,publicLaunchReady,checks,unresolvedOperations,note:'Configuration checks and operator release attestation do not replace an end-to-end test.'},{status:publicLaunchReady?200:503,headers:{'Cache-Control':'no-store'}});
}
