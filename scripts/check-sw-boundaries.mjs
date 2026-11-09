// Regressões de privacidade do PWA: nenhum upload, URL externa ou requisição
// de vídeo parcial deve ser interceptada ou persistida no cache do Estúdio.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('sw.js','utf8');
const handlers=new Map();
const calls=[];
const scope='http://127.0.0.1:8765/';
const self={
  registration:{scope},
  addEventListener:(name,handler)=>handlers.set(name,handler)
};
const caches={
  open:async()=>{calls.push('cache.open');return {
    match:async()=>undefined,
    put:async()=>{calls.push('cache.put')}
  }}
};
const context=vm.createContext({self,caches,URL,console,fetch:async()=>{calls.push('fetch');return {ok:true,type:'basic',url:scope+'index.html',clone(){return this}}},Response:{error:()=>({ok:false})}});
new vm.Script(source,{filename:'sw.js'}).runInContext(context);
assert.ok(handlers.has('fetch'),'Service Worker sem handler fetch');
const test=(url,method='GET',headers={})=>{
  let intercepted=false;
  handlers.get('fetch')({
    request:{url,method,headers:{has:key=>Object.keys(headers).some(k=>k.toLowerCase()===key.toLowerCase())}},
    respondWith:()=>{intercepted=true}
  });
  assert.equal(intercepted,false,'Requisição não autorizada interceptada: '+method+' '+url);
};
test('https://example.org/index.html');
test(scope+'index.html?token=privado');
test(scope+'molduras/original_01.webp?tracking=1');
test(scope+'video.mp4');
test(scope+'index.html','POST');
test(scope+'molduras/original_01.webp','GET',{Range:'bytes=0-100'});
assert.deepEqual(calls,[],'Requisições externas ou parciais acionaram cache/rede');
console.log('Privacidade PWA: URLs externas, parâmetros, POST e Range não interceptados.');


// CacheStorage pode permitir open() mas falhar na leitura. Isso não pode
// impedir que uma moldura ainda seja carregada pela rede.
{
  const handlers=new Map();
  const target=scope+'molduras/original_01.webp';
  const events=[];
  const response={ok:true,status:200,type:'basic',url:target,headers:{get:()=>target.endsWith('.webp')?'image/webp':'text/html; charset=utf-8'},clone(){return this}};
  const cache={
    match:async()=>{events.push('match');throw new Error('Leitura do cache bloqueada')},
    put:async()=>{events.push('put')}
  };
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)},
    caches:{open:async()=>cache},
    fetch:async()=>{events.push('fetch');return response},
    Response:{error:()=>({ok:false})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({
    request:{url:target,method:'GET',mode:'no-cors',headers:{has:()=>false}},
    respondWith:promise=>{pending=promise}
  });
  assert.ok(pending,'Moldura autorizada não interceptada');
  assert.equal(await pending,response,'Falha de leitura do cache bloqueou recurso disponível na rede');
  assert.deepEqual(events,['match','fetch','put'],'Fallback de leitura deve buscar a rede e armazenar resposta válida');
}
console.log('PWA: falha de leitura do cache preserva carregamento de molduras pela rede.');


// CacheStorage pode falhar antes mesmo de abrir o cache. A rede deve
// continuar atendendo o editor, sem tentar gravar uma resposta inexistente.
{
  const handlers=new Map();
  const target=scope+'index.html';
  const events=[];
  const response={ok:true,status:200,type:'basic',url:target,headers:{get:()=>target.endsWith('.webp')?'image/webp':'text/html; charset=utf-8'},clone(){return this}};
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)},
    caches:{open:async()=>{events.push('open');throw new Error('CacheStorage bloqueado')}},
    fetch:async()=>{events.push('fetch');return response},
    Response:{error:()=>({ok:false})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({
    request:{url:target,method:'GET',mode:'navigate',headers:{has:()=>false}},
    respondWith:promise=>{pending=promise}
  });
  assert.ok(pending,'Navegação autorizada não interceptada');
  assert.equal(await pending,response,'Falha ao abrir CacheStorage bloqueou editor online');
  assert.deepEqual(events,['open','fetch'],'Fallback deve consultar a rede sem cache disponível');
}
console.log('PWA: falha ao abrir CacheStorage não bloqueia navegação online.');


// Falha de escrita no CacheStorage não pode transformar uma resposta HTTP
// válida em erro de rede nem impedir o uso do editor/molduras online.
{
  const handlers=new Map();
  const target=scope+'molduras/original_02.webp';
  const events=[];
  const response={ok:true,status:200,type:'basic',url:target,headers:{get:()=>target.endsWith('.webp')?'image/webp':'text/html; charset=utf-8'},clone(){return this}};
  const cache={
    match:async()=>{events.push('match');return undefined},
    put:async()=>{events.push('put');throw new Error('QuotaExceededError')}
  };
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)},
    caches:{open:async()=>cache},
    fetch:async()=>{events.push('fetch');return response},
    Response:{error:()=>({ok:false})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({
    request:{url:target,method:'GET',mode:'no-cors',headers:{has:()=>false}},
    respondWith:promise=>{pending=promise}
  });
  assert.ok(pending,'Moldura autorizada não interceptada');
  assert.equal(await pending,response,'Falha ao gravar cache bloqueou resposta válida da rede');
  assert.deepEqual(events,['match','fetch','put'],'Resposta de rede deve ser preservada após falha de escrita');
}
console.log('PWA: quota de armazenamento esgotada não bloqueia moldura online.');


// Uma resposta HTTP de erro não é falha de conexão: não mostrar HTML
// desatualizado do cache nem substituir um 404/503 por sucesso falso.
{
  const handlers=new Map();
  const target=scope+'index.html';
  const events=[];
  const cached={ok:true,url:target};
  const unavailable={ok:false,status:503,url:target};
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)},
    caches:{open:async()=>({
      match:async()=>{events.push('match');return cached},
      put:async()=>{events.push('put')}
    })},
    fetch:async()=>{events.push('fetch');return unavailable},
    Response:{error:()=>({ok:false})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({
    request:{url:target,method:'GET',mode:'navigate',headers:{has:()=>false}},
    respondWith:promise=>{pending=promise}
  });
  assert.ok(pending,'Navegação não interceptada');
  assert.equal(await pending,unavailable,'Erro HTTP foi escondido por HTML antigo');
  assert.deepEqual(events,['match','fetch'],'Resposta HTTP com erro não deve ser gravada no cache');
}
console.log('PWA: erro HTTP 503 preservado sem servir HTML antigo.');


// Em modo offline, a navegação deve recuperar o editor do pré-cache.
// Recursos de mídia que não estejam no cache devem falhar explicitamente,
// sem devolver HTML como se fosse imagem ou vídeo.
{
  const handlers=new Map();
  const target=scope+'index.html';
  const events=[];
  const offlineEditor={ok:true,status:200,marker:'editor-offline'};
  const cache={
    match:async request=>{
      const url=typeof request==='string'?new URL(request,scope).href:request.url;
      events.push('match:'+url);
      return url===target?offlineEditor:undefined;
    },
    put:async()=>{throw new Error('Não gravar em modo offline')}
  };
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)},
    caches:{open:async()=>cache},
    fetch:async()=>{events.push('fetch');throw new Error('Sem conexão')},
    Response:{error:()=>({ok:false,marker:'network-error'})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  const dispatch=async(url,mode)=>{
    let pending;
    handlers.get('fetch')({
      request:{url,method:'GET',mode,headers:{has:()=>false}},
      respondWith:promise=>{pending=promise}
    });
    assert.ok(pending,'Recurso autorizado não interceptado: '+url);
    return pending;
  };
  assert.equal(await dispatch(target,'navigate'),offlineEditor,
    'Navegação offline não recuperou o editor');
  const media=await dispatch(scope+'molduras/original_22.webp','no-cors');
  assert.equal(media.marker,'network-error',
    'Moldura ausente do cache recebeu conteúdo incorreto em vez de erro de rede');
  assert.equal(events.filter(item=>item==='fetch').length,2,
    'Fallback offline deve tentar a rede nas duas situações');
}
console.log('PWA: navegação offline usa editor em cache; mídia ausente falha sem HTML falso.');


// Molduras já pré-carregadas devem continuar disponíveis sem rede.
// Respostas HTTP 404 de recursos não presentes não devem contaminar o cache.
{
  const handlers=new Map();
  const cachedUrl=scope+'molduras/original_03.webp';
  const missingUrl=scope+'molduras/original_04.webp';
  const events=[];
  const cached={ok:true,status:200,marker:'moldura-em-cache'};
  const missing={ok:false,status:404,marker:'moldura-ausente'};
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)},
    caches:{open:async()=>({
      match:async request=>{
        const url=typeof request==='string'?new URL(request,scope).href:request.url;
        events.push('match:'+url);
        return url===cachedUrl?cached:undefined;
      },
      put:async()=>{events.push('put')}
    })},
    fetch:async request=>{events.push('fetch:'+request.url);return missing},
    Response:{error:()=>({ok:false,marker:'network-error'})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  const dispatch=async url=>{
    let pending;
    handlers.get('fetch')({
      request:{url,method:'GET',mode:'no-cors',headers:{has:()=>false}},
      respondWith:promise=>{pending=promise}
    });
    assert.ok(pending,'Moldura não interceptada: '+url);
    return pending;
  };
  assert.equal(await dispatch(cachedUrl),cached,'Moldura pré-carregada não foi servida do cache');
  assert.equal(await dispatch(missingUrl),missing,'Erro HTTP 404 da moldura foi substituído');
  assert.equal(events.filter(event=>event.startsWith('fetch:')).length,1,
    'Moldura em cache não deve depender da rede');
  assert.ok(!events.includes('put'),'Resposta HTTP 404 não pode entrar no cache');
}
console.log('PWA: moldura pré-carregada funciona offline e HTTP 404 não contamina o cache.');


// Um redirecionamento para outro endereço não pode ser persistido no cache
// privado, mesmo que o navegador apresente a resposta como HTTP 200.
{
  const handlers=new Map();
  const target=scope+'molduras/original_05.webp';
  const events=[];
  const redirected={ok:true,status:200,type:'basic',url:'https://example.org/externo.webp',clone(){return this}};
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)},
    caches:{open:async()=>({
      match:async()=>{events.push('match');return undefined},
      put:async()=>{events.push('put')}
    })},
    fetch:async()=>{events.push('fetch');return redirected},
    Response:{error:()=>({ok:false})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({
    request:{url:target,method:'GET',mode:'no-cors',headers:{has:()=>false}},
    respondWith:promise=>{pending=promise}
  });
  assert.ok(pending,'Moldura autorizada não interceptada');
  assert.equal(await pending,redirected,'Redirecionamento deve ser entregue sem alteração');
  assert.deepEqual(events,['match','fetch'],'Resposta redirecionada não pode entrar no cache privado');
}
console.log('PWA: resposta redirecionada para domínio externo não é persistida.');


// Um redirecionamento dentro da mesma origem também não pode substituir
// a moldura solicitada no cache (ex.: login.html ou página de erro HTTP 200).
{
  const handlers=new Map();
  const target=scope+'molduras/original_06.webp';
  const events=[];
  const redirected={ok:true,status:200,type:'basic',url:scope+'index.html',clone(){return this}};
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)},
    caches:{open:async()=>({
      match:async()=>{events.push('match');return undefined},
      put:async()=>{events.push('put')}
    })},
    fetch:async()=>{events.push('fetch');return redirected},
    Response:{error:()=>({ok:false})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({
    request:{url:target,method:'GET',mode:'no-cors',headers:{has:()=>false}},
    respondWith:promise=>{pending=promise}
  });
  assert.ok(pending,'Moldura autorizada não interceptada');
  assert.equal(await pending,redirected,'Redirecionamento interno deve ser entregue sem alteração');
  assert.deepEqual(events,['match','fetch'],'HTML redirecionado não pode ser salvo como moldura');
}
console.log('PWA: redirecionamento interno não contamina cache de molduras.');


// Um servidor pode devolver página HTML com HTTP 200 na URL de uma moldura.
// O SW deve entregar a resposta de rede, mas nunca gravá-la como imagem offline.
{
  const handlers=new Map();
  const target=scope+'molduras/original_07.webp';
  const events=[];
  const html={ok:true,status:200,type:'basic',url:target,
    headers:{get:()=> 'text/html; charset=utf-8'},clone(){return this}};
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)},
    caches:{open:async()=>({
      match:async()=>{events.push('match');return undefined},
      put:async()=>{events.push('put')}
    })},
    fetch:async()=>{events.push('fetch');return html},
    Response:{error:()=>({ok:false})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({
    request:{url:target,method:'GET',mode:'no-cors',headers:{has:()=>false}},
    respondWith:promise=>{pending=promise}
  });
  assert.ok(pending,'Moldura autorizada não interceptada');
  assert.equal(await pending,html,'Resposta HTTP 200 deve ser entregue sem adulteração');
  assert.deepEqual(events,['match','fetch'],'HTML não pode contaminar cache de molduras');
}
console.log('PWA: resposta HTML 200 não é armazenada como moldura WebP.');


// Regressão: uma resposta HTTP 200 com MIME adulterado não pode entrar
// no cache de execução, nem substituir uma moldura válida no modo offline.
for (const [filename,mime] of [
  ['molduras/original_08.webp','image/webp-malicious'],
  ['icons/studio-192.png','image/png-malicious'],
  ['icons/studio.svg','image/svg+xml-malicious'],
  ['manifest.webmanifest','application/json-malicious']
]) {
  const handlers=new Map();
  const target=new URL(filename,scope).href;
  let writes=0;
  const response={ok:true,status:200,type:'basic',url:target,
    headers:{get:()=>mime},clone(){return this}};
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,handler)=>handlers.set(name,handler)},
    caches:{open:async()=>({match:async()=>undefined,put:async()=>{writes++}})},
    fetch:async()=>response,
    Response:{error:()=>({ok:false})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({request:{url:target,method:'GET',mode:'no-cors',
    headers:{has:()=>false}},respondWith:value=>{pending=value}});
  assert.ok(pending,'Recurso autorizado não interceptado: '+filename);
  assert.equal(await pending,response,'Resposta de rede alterada: '+filename);
  assert.equal(writes,0,'MIME adulterado persistido no cache: '+filename);
}
console.log('PWA: MIME adulterado de WebP, PNG, SVG e manifesto não entra no cache.');
