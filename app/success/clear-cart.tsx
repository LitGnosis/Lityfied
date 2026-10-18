'use client';
import {useEffect} from 'react';
export default function ClearCart({enabled}:{enabled:boolean}){useEffect(()=>{if(enabled){try{localStorage.removeItem('lityfied-cart')}catch{}}},[enabled]);return null}
