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
  const response={ok:true,type:'basic',url:target,clone(){return this}};
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
  const response={ok:true,type:'basic',url:target,clone(){return this}};
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
