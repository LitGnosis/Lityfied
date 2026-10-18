import {escapeHtml} from './html';
export function safeTrackingUrl(value:unknown){
 try{const url=new URL(String(value||''));return url.protocol==='https:'?url.href:''}catch{return ''}
}
export function shippingEmail(orderNumber:unknown,state:string,tracking:unknown,carrier:unknown,trackingUrl:unknown,siteUrl:unknown){
 const order=escapeHtml(orderNumber),number=escapeHtml(tracking),provider=escapeHtml(carrier);
 const link=safeTrackingUrl(trackingUrl),site=safeTrackingUrl(siteUrl);
 return state==='shipped'?`<h1>Your order is on the way</h1><p>Order <b>${order}</b> has shipped.</p>${number?`<p>Tracking: <b>${number}</b>${provider?` via ${provider}`:''}</p>`:''}${link?`<p><a href="${escapeHtml(link)}">Track your package</a></p>`:''}`:`<h1>Delivered</h1><p>Order <b>${order}</b> is marked delivered. We hope you love it.</p>${site?`<p><a href="${escapeHtml(site.replace(/\/$/,''))}/reviews">Leave a review</a></p>`:''}`;
}
