// Regressão: HTML inválido com HTTP 200 não pode substituir o editor offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const route of ['', 'index.html']){
  for(const mime of ['image/png','application/json','text/html-malicious','']){
    const handlers=new Map();
    const cached={status:200,marker:'editor-offline-valido'};
    const url=scope+route;
    const incoming={status:200,type:'basic',url,headers:{get:()=>mime},clone(){return this}};
    let writes=0;
    const context=vm.createContext({
      URL,console:{warn(){}},
      self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
      caches:{open:async()=>({
        match:async request=>{
          const key=typeof request==='string'?new URL(request,scope).href:request.url;
          return key===scope+'index.html'?cached:undefined;
        },
        put:async()=>{writes++}
      })},
      fetch:async()=>incoming,
      Response:{error:()=>({status:0})}
    });
    new vm.Script(source,{filename:'sw.js'}).runInContext(context);
    let pending;
    handlers.get('fetch')({
      request:{url,method:'GET',mode:'navigate',headers:{has:()=>false}},
      respondWith:p=>{pending=p}
    });
    assert.ok(pending,'Navegação não interceptada');
    assert.equal(await pending,cached,'Resposta 200 inválida substituiu o editor: '+route+' '+mime);
    assert.equal(writes,0,'Resposta 200 inválida contaminou cache: '+route+' '+mime);
  }
}
console.log('PWA: respostas HTTP 200 com MIME inválido preservam editor offline.');
