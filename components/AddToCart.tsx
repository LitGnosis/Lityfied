'use client';
import {useCart} from './CartProvider';
export function AddToCart({slug}:{slug:string}){const{add}=useCart();return <button className="button secondary" type="button" onClick={()=>add(slug)}>ADD TO CART</button>}
