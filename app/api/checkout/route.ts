import {productImage} from '../../../lib/product-image';
import {NextRequest,NextResponse} from 'next/server';
import Stripe from 'stripe';
import {createHash,randomUUID} from 'node:crypto';
import {ensurePlatinumSchema,query,transaction} from '../../../lib/db';
import {sameOrigin} from '../../../lib/security';
import {currentUser} from '../../../lib/auth';
import {rateLimit,clientKey} from '../../../lib/rate-limit';
import {cjToken,retailPrice} from '../../../lib/cj';
import {checkoutBlocker} from '../../../lib/launch';
import {normalizeItems,promotionAmount} from '../../../lib/checkout-rules';
const BASE='https://developers.cjdropshipping.com/api2.0/v1';
async function resolve(id:string,variantId:string,qty:number){
 const token=await cjToken();
 const get=async(path:string)=>{
  const response=await fetch(`${BASE}${path}`,{headers:{'CJ-Access-Token':token},cache:'no-store',signal:AbortSignal.timeout(12000)});
  const json=await response.json();if(!response.ok||json.result!==true)throw new Error('Supplier availability could not be verified. Please try again.');return json.data;
 };
 const [product,variant,stock]=await Promise.all([
  get(`/product/query?pid=${encodeURIComponent(id)}`),
  get(`/product/variant/queryByVid?vid=${encodeURIComponent(variantId)}`),
  get(`/product/stock/queryByVid?vid=${encodeURIComponent(variantId)}`)
 ]);
 if(String(variant?.pid)!==id||String(variant?.vid)!==variantId)throw new Error('The selected product option is unavailable.');
 const available=(Array.isArray(stock)?stock:[]).filter((x:any)=>x.countryCode===(process.env.CJ_DEFAULT_FROM_COUNTRY||'CN')).reduce((n:number,x:any)=>n+Math.max(0,Number(x.totalInventoryNum??x.storageNum??0)||0),0);
 if(available<qty)throw new Error('The selected product option is out of stock or has insufficient inventory.');
 const amount=Math.round(retailPrice(variant.variantSellPrice||variant.variantSugSellPrice||product.sellPrice)*100);
 if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('Product pricing is unavailable.');
 return {id,variantId,qty,amount,name:String(product.productNameEn||product.nameEn||product.productName||'Lityfied item'),image:productImage(variant.variantImage||product.productImage||''),sku:String(variant.variantSku||'')};
}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({error:'Invalid request origin.'},{status:403});
 const blocker=checkoutBlocker();if(blocker)return NextResponse.json({error:blocker},{status:503});
 try{
  if(!await rateLimit(`checkout:${clientKey(req)}`,12,60000,true))return NextResponse.json({error:'Too many checkout attempts. Please wait a minute and try again.'},{status:429,headers:{'Retry-After':'60'}});
 }catch{
  console.error('LITYFIED_CHECKOUT_LIMITER_UNAVAILABLE');
  return NextResponse.json({error:'Checkout is temporarily unavailable. Please try again shortly.'},{status:503,headers:{'Retry-After':'60'}});
 }
 try{
  await ensurePlatinumSchema();
  const body=await req.json();if(body.termsAccepted!==true)return NextResponse.json({error:'Accept the Terms and Return Policy before checkout.'},{status:400});
  const items=normalizeItems(body.items),user=await currentUser();
  const useStoreCredit=body.useStoreCredit===true,promotionCode=String(body.promotionCode||'').trim().toUpperCase().slice(0,80);
  if(useStoreCredit&&!user)return NextResponse.json({error:'Sign in to use store credit.'},{status:401});
  const attempt=req.headers.get('x-checkout-attempt')||randomUUID();
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(attempt))return NextResponse.json({error:'Invalid checkout attempt.'},{status:400});
  const fingerprint=createHash('sha256').update(JSON.stringify({items,user:user?.id||null,useStoreCredit,promotionCode})).digest('hex');
  await query('insert into checkout_attempts(id,fingerprint) values($1,$2) on conflict do nothing',[attempt,fingerprint]);
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY!,{timeout:12000,maxNetworkRetries:1});
  const result=await transaction(async()=>{
   const record=(await query('select * from checkout_attempts where id=$1 for update',[attempt]))[0];
   if(record.fingerprint!==fingerprint)throw new Error('This checkout attempt was already used for a different cart.');
   if(record.response_json){
    const existing=await stripe.checkout.sessions.retrieve(record.stripe_session_id);
    if(existing.status!=='open')throw new Error('This checkout has ended. Start a new checkout.');
    return record.response_json;
   }
   const rows=await Promise.all(items.map(x=>resolve(x.id,x.variantId,x.qty)));
   const total=rows.reduce((n,x)=>n+x.amount*x.qty,0);if(total<1||total>1000000)throw new Error('Cart total exceeds online checkout limits.');
   let promoDiscount=0,credit=0;
   if(promotionCode){
    const promotion=(await query(`select * from promotions where upper(code)=$1 and active=true and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) for update`,[promotionCode]))[0];
    if(!promotion||total<Number(promotion.min_cents||0))throw new Error('That promotion is not valid for this cart.');
    // Unreleased reservations remain held until Stripe confirms checkout expiry.
    const held=(await query("select count(*)::int n from promotion_reservations where upper(code)=$1 and status='reserved'",[promotionCode]))[0].n;
    if(promotion.max_uses!==null&&promotion.uses+held>=promotion.max_uses)throw new Error('This promotion has reached its redemption limit.');
    promoDiscount=promotionAmount(total,promotion.kind,Number(promotion.value));
   }
   if(useStoreCredit){
    const reward=(await query('select store_credit_cents from user_rewards where user_id=$1 for update',[user.id]))[0];
    const held=(await query("select coalesce(sum(amount_cents),0)::int n from store_credit_reservations where user_id=$1 and status='reserved'",[user.id]))[0].n;
    credit=Math.min(Math.max(0,Number(reward?.store_credit_cents||0)-held),total-promoDiscount-1);
   }
   const discount=promoDiscount+credit;
   let coupon:string|undefined;
   if(discount){coupon=(await stripe.coupons.create({duration:'once',amount_off:discount,currency:'usd',name:'Lityfied discount'},{idempotencyKey:`coupon-${attempt}`})).id;}
   const origin=process.env.NEXT_PUBLIC_SITE_URL!.replace(/\/$/,'');
   const expires=Math.floor(new Date(record.created_at).getTime()/1000)+3600;
   if(expires<Date.now()/1000+1800)throw new Error('Checkout attempt expired. Start a new checkout.');
   const session=await stripe.checkout.sessions.create({
    mode:'payment',customer_creation:'always',...(user?{customer_email:user.email}:{}),
    line_items:rows.map(x=>({quantity:x.qty,price_data:{currency:'usd',unit_amount:x.amount,product_data:{name:x.name,...(x.image.startsWith('https://')?{images:[x.image]}:{}),metadata:{provider:'cj',product_id:x.id,variant_id:x.variantId,sku:x.sku}}}})),
    success_url:`${origin}/success?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/?checkout=cancelled`,
    ...(coupon?{discounts:[{coupon}]}:{}),expires_at:expires,
    phone_number_collection:{enabled:true},shipping_address_collection:{allowed_countries:['US']},
    shipping_options:[{shipping_rate_data:{type:'fixed_amount',fixed_amount:{amount:0,currency:'usd'},display_name:'Standard shipping',delivery_estimate:{minimum:{unit:'business_day',value:5},maximum:{unit:'business_day',value:15}}}}],
    metadata:{storefront:'lityfied',checkout_attempt:attempt,fulfillment_state:'paid_pending_supplier',promotion_code:promotionCode,store_credit_cents:String(credit),user_id:String(user?.id||''),terms_accepted:'true'},
    ...(process.env.STRIPE_AUTOMATIC_TAX==='true'?{automatic_tax:{enabled:true}}:{})
   },{idempotencyKey:`checkout-${attempt}`});
   if(credit)await query('insert into store_credit_reservations(user_id,amount_cents,stripe_session_id,expires_at) values($1,$2,$3,to_timestamp($4))',[user.id,credit,session.id,session.expires_at]);
   if(promotionCode)await query('insert into promotion_reservations(stripe_session_id,code,expires_at) values($1,$2,to_timestamp($3))',[session.id,promotionCode,session.expires_at]);
   const response={url:session.url,sessionId:session.id,discountCents:discount,promotionDiscountCents:promoDiscount,storeCreditCents:credit};
   await query('update checkout_attempts set stripe_session_id=$1,response_json=$2 where id=$3',[session.id,JSON.stringify(response),attempt]);
   return response;
  });
  return NextResponse.json(result);
 }catch(e:any){console.error('LITYFIED_CHECKOUT_ERROR',e?.message);return NextResponse.json({error:e?.type==='StripeInvalidRequestError'?'Checkout could not be created. Please try again.':e?.message||'Checkout unavailable.'},{status:400});}
}
