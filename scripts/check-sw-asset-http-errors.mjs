// Regressão: erros HTTP em recursos do PWA não podem ser substituídos por arquivos offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const route of ['manifest.webmanifest','icons/studio-192.png','icons/studio-512.png','icons/studio.svg',...Array.from({length:22},(_,i)=>'molduras/original_'+String(i+1).padStart(2,'0')+'.webp')]){
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
  assert.equal((await pending).status,0,'Resposta HTTP inválida não rejeitada: '+status+' '+route);
  assert.equal(writes,0,'Erro HTTP gravado no cache: '+route);
 }
}
console.log('PWA: erros HTTP em manifesto, ícone e moldura são rejeitados sem cache indevido.');


// Regressão: mesmo com HTTP 200, um recurso sem Content-Type não pode ser
// persistido como moldura, ícone ou manifesto. Evita cache de respostas vazias
// ou páginas de erro produzidas por proxies.
for(const route of ['manifest.webmanifest','icons/studio-192.png','icons/studio-512.png','icons/studio.svg',...Array.from({length:22},(_,i)=>'molduras/original_'+String(i+1).padStart(2,'0')+'.webp')]){
 const handlers=new Map();
 const url=scope+route;
 const response={status:200,type:'basic',url,headers:{get:()=>null}};
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
 assert.ok(pending,'Recurso sem MIME não interceptado: '+route);
 assert.equal((await pending).status,0,'Resposta sem MIME não rejeitada: '+route);
 assert.equal(writes,0,'Resposta sem MIME armazenada: '+route);
}
console.log('PWA: respostas HTTP 200 sem Content-Type não contaminam o cache.');

// Regressão: HTTP 200 com MIME de outra classe de arquivo não pode contaminar
// o cache. Proxies podem devolver HTML de login com sucesso HTTP no lugar da arte.
for(const [route,mime] of [
 ['manifest.webmanifest','text/html'],
 ['icons/studio-192.png','text/html'],
 ['molduras/original_01.webp','text/html'],
 ['molduras/original_01.webp','image/png'],
 ['icons/studio-192.png','image/webp'],
 ['manifest.webmanifest','image/png']
]){
 const handlers=new Map();
 const url=scope+route;
 const response={status:200,type:'basic',url,headers:{get:()=>mime}};
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
 assert.ok(pending,'Recurso com MIME errado não interceptado: '+route);
 assert.equal((await pending).status,0,'Resposta com MIME errado não rejeitada: '+route);
 assert.equal(writes,0,'Resposta com MIME errado armazenada: '+route);
}
console.log('PWA: respostas HTTP 200 com MIME incorreto não contaminam o cache.');
