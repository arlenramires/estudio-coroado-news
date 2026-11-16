// Regressão: uma resposta HTTP 200 com título correto, mas sem controles
// essenciais, não deve substituir o editor offline em navegações.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
const valid='<title>Estúdio Coroado News 24H</title><div id="editorial"></div><button id="savePNG"></button>';
for(const route of ['', 'index.html']){
  for(const missing of ['editorial','savePNG']){
    const url=scope+route;
    const handlers=new Map();
    const cached={marker:'editor-offline-valido'};
    let writes=0;
    const broken=valid.replace('id="'+missing+'"','id="controle-ausente"');
    const response={status:200,type:'basic',url,headers:{get:()=> 'text/html'},clone(){return {text:async()=>broken}}};
    const context=vm.createContext({
      URL,console:{warn(){}},
      self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
      caches:{open:async()=>({match:async()=>cached,put:async()=>{writes++}})},
      fetch:async()=>response,
      Response:{error:()=>({status:0})}
    });
    new vm.Script(source,{filename:'sw.js'}).runInContext(context);
    let pending;
    handlers.get('fetch')({request:{url,method:'GET',mode:'navigate',headers:{has:()=>false}},respondWith:p=>pending=p});
    assert.ok(pending,'Navegação sem respondWith');
    assert.equal(await pending,cached,'HTML incompleto substituiu o editor: '+route+' / '+missing);
    assert.equal(writes,0,'HTML incompleto contaminou cache: '+route+' / '+missing);
  }
}
console.log('PWA: navegação rejeita HTML sem controles essenciais e preserva cache.');
