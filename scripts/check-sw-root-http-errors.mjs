// Regressão: erros HTTP reais na raiz não podem ser ocultados pelo HTML offline.
// Apenas falha de rede permite recuperar index.html do cache.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const status of [401,403,404,429,500,502,503,504]){
 for(const route of ['', 'index.html']){
  const handlers=new Map();
  const cached={status:200,marker:'editor-antigo'};
  const response={status,type:'basic',url:scope+route,marker:'erro-servidor'};
  let writes=0;
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
    caches:{open:async()=>({
      match:async request=>{
        const url=typeof request==='string'?new URL(request,scope).href:request.url;
        return url===scope+'index.html'?cached:undefined;
      },
      put:async()=>{writes++}
    })},
    fetch:async()=>response,
    Response:{error:()=>({status:0})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({
    request:{url:scope+route,method:'GET',mode:'navigate',headers:{has:()=>false}},
    respondWith:promise=>{pending=promise}
  });
  assert.ok(pending,'Navegação na raiz não interceptada');
  assert.equal(await pending,response,'HTTP '+status+' foi ocultado pelo editor antigo');
  assert.equal(writes,0,'HTTP '+status+' foi gravado no cache');
 }
}
console.log('PWA: erros HTTP 401/403/404/429/5xx na raiz e index.html são preservados.');
