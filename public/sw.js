const CACHE='lityfied-public-v3';
const SHELL=['/','/shipping','/returns','/privacy','/terms'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}))});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))]))});
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);
 // Cache only public pages with no query tokens. Never cache account/admin/order/API responses.
 if(url.origin!==self.location.origin||!SHELL.includes(url.pathname)||url.search)return;
 if(request.mode==='navigate')event.respondWith(fetch(request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy)).catch(()=>{})}return response;
 }).catch(()=>caches.match(request).then(response=>response||Response.error())));
});
