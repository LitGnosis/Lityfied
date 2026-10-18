'use client';
import {createContext,useContext,useEffect,useMemo,useState} from 'react';
export type CartLine={slug:string;quantity:number};
type Ctx={items:CartLine[];count:number;add:(slug:string)=>void;remove:(slug:string)=>void;setQty:(slug:string,q:number)=>void;clear:()=>void};
const CartContext=createContext<Ctx|null>(null);
export function CartProvider({children}:{children:React.ReactNode}){const[items,setItems]=useState<CartLine[]>([]);const[ready,setReady]=useState(false);useEffect(()=>{try{const raw=localStorage.getItem('lityfied-cart');if(raw)setItems(JSON.parse(raw))}catch{}setReady(true)},[]);useEffect(()=>{if(ready)localStorage.setItem('lityfied-cart',JSON.stringify(items))},[items,ready]);const value=useMemo<Ctx>(()=>({items,count:items.reduce((n,i)=>n+i.quantity,0),add:(slug)=>setItems(v=>{const hit=v.find(i=>i.slug===slug);return hit?v.map(i=>i.slug===slug?{...i,quantity:Math.min(10,i.quantity+1)}:i):[...v,{slug,quantity:1}]}),remove:(slug)=>setItems(v=>v.filter(i=>i.slug!==slug)),setQty:(slug,q)=>setItems(v=>q<1?v.filter(i=>i.slug!==slug):v.map(i=>i.slug===slug?{...i,quantity:Math.min(10,q)}:i)),clear:()=>setItems([])}),[items]);return <CartContext.Provider value={value}>{children}</CartContext.Provider>}
export function useCart(){const v=useContext(CartContext);if(!v)throw new Error('useCart must be used inside CartProvider');return v}
