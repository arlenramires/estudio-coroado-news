import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const [path,mime] of [['index.html','image/png'],['manifest.webmanifest','text/html'],['manifest.webmanifest','application/octet-stream'],['manifest.webmanifest','application/javascript'],['icons/studio-192.png','text/html'],['icons/studio.svg','text/html'],['molduras/original_01.webp','image/webp-malicious'],['molduras/original_01.webp','image/webp2'],['molduras/original_01.webp',''],['icons/studio-192.png','image/png-malicious'],['index.html','text/html-malicious']]){
  const handlers=new Map(),events=[];
  const url=scope+path;
  const response={ok:true,status:200,type:'basic',url,headers:{get:()=>mime},clone(){return this}};
  const context=vm.createContext({URL,console:{warn(){}},self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},caches:{open:async()=>({match:async()=>undefined,put:async()=>events.push('put')})},fetch:async()=>response,Response:{error:()=>({ok:false})}});
  new vm.Script(source).runInContext(context);
  let pending;
  handlers.get('fetch')({request:{url,method:'GET',mode:path==='index.html'?'navigate':'no-cors',headers:{has:()=>false}},respondWith:p=>pending=p});
  assert.equal(await pending,response,'Resposta de rede alterada: '+path);
  assert.deepEqual(events,[],'MIME incorreto persistido em cache: '+path);
}
// Respostas redirecionadas, parciais ou de outra origem não podem entrar no cache,
// mesmo quando o servidor informa MIME aparentemente correto.
for(const variant of [
  {status:206,type:'basic',url:scope+'molduras/original_01.webp'},
  {status:200,type:'opaqueredirect',url:scope+'molduras/original_01.webp'},
  {status:200,type:'basic',url:'https://example.invalid/original_01.webp'},
]){
  const handlers=new Map(),events=[];
  const url=scope+'molduras/original_01.webp';
  const response={ok:true,...variant,headers:{get:()=> 'image/webp'},clone(){return this}};
  const context=vm.createContext({URL,console:{warn(){}},self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},caches:{open:async()=>({match:async()=>undefined,put:async()=>events.push('put')})},fetch:async()=>response,Response:{error:()=>({ok:false})}});
  new vm.Script(source).runInContext(context);
  let pending;
  handlers.get('fetch')({request:{url,method:'GET',mode:'no-cors',headers:{has:()=>false}},respondWith:p=>pending=p});
  assert.equal(await pending,response,'Resposta de rede alterada');
  assert.deepEqual(events,[],'Resposta parcial, opaca ou redirecionada persistida em cache');
}

// Regressão positiva: tipos MIME legítimos, inclusive parâmetros de charset,
// precisam continuar funcionando e ficar disponíveis após perda de conexão.
for(const [path,mime] of [
  ['index.html','text/html; charset=utf-8'],
  ['manifest.webmanifest','application/manifest+json; charset=utf-8'],
  ['manifest.webmanifest','application/json'],
  ['icons/studio-192.png','image/png'],
  ['icons/studio.svg','image/svg+xml'],
  ['molduras/original_01.webp','image/webp; charset=binary']
]){
  const handlers=new Map(),saved=new Map();
  const url=scope+path;
  const response={status:200,type:'basic',url,headers:{get:()=>mime},clone(){return this}};
  let online=true;
  const cache={match:async request=>saved.get(typeof request==='string'?new URL(request,scope).href:request.url),put:async (request,value)=>saved.set(typeof request==='string'?new URL(request,scope).href:request.url,value)};
  const context=vm.createContext({URL,console:{warn(){}},self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},caches:{open:async()=>cache},fetch:async()=>{if(!online)throw new Error('offline');return response},Response:{error:()=>({status:0})}});
  new vm.Script(source).runInContext(context);
  const request={url,method:'GET',mode:path==='index.html'?'navigate':'no-cors',headers:{has:()=>false}};
  const dispatch=async()=>{let pending;handlers.get('fetch')({request,respondWith:p=>pending=p});return await pending};
  assert.equal(await dispatch(),response,'MIME legítimo rejeitado: '+path);
  assert.equal(saved.get(url),response,'Recurso legítimo não armazenado: '+path);
  online=false;
  assert.equal(await dispatch(),response,'Recurso válido indisponível offline: '+path);
}
console.log('PWA: MIME legítimo aceito e recurso preservado offline.');

console.log('PWA: MIME incompatível, resposta parcial e redirecionamento não contaminam o cache.');
