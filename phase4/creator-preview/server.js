'use strict';
const http=require('node:http'),fs=require('node:fs');
const page=fs.readFileSync(__dirname+'/index.html','utf8');
http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,service:'Lityfied Railway continuity creator preview',paidRender:false}))}
  if(req.url!=='/'){res.writeHead(404);return res.end('Not found')}
  const api=process.env.PREVIEW_API_BASE_URL||'';
  if(!api.startsWith('https://')){res.writeHead(503);return res.end('Railway API connection not configured')}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ${api}; object-src 'none'; frame-ancestors 'none'`});
  return res.end(page.replace('__API_BASE__',api));
}).listen(Number(process.env.PORT||8080),'0.0.0.0');
