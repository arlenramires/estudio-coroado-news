// Regressão: erros HTTP em recursos do PWA não podem ser substituídos por arquivos offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const route of ['manifest.webmanifest','icons/studio-192.png','molduras/original_01.webp']){
 // Inclui respostas 2xx que não são 200, redirecionamentos, respostas parciais e erros: nenhuma deve virar recurso offline.
 for(const status of [201,202,203,204,205,206,207,301,302,307,308,304,401,403,404,418,429,500,502,503,504]){
  const handlers=new Map();
  const url=scope+route;
  const response={status,type:'basic',url};
  let writes=0;
  const context=vm.createContext({
   URL,console:{warn(){}},
   self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
   caches:{open:async()=>({match:async()=>undefined,put:async()=>{writes++}})},
   fetch:async()=>response,
   Response:{error:()=>({status:0})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({request:{url,method:'GET',mode:'same-origin',headers:{has:()=>false}},respondWith:p=>{pending=p}});
  assert.ok(pending,'Recurso PWA não interceptado: '+route);
  assert.equal(await pending,response,'Erro HTTP '+status+' ocultado: '+route);
  assert.equal(writes,0,'Erro HTTP gravado no cache: '+route);
 }
}
console.log('PWA: erros HTTP em manifesto, ícone e moldura são preservados sem cache indevido.');
