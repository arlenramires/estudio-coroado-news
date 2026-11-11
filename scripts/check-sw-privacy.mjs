import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Regressão de privacidade: fotos/vídeos importados, consultas e URLs externas
// não podem ser interceptados nem armazenados pelo service worker.
const source=fs.readFileSync('sw.js','utf8');
const handlers=new Map();
const writes=[];
const reads=[];
const scope='http://127.0.0.1:8765/';
const context=vm.createContext({
  URL,
  self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
  caches:{open:async()=>({
    match:async req=>{reads.push(typeof req==='string'?req:req.url);return null},
    put:async(req)=>writes.push(req.url)
  })},
  fetch:async req=>({
    ok:true,status:200,type:'basic',url:req.url,
    headers:{get:name=>name.toLowerCase()==='content-type'
      ? (req.url.endsWith('.webp')?'image/webp':'text/html') : null},
    clone(){return this}
  }),
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
const moldura=dispatch(scope+'molduras/original_01.webp');
const editor=dispatch(scope+'index.html');
assert.ok(moldura,'Moldura autorizada não interceptada');
assert.ok(editor,'Editor autorizado não interceptado');
await Promise.all([moldura,editor]);
assert.deepEqual(writes.sort(),[scope+'index.html',scope+'molduras/original_01.webp'].sort(),
  'Somente arquivos permitidos podem ser gravados no cache');
assert.ok(reads.length>=2,'Os recursos autorizados devem consultar o cache');
assert.equal(dispatch(scope+'index.html?segredo=1'),undefined,'Query string não pode ser interceptada');
console.log('Privacidade PWA: URLs externas, mídia pessoal, consultas, POST e Range ignorados.');
