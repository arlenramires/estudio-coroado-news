import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const [path,mime] of [['index.html','image/png'],['manifest.webmanifest','text/html'],['manifest.webmanifest','application/octet-stream'],['manifest.webmanifest','application/javascript'],['icons/studio-192.png','text/html'],['icons/studio.svg','text/html']]){
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
console.log('PWA: MIME incompatível não contamina cache de HTML, manifesto ou ícones.');
