export type Product={slug:string;name:string;price:number;description:string;inventory:number;category:string;fulfillment?:'physical'|'digital'};
export const products:Product[]=[
{slug:'royal-chronograph',name:"Royal Men's Chronograph",price:6999,description:'A polished statement watch with a premium metallic finish.',inventory:18,category:"Men's"},
{slug:'violet-curve-dress',name:'Violet Curve Dress',price:4999,description:'A sleek purple evening silhouette with a luxe finish.',inventory:24,category:"Women's"},
{slug:'lityfied-earbuds',name:'Lityfied Wireless Earbuds',price:3999,description:'Compact wireless audio with a clean premium case.',inventory:31,category:'Tech'},
{slug:'royal-chain',name:'Royal Gold Chain',price:5999,description:'A bold gold-tone jewelry piece designed for everyday shine.',inventory:16,category:'Jewelry'},
{slug:'luminous-beauty-set',name:'Luminous Beauty Set',price:4499,description:'A curated beauty and accessories set for a polished finish.',inventory:20,category:'Beauty & Accessories'},
{slug:'platinum-weekender',name:'Platinum Weekender',price:7999,description:'A spacious travel bag with a refined luxury profile.',inventory:12,category:"Men's"}
];
export const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
