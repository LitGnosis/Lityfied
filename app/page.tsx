'use client';

import { FormEvent, useEffect, useState } from 'react';

type Product = { id: number; name: string; price: number; description: string; color: string; category: string };
type CartItem = Product & { quantity: number };

const products: Product[] = [
  { id: 1, name: 'The Everyday Tote', price: 148, description: 'Structured carryall in soft, durable vegan leather.', color: 'sand', category: 'Accessories' },
  { id: 2, name: 'Cloud Knit Set', price: 128, description: 'A polished matching set designed for effortless days.', color: 'mist', category: 'Apparel' },
  { id: 3, name: 'Ribbed Glass Set', price: 64, description: 'Four hand-finished glasses for your daily ritual.', color: 'amber', category: 'Home' },
  { id: 4, name: 'Weekender Duffel', price: 188, description: 'A roomy, refined companion for short escapes.', color: 'ink', category: 'Accessories' },
];

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function Home() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('lityfied-cart');
    if (!saved) return;
    try { setCart(JSON.parse(saved)); } catch { window.localStorage.removeItem('lityfied-cart'); }
  }, []);
  useEffect(() => window.localStorage.setItem('lityfied-cart', JSON.stringify(cart)), [cart]);

  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const add = (product: Product) => {
    setCart(items => items.some(item => item.id === product.id)
      ? items.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...items, { ...product, quantity: 1 }]);
    setOpen(true);
  };
  const update = (id: number, quantity: number) => setCart(items => quantity < 1 ? items.filter(item => item.id !== id) : items.map(item => item.id === id ? { ...item, quantity } : item));
  const handleCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCart([]); setCheckout(false); setOpen(false); setComplete(true);
  };

  return <main>
    <header><a className="brand" href="#top">LITYFIED</a><nav><a href="#shop">Shop</a><a href="#about">Our story</a><button className="cart-button" onClick={() => setOpen(true)}>Bag {itemCount ? `(${itemCount})` : ''}</button></nav></header>
    <section className="hero" id="top"><div><p className="eyebrow">NEW SEASON, QUIETLY BOLD</p><h1>Essentials that elevate the everyday.</h1><p className="lede">Thoughtfully selected pieces made for the way you live now.</p><a className="button" href="#shop">Shop the collection</a></div><div className="hero-art" aria-label="Abstract fashion composition" /></section>
    <section className="collection" id="shop"><div className="section-head"><p className="eyebrow">CURATED FOR YOU</p><h2>Modern favorites</h2></div><div className="grid">{products.map(product => <article className="product" key={product.id}><div className={`product-art ${product.color}`}><span>{product.category}</span></div><div className="product-copy"><div><h3>{product.name}</h3><p>{product.description}</p></div><div className="product-bottom"><strong>{currency.format(product.price)}</strong><button onClick={() => add(product)}>Add to bag</button></div></div></article>)}</div></section>
    <section className="story" id="about"><p className="eyebrow">THE LITYFIED STANDARD</p><h2>Less noise. Better things.</h2><p>We seek out everyday objects with considered materials, effortless function, and a point of view that lasts beyond the season.</p></section>
    <footer><span>LITYFIED</span><span>Curated essentials, delivered with care.</span></footer>

    {open && <aside className="drawer" aria-label="Shopping bag"><div className="drawer-head"><h2>{checkout ? 'Checkout' : 'Your bag'}</h2><button onClick={() => { setOpen(false); setCheckout(false); }}>Close</button></div>{checkout ? <form className="checkout" onSubmit={handleCheckout}><label>Email<input required type="email" placeholder="you@example.com" /></label><label>Full name<input required placeholder="Your name" /></label><label>Shipping address<input required placeholder="Street address" /></label><label>City<input required placeholder="City" /></label><button className="button" type="submit">Place order · {currency.format(subtotal)}</button><p className="note">Demo checkout — connect a payment provider before accepting live orders.</p></form> : <><div className="cart-items">{cart.length ? cart.map(item => <div className="cart-item" key={item.id}><div className={`thumb ${item.color}`} /><div><h3>{item.name}</h3><p>{currency.format(item.price)}</p><div className="quantity"><button aria-label="Decrease quantity" onClick={() => update(item.id, item.quantity - 1)}>−</button><span>{item.quantity}</span><button aria-label="Increase quantity" onClick={() => update(item.id, item.quantity + 1)}>+</button></div></div><strong>{currency.format(item.price * item.quantity)}</strong></div>) : <p className="empty">Your bag is ready when you are.</p>}</div><div className="summary"><div><span>Subtotal</span><strong>{currency.format(subtotal)}</strong></div><p>Shipping and taxes are calculated at checkout.</p><button className="button" disabled={!cart.length} onClick={() => setCheckout(true)}>Checkout</button></div></>}</aside>}
    {complete && <div className="modal"><div><button className="close-modal" onClick={() => setComplete(false)}>×</button><p className="eyebrow">ORDER CONFIRMED</p><h2>Thank you.</h2><p>Your order has been recorded. Add a payment provider to accept production payments.</p><button className="button" onClick={() => setComplete(false)}>Continue shopping</button></div></div>}
  </main>;
}
