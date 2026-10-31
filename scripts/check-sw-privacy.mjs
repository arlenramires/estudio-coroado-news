import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Regressão de privacidade: fotos/vídeos importados, consultas e URLs externas
// não podem ser interceptados nem armazenados pelo service worker.
const source=fs.readFileSync('sw.js','utf8');
const handlers=new Map();
const writes=[];
const scope='http://127.0.0.1:8765/';
const context=vm.createContext({
  URL,
  self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
  caches:{open:async()=>({
    match:async()=>null,
    put:async(req)=>writes.push(req.url)
  })},
  fetch:async()=>({ok:true,clone(){return this}}),
  Response:{error:()=>({ok:false})}
});
new vm.Script(source,{filename:'sw.js'}).runInContext(context);
const onFetch=handlers.get('fetch');
assert.equal(typeof onFetch,'function');
function dispatch(url,{method='GET',range=false,mode='cors'}={}){
  let response;
  onFetch({request:{
    url,method,mode,
    headers:{has:name=>range&&name==='range'}
  },respondWith:p=>{response=p}});
  return response;
}
const bypass=[
  'https://example.com/photo.jpg',
  scope+'foto-pessoal.jpg',
  scope+'index.html?token=privado',
  scope+'molduras/original_01.webp?usuario=1'
];
for(const url of bypass)assert.equal(dispatch(url),undefined,'Interceptou URL não autorizada: '+url);
assert.equal(dispatch(scope+'index.html',{method:'POST'}),undefined);
assert.equal(dispatch(scope+'index.html',{range:true}),undefined);
assert.ok(dispatch(scope+'molduras/original_01.webp'),'Moldura autorizada não interceptada');
assert.ok(dispatch(scope+'index.html'),'Editor autorizado não interceptado');
assert.equal(writes.length,0,'O teste não deve gravar dados antes da resolução das respostas');
console.log('Privacidade PWA: URLs externas, mídia pessoal, consultas, POST e Range ignorados.');
