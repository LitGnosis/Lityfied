export const RELEASE='5.3.1';
export function liveCommerceEnabled(env:Record<string,string|undefined>=process.env){
 return env.LIVE_COMMERCE_ENABLED==='true'&&env.LAUNCH_VERIFIED_RELEASE===RELEASE;
}
export function checkoutBlocker(env:Record<string,string|undefined>=process.env){
 if(!env.STRIPE_SECRET_KEY)return 'Checkout is not configured.';
 if(!env.DATABASE_URL||!env.STRIPE_WEBHOOK_SECRET||!env.CJ_API_KEY)return 'Checkout setup is incomplete.';
 if(!/^https:\/\//.test(env.NEXT_PUBLIC_SITE_URL||''))return 'Checkout site URL is not configured.';
 if(!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY)&&!liveCommerceEnabled(env))return 'Checkout is awaiting launch verification.';
 return null;
}
export function supplierEnabled(livemode:boolean,env:Record<string,string|undefined>=process.env){
 // Stripe test payments must never create real supplier orders.
 return livemode&&liveCommerceEnabled(env)&&env.CJ_FULFILLMENT_ENABLED==='true';
}
