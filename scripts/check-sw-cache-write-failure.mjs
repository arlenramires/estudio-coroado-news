// Regressão: uma falha de escrita no CacheStorage não pode impedir a entrega
// de molduras, manifesto e ícones válidos ao navegador conectado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
const assets=[
  ...Array.from({length:22},(_,i)=>'molduras/original_'+String(i+1).padStart(2,'0')+'.webp'),
  'icons/studio-192.png','icons/studio-512.png','icons/studio.svg','manifest.webmanifest'
];
for(const route of assets){
  const handlers=new Map();
  const url=scope+route;
  const mime=route.endsWith('.webp')?'image/webp':route.endsWith('.png')?'image/png':route.endsWith('.svg')?'image/svg+xml':'application/manifest+json';
  const response={status:200,type:'basic',url,redirected:false,headers:{get:()=>mime},clone(){return this}};
  let reads=0,writes=0,requests=0;
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
    caches:{open:async()=>({
      match:async()=>{reads++;return undefined},
      put:async()=>{writes++;throw new Error('QuotaExceededError')}
    })},
    fetch:async()=>{requests++;return response},
    Response:{error:()=>({status:0})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({
    request:{url,method:'GET',mode:'same-origin',headers:{has:()=>false}},
    respondWith:p=>{pending=p}
  });
  assert.ok(pending,'Recurso não interceptado: '+route);
  assert.equal(await pending,response,'Falha de escrita bloqueou resposta online: '+route);
  assert.equal(reads,1,'Cache não consultado: '+route);
  assert.equal(requests,1,'Rede não consultada exatamente uma vez: '+route);
  assert.equal(writes,1,'Tentativa de escrita inesperada: '+route);
}
console.log('PWA: falha de escrita no cache não bloqueia 22 molduras, ícones e manifesto.');
