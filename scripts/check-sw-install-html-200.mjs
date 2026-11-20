// Regressão: pré-cache deve rejeitar página de erro HTTP 200 text/html.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
for(const invalidRoute of ['', 'index.html']){
  const handlers=new Map();
  let deleted=false,skipWaiting=false;
  const cache={put:async()=>{}};
  const context=vm.createContext({
    URL,console:{error(){},warn(){}},
    self:{registration:{scope},addEventListener:(event,fn)=>handlers.set(event,fn),skipWaiting:async()=>{skipWaiting=true}},
    caches:{keys:async()=>[],open:async()=>cache,delete:async()=>{deleted=true;return true}},
    fetch:async url=>{
      const pathname=new URL(url).pathname;
      const type=pathname.endsWith('.webp')?'image/webp':pathname.endsWith('.png')?'image/png':pathname.endsWith('.svg')?'image/svg+xml':pathname.endsWith('.webmanifest')?'application/manifest+json':'text/html';
      const body=invalidRoute===''?url===scope:url===scope+'index.html';
      return {status:200,type:'basic',url,headers:{get:()=>type},clone(){return {text:async()=>body?'<html><title>Erro temporário</title></html>':'<title>Estúdio Coroado News 24H</title><div id="editorial"></div><button id="savePNG"></button>'}}};
    }
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('install')({waitUntil:p=>{pending=p}});
  assert.ok(pending,'Instalação sem waitUntil');
  await assert.rejects(pending,/HTML offline não contém o editor/,'Instalação aceitou erro HTML 200: '+invalidRoute);
  assert.equal(deleted,true,'Cache parcial não foi limpo: '+invalidRoute);
  assert.equal(skipWaiting,false,'Service Worker inválido assumiu controle: '+invalidRoute);
}
console.log('PWA: instalação rejeita HTML de erro HTTP 200 e limpa cache parcial.');
