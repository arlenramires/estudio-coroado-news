// Regressão: bloqueio do CacheStorage não deve impedir o editor online.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const route of ['', 'index.html']){
  for(const online of [true,false]){
    const handlers=new Map();
    const url=scope+route;
    const response={status:200,type:'basic',url,headers:{get:()=> 'text/html'}};
    let networkCalls=0;
    const context=vm.createContext({
      URL,console:{warn(){}},
      self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
      caches:{open:async()=>{throw Error('CacheStorage indisponível')}},
      fetch:async()=>{networkCalls++;if(!online)throw Error('sem rede');return response},
      Response:{error:()=>({status:0,offline:true})}
    });
    new vm.Script(source,{filename:'sw.js'}).runInContext(context);
    let pending;
    handlers.get('fetch')({
      request:{url,method:'GET',mode:'navigate',headers:{has:()=>false}},
      respondWith:p=>{pending=p}
    });
    assert.ok(pending,'Navegação não interceptada');
    const result=await pending;
    assert.equal(networkCalls,1,'A rede deve ser consultada uma vez');
    if(online)assert.equal(result,response,'CacheStorage bloqueado impediu uso online');
    else assert.equal(result.offline,true,'Sem cache e sem rede deve falhar explicitamente');
  }
}
console.log('PWA: CacheStorage bloqueado preserva navegação online e sinaliza falta de rede.');
