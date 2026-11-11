// Verifica que a URL raiz do PWA abre o editor sem rede, mesmo quando
// somente index.html permanece no cache (migração ou limpeza parcial).
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
const handlers=new Map();
const editor={status:200,marker:'editor-offline'};
const cache={
  match:async request=>{
    const url=typeof request==='string'?new URL(request,scope).href:request.url;
    return url===scope+'index.html'?editor:undefined;
  },
  put:async()=>{throw Error('Não gravar sem rede')}
};
const context=vm.createContext({
  URL,console:{warn(){}},
  self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
  caches:{open:async()=>cache},
  fetch:async()=>{throw Error('Sem conexão')},
  Response:{error:()=>({status:0})}
});
new vm.Script(source,{filename:'sw.js'}).runInContext(context);
let pending;
handlers.get('fetch')({
  request:{url:scope,method:'GET',mode:'navigate',headers:{has:()=>false}},
  respondWith:value=>{pending=value}
});
assert.ok(pending,'Navegação na raiz não interceptada');
assert.equal(await pending,editor,'A raiz offline deve recuperar index.html');
console.log('PWA: navegação na raiz recupera index.html offline.');
