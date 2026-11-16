// Regressão: falhas ao ler a resposta HTML não devem substituir o editor offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const route of ['', 'index.html']){
  for(const failure of ['clone-throws','text-throws','text-rejects']){
    const url=scope+route;
    const handlers=new Map();
    const cached={marker:'editor-offline-preservado'};
    let writes=0;
    const response={
      status:200,type:'basic',url,
      headers:{get:()=> 'text/html'},
      clone(){
        if(failure==='clone-throws')throw new Error('clone indisponível');
        return {text(){
          if(failure==='text-throws')throw new Error('leitura indisponível');
          return Promise.reject(new Error('leitura rejeitada'));
        }};
      }
    };
    const context=vm.createContext({
      URL,console:{warn(){}},
      self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
      caches:{open:async()=>({match:async()=>cached,put:async()=>{writes++}})},
      fetch:async()=>response,
      Response:{error:()=>({status:0})}
    });
    new vm.Script(source,{filename:'sw.js'}).runInContext(context);
    let pending;
    handlers.get('fetch')({
      request:{url,method:'GET',mode:'navigate',headers:{has:()=>false}},
      respondWith:p=>pending=p
    });
    assert.equal(await pending,cached,'Falha '+failure+' substituiu editor offline em '+route);
    assert.equal(writes,0,'Falha '+failure+' contaminou cache em '+route);
  }
}
console.log('PWA: falhas de clone/text preservam editor offline sem gravar HTML inválido.');
