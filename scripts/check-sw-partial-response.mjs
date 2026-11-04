// Regressão: um servidor pode responder 206 mesmo sem cabeçalho Range.
// O PWA deve entregar a resposta, mas nunca guardar bytes incompletos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const [path,mode] of [['index.html','navigate'],['molduras/original_01.webp','no-cors']]){
  const handlers=new Map();
  const events=[];
  const target=scope+path;
  const partial={ok:true,status:206,type:'basic',url:target,clone(){return this}};
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
    caches:{open:async()=>({match:async()=>undefined,put:async()=>events.push('put')})},
    fetch:async()=>{events.push('fetch');return partial},
    Response:{error:()=>({ok:false})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({
    request:{url:target,method:'GET',mode,headers:{has:()=>false}},
    respondWith:promise=>{pending=promise}
  });
  assert.ok(pending,'Requisição autorizada não interceptada: '+path);
  assert.equal(await pending,partial,'Resposta parcial não foi preservada: '+path);
  assert.deepEqual(events,['fetch'],'HTTP 206 não pode ser salvo no cache: '+path);
}
console.log('PWA: respostas HTTP 206 nunca entram no cache offline.');
