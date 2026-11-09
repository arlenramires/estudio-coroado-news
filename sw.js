'use strict';
// Somente arquivos públicos do próprio estúdio: mídia importada pelo usuário nunca é armazenada.
const CACHE='estudio-coroado-offline-v45';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icons/studio.svg','./icons/studio-192.png','./icons/studio-512.png',
  ...Array.from({length:22},(_,i)=>'./molduras/original_'+String(i+1).padStart(2,'0')+'.webp')];
// Somente arquivos declarados do aplicativo podem entrar no cache.
// Requisições extras (incluindo parâmetros de URL) passam direto para a rede.
const OFFLINE_URLS=new Set(ASSETS.map(asset=>new URL(asset,self.registration.scope).href));
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    // Uma atualização incompleta não deve assumir o controle nem apagar o cache da versão anterior.
    // A rejeição da instalação mantém o service worker anterior ativo para uso offline.
    try{
      const cache=await caches.open(CACHE);
      // Validar cada resposta antes de confirmar o pré-cache: servidores podem
      // devolver uma página HTML de erro com status 200 no lugar de uma moldura.
      for(const asset of ASSETS){
        const url=new URL(asset,self.registration.scope).href;
        const response=await fetch(url,{cache:'no-store'});
        const type=(response.headers.get('content-type')||'').toLowerCase();
        const expected=asset.endsWith('.webp')?'image/webp':
          asset.endsWith('.png')?'image/png':
          asset.endsWith('.svg')?'image/svg+xml':
          asset.endsWith('.webmanifest')?'application/manifest+json':'text/html';
        const validType=expected==='application/manifest+json'
          ? /^application\/(?:manifest\+json|json)(?:\s*;|\s*$)/i.test(type)
          : new RegExp('^'+expected.replaceAll('+','\\+')+'(?:\\s*;|\\s*$)','i').test(type);
        if(!response.ok||response.status===206||response.type==='opaque'||
           response.type==='opaqueredirect'||response.url!==url||!validType){
          throw new Error('Recurso offline inválido: '+asset+' ('+response.status+', '+type+')');
        }
        await cache.put(url,response);
      }
    }catch(error){
      console.error('Instalação offline incompleta; mantendo a versão anterior',error);
      try{await caches.delete(CACHE)}catch(cleanupError){console.warn('Limpeza do cache incompleto falhou',cleanupError)}
      throw error;
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{try{for(const key of await caches.keys()){if(key.startsWith('estudio-coroado-offline-')&&key!==CACHE){try{await caches.delete(key)}catch(error){console.warn('Falha ao limpar cache antigo',error)}}}}catch(error){console.warn('Lista de caches indisponível',error)}await self.clients.claim()})());
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
      try{const response=await fetch(req);if(response.ok&&response.status!==206&&response.type==='basic'&&response.url===req.url&&(response.headers?.get?.('content-type')&&(req.url.includes('/molduras/')?response.headers.get('content-type').toLowerCase().startsWith('image/webp'):(req.url.endsWith('.webmanifest')?/^application\/(?:manifest\+json|json)(?:\s*;|\s*$)/i.test(response.headers.get('content-type')):response.headers.get('content-type').toLowerCase().startsWith(req.url.endsWith('.svg')?'image/svg+xml':req.url.endsWith('.png')?'image/png':'text/html'))))){try{if(cache)await cache.put(req,response.clone())}catch(error){console.warn('Cache indisponível; usando resposta da rede',error)}return response}return response}catch{return cached||(cache?await cache.match('./index.html').catch(()=>undefined):undefined)||Response.error()}
    }
    if(cached)return cached;
    try{const response=await fetch(req);if(response.ok&&response.status!==206&&response.type==='basic'&&response.url===req.url&&(response.headers?.get?.('content-type')&&(req.url.includes('/molduras/')?response.headers.get('content-type').toLowerCase().startsWith('image/webp'):(req.url.endsWith('.webmanifest')?/^application\/(?:manifest\+json|json)(?:\s*;|\s*$)/i.test(response.headers.get('content-type')):response.headers.get('content-type').toLowerCase().startsWith(req.url.endsWith('.svg')?'image/svg+xml':req.url.endsWith('.png')?'image/png':'text/html'))))){try{if(cache)await cache.put(req,response.clone())}catch(error){console.warn('Cache de recurso indisponível; usando resposta da rede',error)}}return response}catch{return Response.error()}
  })());
});
