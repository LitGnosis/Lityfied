const securityHeaders=[
 {key:'X-Content-Type-Options',value:'nosniff'},
 {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
 {key:'X-Frame-Options',value:'DENY'},
 {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=(self)'},
 {key:'Strict-Transport-Security',value:'max-age=63072000; includeSubDomains; preload'}
];
/** @type {import('next').NextConfig} */
const nextConfig={poweredByHeader:false,reactStrictMode:true,async redirects(){return [{source:"/signin",destination:"/account",permanent:false},{source:"/orders",destination:"/account#orders",permanent:false}]},async headers(){return[{source:'/api/:path*',headers:[...securityHeaders,{key:'Cache-Control',value:'no-store, max-age=0'}]},{source:'/:path*',headers:securityHeaders}]}};
export default nextConfig;
