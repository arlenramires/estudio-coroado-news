// Regressão: HTML com título correto, mas sem controles essenciais,
// não pode substituir o editor offline durante a instalação.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
const valid='<title>Estúdio Coroado News 24H</title><div id="editorial"></div><button id="savePNG"></button>';
for(const missing of ['editorial','savePNG']){
  const handlers=new Map();
  let deleted=false, activated=false;
  const context=vm.createContext({
    URL,console:{error(){},warn(){}},
    self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn),skipWaiting:async()=>{activated=true}},
    caches:{open:async()=>({put:async()=>{}}),delete:async()=>{deleted=true}},
    fetch:async url=>{
      const pathname=new URL(url).pathname;
      const type=pathname.endsWith('.webp')?'image/webp':pathname.endsWith('.png')?'image/png':pathname.endsWith('.svg')?'image/svg+xml':pathname.endsWith('.webmanifest')?'application/manifest+json':'text/html';
      const html=missing==='editorial'?valid.replace('id="editorial"','id="missing"'):valid.replace('id="savePNG"','id="missing"');
      return {status:200,type:'basic',url,headers:{get:()=>type},clone(){return {text:async()=>url===scope+'index.html'?html:valid}}};
    }
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('install')({waitUntil:p=>{pending=p}});
  assert.ok(pending,'Instalação sem waitUntil');
  await assert.rejects(pending,/HTML offline não contém o editor/);
  assert.equal(deleted,true,'Cache parcial não foi removido: '+missing);
  assert.equal(activated,false,'Worker incompleto assumiu controle: '+missing);
}
// Um servidor pode devolver HTML com os IDs apenas em comentários, sem editor funcional.
{
  const handlers=new Map();
  let deleted=false, activated=false;
  const commented='<title>Estúdio Coroado News 24H</title><!-- <div id="editorial"></div><button id="savePNG"></button> -->';
  const context=vm.createContext({
    URL,console:{error(){},warn(){}},
    self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn),skipWaiting:async()=>{activated=true}},
    caches:{open:async()=>({put:async()=>{}}),delete:async()=>{deleted=true}},
    fetch:async url=>{
      const pathname=new URL(url).pathname;
      const type=pathname.endsWith('.webp')?'image/webp':pathname.endsWith('.png')?'image/png':pathname.endsWith('.svg')?'image/svg+xml':pathname.endsWith('.webmanifest')?'application/manifest+json':'text/html';
      return {status:200,type:'basic',url,headers:{get:()=>type},clone(){return {text:async()=>commented}}};
    }
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('install')({waitUntil:p=>{pending=p}});
  await assert.rejects(pending,/HTML offline não contém o editor/);
  assert.equal(deleted,true,'Cache com controles apenas em comentários não foi removido');
  assert.equal(activated,false,'Worker sem editor funcional assumiu controle');
}
console.log('PWA: instalação rejeita editor HTML sem controles essenciais.');
