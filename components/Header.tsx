'use client';
import Link from 'next/link';import {useCart} from './CartProvider';
export function Header(){const{count}=useCart();return <header className="top"><Link className="brand" href="/"><img src="/lityfied-emblem.png" alt=""/><span>LITYFIED</span></Link><nav><Link href="/products">Shop</Link><Link href="/products">Categories</Link><Link href="/cart">Cart ({count})</Link></nav></header>}
