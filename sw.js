'use strict';
// Somente arquivos públicos do próprio estúdio: mídia importada pelo usuário nunca é armazenada.
const CACHE='estudio-coroado-offline-v37';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icons/studio.svg','./icons/studio-192.png','./icons/studio-512.png',
  ...Array.from({length:22},(_,i)=>'./molduras/original_'+String(i+1).padStart(2,'0')+'.webp')];
// Somente arquivos declarados do aplicativo podem entrar no cache.
// Requisições extras (incluindo parâmetros de URL) passam direto para a rede.
const OFFLINE_URLS=new Set(ASSETS.map(asset=>new URL(asset,self.registration.scope).href));
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{try{const cache=await caches.open(CACHE);await cache.addAll(ASSETS)}catch(error){console.warn('Pré-cache indisponível; aplicativo continua online',error);try{await caches.delete(CACHE)}catch(cleanupError){console.warn('Limpeza de cache indisponível',cleanupError)}}await self.skipWaiting()})());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('estudio-coroado-offline-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||req.headers.has('range')||!OFFLINE_URLS.has(req.url))return;
  event.respondWith((async()=>{
    // Se CacheStorage estiver bloqueado, a rede continua utilizável.
    let cache=null;
    try{cache=await caches.open(CACHE)}catch(error){console.warn('CacheStorage indisponível; usando rede',error)}
    const cached=cache?await cache.match(req,{ignoreSearch:true}).catch(()=>undefined):undefined;
    // O HTML recebe correções quando conectado; as molduras imutáveis ficam disponíveis offline.
    if(req.mode==='navigate'||new URL(req.url).pathname.endsWith('/index.html')){
      try{const response=await fetch(req);if(response.ok&&response.type==='basic'&&response.url===req.url){try{if(cache)await cache.put(req,response.clone())}catch(error){console.warn('Cache indisponível; usando resposta da rede',error)}return response}return cached||(cache?await cache.match('./index.html').catch(()=>undefined):undefined)||response}catch{return cached||(cache?await cache.match('./index.html').catch(()=>undefined):undefined)||Response.error()}
    }
    if(cached)return cached;
    try{const response=await fetch(req);if(response.ok&&response.type==='basic'&&response.url===req.url){try{if(cache)await cache.put(req,response.clone())}catch(error){console.warn('Cache de recurso indisponível; usando resposta da rede',error)}}return response}catch{return Response.error()}
  })());
});
