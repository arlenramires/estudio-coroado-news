'use strict';
// Somente arquivos públicos do próprio estúdio: mídia importada pelo usuário nunca é armazenada.
const CACHE='estudio-coroado-offline-v6';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icons/studio.svg','./icons/studio-192.png','./icons/studio-512.png',
  ...Array.from({length:22},(_,i)=>'./molduras/original_'+String(i+1).padStart(2,'0')+'.webp')];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await self.skipWaiting()})());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('estudio-coroado-offline-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin||req.headers.has('range'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(req,{ignoreSearch:true});
    // O HTML recebe correções quando conectado; as molduras imutáveis ficam disponíveis offline.
    if(req.mode==='navigate'||new URL(req.url).pathname.endsWith('/index.html')){
      try{const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response}catch{return cached||await cache.match('./index.html')||Response.error()}
    }
    if(cached)return cached;
    try{const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response}catch{return Response.error()}
  })());
});
