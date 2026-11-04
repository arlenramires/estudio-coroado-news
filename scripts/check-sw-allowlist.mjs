import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Verifica o roteamento real do Service Worker para todas as 22 molduras,
// sem confundir uma lista de arquivos com cobertura funcional.
const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
const allowed=['','index.html','manifest.webmanifest','icons/studio.svg','icons/studio-192.png','icons/studio-512.png',
  ...Array.from({length:22},(_,i)=>'molduras/original_'+String(i+1).padStart(2,'0')+'.webp')];
const blocked=['molduras/original_00.webp','molduras/original_23.webp',
  'molduras/original_01.webp/extra','molduras/original_01.webp?x=1',
  'molduras/%6friginal_01.webp','icons/studio-192.png?x=1',
  // Caminhos semelhantes não devem contornar a lista fechada do PWA privado.
  'molduras/ORIGINAL_01.webp',
  'molduras//original_01.webp','molduras/original_01.webp.bak',
  'molduras/original_01.webp%2fextra','molduras/%2e%2e/index.html',
  'icons/studio-512.png.old','index.html/extra',
  'midia-pessoal.mp4','uploads/foto.jpg','private/index.html'];
const listeners=new Map();
const context=vm.createContext({
  URL,console:{warn(){}},
  self:{registration:{scope},addEventListener:(name,fn)=>listeners.set(name,fn)},
  caches:{open:async()=>({match:async()=>({ok:true,status:200,type:'basic',url:scope+'index.html'})})},
  fetch:async()=>({ok:true,status:200,type:'basic',url:scope+'index.html'}),
  Response:{error:()=>({ok:false})}
});
new vm.Script(source).runInContext(context);
const handler=listeners.get('fetch');
assert.equal(typeof handler,'function','Service Worker sem evento fetch');
for(const relative of allowed){
  let response;
  handler({request:{url:scope+relative,method:'GET',mode:'same-origin',headers:{has:()=>false}},
    respondWith:value=>{response=value}});
  assert.ok(response&&typeof response.then==='function','Arquivo autorizado não interceptado: '+relative);
  await response;
}
for(const relative of blocked){
  let intercepted=false;
  handler({request:{url:scope+relative,method:'GET',mode:'same-origin',headers:{has:()=>false}},
    respondWith:()=>{intercepted=true}});
  assert.equal(intercepted,false,'Arquivo fora da lista interceptado: '+relative);
}
console.log('PWA: 22 molduras e arquivos essenciais interceptados; URLs não autorizadas ignoradas.');
