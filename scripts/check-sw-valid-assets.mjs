// Regressão positiva: assets íntegros devem ser armazenados para uso offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const [route,mime] of [
 ['manifest.webmanifest','application/manifest+json'],
 ['manifest.webmanifest','application/json; charset=utf-8'],
 ['icons/studio-192.png','image/png'],
 ['icons/studio-512.png','image/png'],
 ['icons/studio.svg','image/svg+xml'],
 ...Array.from({length:22},(_,i)=>['molduras/original_'+String(i+1).padStart(2,'0')+'.webp','image/webp'])
]){
 const handlers=new Map();
 const url=scope+route;
 const response={status:200,type:'basic',url,redirected:false,headers:{get:()=>mime},clone(){return this}};
 let writes=0,storedUrl='',storedResponse; let networkCalls=0;
 const context=vm.createContext({
  URL,console:{warn(){}},
  self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
  caches:{open:async()=>({match:async()=>storedResponse,put:async(key,value)=>{writes++;storedUrl=key.url||key;storedResponse=value}})},
  fetch:async()=>{networkCalls++;if(networkCalls>1)throw new Error('Sem conexão');return response},
  Response:{error:()=>({status:0})}
 });
 new vm.Script(source,{filename:'sw.js'}).runInContext(context);
 let pending;
 handlers.get('fetch')({request:{url,method:'GET',mode:'same-origin',headers:{has:()=>false}},respondWith:p=>{pending=p}});
 assert.ok(pending,'Recurso válido não interceptado: '+route);
 assert.equal(await pending,response,'Resposta válida não entregue: '+route);
 assert.equal(writes,1,'Recurso válido não armazenado exatamente uma vez: '+route);
 assert.equal(storedUrl,url,'URL incorreta no cache: '+route);
 // Segunda solicitação sem rede: o recurso deve ser servido do cache, sem nova busca.
 let offlinePending;
 handlers.get('fetch')({request:{url,method:'GET',mode:'same-origin',headers:{has:()=>false}},respondWith:p=>{offlinePending=p}});
 assert.ok(offlinePending,'Requisição offline não interceptada: '+route);
 assert.equal(await offlinePending,response,'Recurso válido não recuperado do cache offline: '+route);
 assert.equal(networkCalls,1,'Recurso em cache fez acesso desnecessário à rede: '+route);
 assert.equal(writes,1,'Leitura offline não deve regravar o recurso: '+route);

 // Privacidade: URLs com parâmetros, uploads e outras origens não devem ser interceptados.
 for(const candidate of [
  {url:url+'?token=privado',method:'GET',range:false},
  {url:scope+'uploads/video-pessoal.mp4',method:'GET',range:false},
  {url:'https://example.org/'+route,method:'GET',range:false},
  {url,method:'POST',range:false},
  {url,method:'PUT',range:false},
  {url,method:'DELETE',range:false},
  {url,method:'HEAD',range:false},
  {url,method:'GET',range:true}
 ]){
  let intercepted=false;
  handlers.get('fetch')({request:{url:candidate.url,method:candidate.method,mode:'same-origin',headers:{has:key=>key==='range'&&candidate.range}},respondWith:()=>{intercepted=true}});
  assert.equal(intercepted,false,'Requisição privada ou não autorizada interceptada: '+candidate.url);
 }
}
console.log('PWA: manifesto, ícones e todas as 22 molduras válidos são armazenados e recuperados offline.');


// Regressão negativa: uma página de erro HTTP 200 não pode contaminar o cache
// de imagens/manifesto, nem ser devolvida como se fosse um asset válido.
for(const route of [
 ...Array.from({length:22},(_,i)=>'molduras/original_'+String(i+1).padStart(2,'0')+'.webp'),
 'icons/studio-192.png','icons/studio-512.png','icons/studio.svg','manifest.webmanifest'
]){
 const handlers=new Map();
 const url=scope+route;
 let writes=0;
 const invalid={status:200,type:'basic',url,redirected:false,headers:{get:()=> 'text/html; charset=utf-8'},clone(){return this}};
 const context=vm.createContext({
  URL,console:{warn(){}},
  self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
  caches:{open:async()=>({match:async()=>undefined,put:async()=>{writes++}})},
  fetch:async()=>invalid,
  Response:{error:()=>({status:0})}
 });
 new vm.Script(source,{filename:'sw.js'}).runInContext(context);
 let pending;
 handlers.get('fetch')({request:{url,method:'GET',mode:'same-origin',headers:{has:()=>false}},respondWith:p=>{pending=p}});
 assert.ok(pending,'Asset inválido não interceptado: '+route);
 const result=await pending;
 assert.equal(result.status,0,'HTML falso foi entregue como asset válido: '+route);
 assert.equal(writes,0,'HTML falso contaminou cache: '+route);
}
console.log('PWA: HTML HTTP 200 falso rejeitado nas 22 molduras, ícones e manifesto sem contaminar o cache.');
