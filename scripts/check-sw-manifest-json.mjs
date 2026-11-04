import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const mime of ['application/json','application/manifest+json','text/html']){
  const listeners=new Map();
  const stored=[];
  const url=scope+'manifest.webmanifest';
  const response={ok:true,status:200,type:'basic',url,headers:{get:()=>mime},clone(){return this}};
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,handler)=>listeners.set(name,handler)},
    caches:{open:async()=>({match:async()=>undefined,put:async()=>stored.push(mime)})},
    fetch:async()=>response,Response:{error:()=>({ok:false})}
  });
  new vm.Script(source).runInContext(context);
  let pending;
  listeners.get('fetch')({request:{url,method:'GET',mode:'no-cors',headers:{has:()=>false}},respondWith:p=>pending=p});
  assert.equal(await pending,response);
  assert.deepEqual(stored,mime==='text/html'?[]:[mime],mime+' não deve ter resultado inesperado no cache');
}
console.log('PWA: manifesto JSON padrão e manifest+json aceitos; HTML rejeitado.');
