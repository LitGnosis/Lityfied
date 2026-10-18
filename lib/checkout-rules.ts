export function normalizeItems(items:unknown){
 if(!Array.isArray(items)||items.length<1||items.length>50)throw new Error('Choose between 1 and 50 cart items.');
 const merged=new Map<string,{id:string;variantId:string;qty:number}>();
 for(const item of items){
  const id=String(item?.id||''),variantId=String(item?.variantId||''),qty=Number(item?.qty);
  if(!id||id.length>200||!variantId||variantId.length>200||!Number.isInteger(qty)||qty<1||qty>10)throw new Error('Choose a valid product option and quantity.');
  const key=JSON.stringify([id,variantId]);const total=qty+(merged.get(key)?.qty||0);
  if(total>10)throw new Error('Maximum quantity is 10 per option.');
  merged.set(key,{id,variantId,qty:total});
 }
 return [...merged.values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
export function promotionAmount(total:number,kind:string,value:number){
 if(!Number.isInteger(value)||value<=0)throw new Error('Invalid promotion.');
 return Math.min(total-1,['percent','percentage'].includes(kind)?Math.floor(total*Math.min(100,value)/100):value);
}
