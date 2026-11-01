// Regressão funcional: o PWA privado não deve interceptar mídia, URLs
// parametrizadas ou requisições parciais, nem servir cache de terceiros.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('sw.js','utf8');
const listeners=new Map();
const scope='https://studio.example/private/';
const assets=new Map();
let networkCalls=0;
const cache={
  match:async request=>assets.get(typeof request==='string'?new URL(request,scope).href:request.url),
  put:async(request,response)=>{assets.set(request.url,response)}
};
const context=vm.createContext({
  URL,Set,Array,
  self:{registration:{scope},addEventListener:(name,fn)=>listeners.set(name,fn)},
  caches:{open:async()=>cache},
  fetch:async request=>{networkCalls++;return {ok:true,type:'basic',url:request.url,clone(){return this}}},
  Response:{error:()=>({error:true})}
});
new vm.Script(source,{filename:'sw.js'}).runInContext(context);
const handler=listeners.get('fetch');
assert.equal(typeof handler,'function');
const root=new URL('index.html',scope).href;
const request=(url,options={})=>({
  url,method:options.method||'GET',mode:options.mode||'same-origin',
  headers:{has:key=>key==='range'&&!!options.range}
});
async function dispatch(req){
  let response;
  handler({request:req,respondWith:promise=>{response=promise}});
  return response===undefined?null:await response;
}
for(const req of [
  request(root+'?token=private'),
  request('https://other.example/index.html'),
  request(root,{method:'POST'}),
  request(root,{range:true})
])assert.equal(await dispatch(req),null,'Requisição não autorizada interceptada');
assert.equal(networkCalls,0);
const first=await dispatch(request(root));
assert.equal(first.url,root);
assert.equal(networkCalls,1);
const second=await dispatch(request(root));
assert.equal(second.url,root);
assert.equal(networkCalls,2,'HTML deve tentar atualização online');
console.log('Service worker: URLs externas, parâmetros, POST e Range não interceptados.');
