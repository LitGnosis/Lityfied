import {cjRead} from './cj-read';
import {productImage} from './product-image';
const BASE='https://developers.cjdropshipping.com/api2.0/v1';
let cache:{token:string;expires:number}|null=null;

export function retailPrice(value:any){
  const n=parseFloat(String(value||0).split('--')[0]);
  if(!n)return 0;
  const m=Math.max(1.25,Math.min(4,Number(process.env.RETAIL_MARKUP_MULTIPLIER||2.2)||2.2));
  return Math.min(499.99,Math.max(4.99,Math.ceil(n*m)-.01));
}

let tokenPending: Promise<string> | null = null;
export async function cjToken(){
  if(cache&&cache.expires>Date.now())return cache.token;
  if(tokenPending)return tokenPending;
  tokenPending=loadToken();
  try{return await tokenPending}finally{tokenPending=null}
}
async function loadToken(){
  if(cache&&cache.expires>Date.now())return cache.token;
  const apiKey=process.env.CJ_API_KEY;
  if(!apiKey)throw new Error('CJ_API_KEY missing');
  const j=await cjRead(`${BASE}/authentication/getAccessToken`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey}),cache:'no-store'});
  if(!j?.result||!j?.data?.accessToken)throw new Error('CJ authentication failed');
  cache={token:j.data.accessToken,expires:Date.now()+20*60*60*1000};
  return cache.token;
}

export async function cjOrderDetailsBatch(orderIds:string[]){
  if(!orderIds.length)return [];
  const r=await fetch(`${BASE}/shopping/order/getOrderDetailBatch`,{method:'POST',headers:{'CJ-Access-Token':await cjToken(),'Content-Type':'application/json'},body:JSON.stringify({orderIds:orderIds.slice(0,100)}),cache:'no-store'});
  const j=await r.json();
  if(!r.ok||j?.result===false)throw new Error(j?.message||'CJ order sync failed');
  const data=j?.data;
  return Array.isArray(data)?data:Array.isArray(data?.list)?data.list:[];
}

export async function cjProductSnapshot(productId:string){
  const token=await cjToken();
  const [pr,vr]=await Promise.all([
    fetch(`${BASE}/product/query?pid=${encodeURIComponent(productId)}`,{headers:{'CJ-Access-Token':token},cache:'no-store'}),
    fetch(`${BASE}/product/variant/query?pid=${encodeURIComponent(productId)}`,{headers:{'CJ-Access-Token':token},cache:'no-store'})
  ]);
  const [pj,vj]=await Promise.all([pr.json(),vr.json()]);
  if(!pr.ok||pj?.result===false)throw new Error(pj?.message||'CJ product lookup failed');
  const p=pj?.data||{};
  const variants=Array.isArray(vj?.data)?vj.data:(vj?.data?.list||[]);
  const normalized=[] as any[];
  for(const v of variants.slice(0,25)){
    const vid=String(v?.vid||v?.id||'');
    if(!vid)continue;
    let stock=0;
    try{
      const sr=await fetch(`${BASE}/product/stock/queryByVid?vid=${encodeURIComponent(vid)}`,{headers:{'CJ-Access-Token':token},cache:'no-store'});
      const sj=await sr.json();
      const rows=Array.isArray(sj?.data)?sj.data:[];
      stock=rows.reduce((sum:number,x:any)=>sum+Math.max(0,Number(x?.totalInventoryNum||x?.storageNum||0)),0);
    }catch{}
    normalized.push({
      productId,
      variantId:vid,
      name:String(p.productNameEn||p.nameEn||p.productName||'Lityfied item'),
      category:String(p.categoryName||p.threeCategoryName||'Marketplace'),
      image:productImage(v?.variantImage||v?.image||p.productImage||p.bigImage||''),
      priceCents:Math.round(retailPrice(v?.variantSellPrice||v?.variantSugSellPrice||p.sellPrice)*100),
      available:stock>0,
      stock
    });
  }
  if(!normalized.length){
    normalized.push({productId,variantId:'',name:String(p.productNameEn||p.nameEn||p.productName||'Lityfied item'),category:String(p.categoryName||'Marketplace'),image:productImage(p.productImage||p.bigImage||''),priceCents:Math.round(retailPrice(p.sellPrice||p.nowPrice)*100),available:true,stock:null});
  }
  return normalized;
}
