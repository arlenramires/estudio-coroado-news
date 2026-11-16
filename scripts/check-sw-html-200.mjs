// Regressão: erro HTTP 200 com text/html não pode sobrescrever editor offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const route of ['', 'index.html']){
  const url=scope+route;
  const handlers=new Map();
  const cached={marker:'editor-correto'};
  let writes=0;
  const incoming={status:200,type:'basic',url,headers:{get:()=> 'text/html'},clone(){return {...this,text:async()=>'<html><title>Erro temporário</title><body>Indisponível</body></html>'}}};
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(event,fn)=>handlers.set(event,fn)},
    caches:{open:async()=>({match:async()=>cached,put:async()=>{writes++}})},
    fetch:async()=>incoming,
    Response:{error:()=>({status:0})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({request:{url,method:'GET',mode:'navigate',headers:{has:()=>false}},respondWith:p=>pending=p});
  assert.ok(pending);
  assert.equal(await pending,cached,'HTML de erro substituiu editor offline: '+route);
  assert.equal(writes,0,'HTML de erro foi armazenado no cache: '+route);
}
console.log('PWA: HTTP 200 text/html sem editor não contamina cache.');
