'use strict';
// Somente arquivos públicos do próprio estúdio: mídia importada pelo usuário nunca é armazenada.
const CACHE='estudio-coroado-offline-v49';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icons/studio.svg','./icons/studio-192.png','./icons/studio-512.png',
  ...Array.from({length:22},(_,i)=>'./molduras/original_'+String(i+1).padStart(2,'0')+'.webp')];
// Somente arquivos declarados do aplicativo podem entrar no cache.
// Requisições extras (incluindo parâmetros de URL) passam direto para a rede.
const OFFLINE_URLS=new Set(ASSETS.map(asset=>new URL(asset,self.registration.scope).href));
// Uma página de erro pode responder HTTP 200 e text/html. Exigir marcas do editor.
async function isEditorHtml(response){
  if(typeof response.clone!=='function')return false;
  const copy=response.clone();
  if(typeof copy.text!=='function')return false; // Sem conteúdo verificável, não aceitar HTML como editor.
  const html=await copy.text();
  const withoutComments=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'').replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi,'').replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea\s*>/gi,'').replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi,'');
  return /<title>Estúdio Coroado News 24H(?:<|\s)/.test(withoutComments)&&
    /<[^>]+\bid=["']editorial["'][^>]*>/.test(withoutComments)&&
    /<[^>]+\bid=["']savePNG["'][^>]*>/.test(withoutComments);
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    // Uma atualização incompleta não deve assumir o controle nem apagar o cache da versão anterior.
    // A rejeição da instalação mantém o service worker anterior ativo para uso offline.
    let cacheExisted=false;
    try{
      // Nunca excluir um cache já existente ao falhar uma nova instalação.
      cacheExisted=(await caches.keys()).includes(CACHE);
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
        if(response.status!==200||response.type==='opaque'||
           response.type==='opaqueredirect'||response.redirected===true||response.url!==url||!validType){
          throw new Error('Recurso offline inválido: '+asset+' ('+response.status+', '+type+')');
        }
        if((asset==='./'||asset==='./index.html')&&!(await isEditorHtml(response)))throw new Error('HTML offline não contém o editor: '+asset);
        // Se este nome de cache já existia, não sobrescrever seus recursos durante
        // uma tentativa de instalação: uma falha posterior deve preservar a versão utilizável.
        const previous=cacheExisted?await cache.match(url):undefined;
        // Um cache pré-existente com resposta de erro/opaca não pode ser tratado como instalação válida.
        // Rejeitar a atualização sem sobrescrever o conteúdo antigo preserva a atomicidade.
        if(previous&&(previous.status!==200||previous.type!=='basic')){
          throw new Error('Recurso offline já armazenado é inválido: '+asset);
        }
        if(!previous)await cache.put(url,response);
      }
    }catch(error){
      console.error('Instalação offline incompleta; mantendo a versão anterior',error);
      try{if(!cacheExisted)await caches.delete(CACHE)}catch(cleanupError){console.warn('Limpeza do cache incompleto falhou',cleanupError)}
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
      try{const response=await fetch(req);if(response.status!==200)return response;if(response.status===200&&response.type==='basic'&&response.redirected!==true&&response.url===req.url&&(response.headers?.get?.('content-type')&&(req.url.includes('/molduras/')?/^image\/webp(?:\s*;|\s*$)/i.test(response.headers.get('content-type')):(req.url.endsWith('.webmanifest')?/^application\/(?:manifest\+json|json)(?:\s*;|\s*$)/i.test(response.headers.get('content-type')):/^(?:image\/svg\+xml|image\/png|text\/html)(?:\s*;|\s*$)/i.test(response.headers.get('content-type'))&&new RegExp('^'+(req.url.endsWith('.svg')?'image/svg\\+xml':req.url.endsWith('.png')?'image/png':'text/html')+'(?:\\s*;|\\s*$)','i').test(response.headers.get('content-type')))))){if(!(await isEditorHtml(response)))return cached||(cache?await cache.match('./index.html').catch(()=>undefined):undefined)||Response.error();try{if(cache)await cache.put(req,response.clone())}catch(error){console.warn('Cache indisponível; usando resposta da rede',error)}return response}return cached||(cache?await cache.match('./index.html').catch(()=>undefined):undefined)||Response.error()}catch{return cached||(cache?await cache.match('./index.html').catch(()=>undefined):undefined)||Response.error()}
    }
    if(cached)return cached;
    try{const response=await fetch(req);if(response.status===200&&response.type==='basic'&&response.redirected!==true&&response.url===req.url&&(response.headers?.get?.('content-type')&&(req.url.includes('/molduras/')?/^image\/webp(?:\s*;|\s*$)/i.test(response.headers.get('content-type')):(req.url.endsWith('.webmanifest')?/^application\/(?:manifest\+json|json)(?:\s*;|\s*$)/i.test(response.headers.get('content-type')):/^(?:image\/svg\+xml|image\/png|text\/html)(?:\s*;|\s*$)/i.test(response.headers.get('content-type'))&&new RegExp('^'+(req.url.endsWith('.svg')?'image/svg\\+xml':req.url.endsWith('.png')?'image/png':'text/html')+'(?:\\s*;|\\s*$)','i').test(response.headers.get('content-type')))))){try{if(cache)await cache.put(req,response.clone())}catch(error){console.warn('Cache de recurso indisponível; usando resposta da rede',error)}return response}return response}catch{return Response.error()}
  })());
});
