// Regressão: instalação não pode aceitar HTML cujo corpo não possa ser verificado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const route of ['', 'index.html']){
  for(const failure of ['no-clone','no-text','clone-throws','text-throws','text-rejects']){
    const handlers=new Map();
    let deleted=false, activated=false, writes=0;
    const context=vm.createContext({
      URL,console:{error(){},warn(){}},
      self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn),
        skipWaiting:async()=>{activated=true}},
      caches:{open:async()=>({put:async()=>{writes++}}),
        delete:async()=>{deleted=true;return true}},
      fetch:async url=>{
        const pathname=new URL(url).pathname;
        const type=pathname.endsWith('.webp')?'image/webp':pathname.endsWith('.png')?'image/png':pathname.endsWith('.svg')?'image/svg+xml':pathname.endsWith('.webmanifest')?'application/manifest+json':'text/html';
        const response={status:200,type:'basic',url,headers:{get:()=>type}};
        const invalid=url===scope+route;
        if(invalid&&failure==='no-clone')return response;
        response.clone=()=>{
          if(invalid&&failure==='clone-throws')throw Error('clone falhou');
          if(invalid&&failure==='no-text')return {};
          return {text:()=>{
            if(invalid&&failure==='text-throws')throw Error('text falhou');
            if(invalid&&failure==='text-rejects')return Promise.reject(Error('text rejeitado'));
            return Promise.resolve('<title>Estúdio Coroado News 24H</title><main id="editorial"><button id="savePNG"></button></main>');
          }};
        };
        return response;
      }
    });
    new vm.Script(source,{filename:'sw.js'}).runInContext(context);
    let pending;
    handlers.get('install')({waitUntil:p=>{pending=p}});
    assert.ok(pending,'Instalação sem waitUntil');
    await assert.rejects(pending,undefined,'Instalação aceitou HTML não verificável: '+route+' / '+failure);
    assert.equal(deleted,true,'Cache parcial não foi eliminado: '+route+' / '+failure);
    assert.equal(activated,false,'Instalação inválida ativou Service Worker: '+route+' / '+failure);
  }
}
console.log('PWA: instalação rejeita HTML sem clone/text ou com falha de leitura.');
