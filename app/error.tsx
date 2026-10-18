'use client';
export default function Error({reset}:{error:Error&{digest?:string};reset:()=>void}){return <main className="policy"><h1>Something went wrong</h1><p>We couldn’t load this part of Lityfied. Your cart is stored on this device.</p><button onClick={()=>reset()}>Try again</button> <a href="/">Return to shop</a></main>}
