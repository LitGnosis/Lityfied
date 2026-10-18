'use client';
import Link from 'next/link';
import {track} from '@vercel/analytics';
export function ProductCheckoutLink({product}:{product:string}){return <Link className="button" href={`/checkout?product=${encodeURIComponent(product)}`} onClick={()=>track('checkout_started',{product})}>BUY NOW</Link>}
