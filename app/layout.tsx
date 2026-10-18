import './globals.css';
import type {Metadata} from 'next';
import {Analytics} from '@vercel/analytics/next';
import {SpeedInsights} from '@vercel/speed-insights/next';
import PwaRegister from './pwa-register';
export const metadata:Metadata={metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL||'https://lityfied.vercel.app'),title:{default:'Lityfied — Platinum Royal Marketplace',template:'%s | Lityfied'},description:'Curated fashion, tech, home, beauty, accessories and gifts. Get Lit. Get Satisfied. Get Lityfied.',applicationName:'Lityfied',robots:{index:true,follow:true},icons:{icon:'/icon.svg'},openGraph:{type:'website',siteName:'Lityfied',title:'Lityfied — Platinum Royal Marketplace',description:'Find your vibe. Stay Lityfied.'},twitter:{card:'summary_large_image',title:'Lityfied — Platinum Royal Marketplace',description:'Find your vibe. Stay Lityfied.'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<PwaRegister/><Analytics/><SpeedInsights/></body></html>}
