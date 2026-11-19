// Regressão de instalação: preservar cache anterior e limpar somente cache novo incompleto.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const scope='https://studio.example/private/';
const html='<title>Estúdio Coroado News 24H</title><main id="editorial"><button id="savePNG"></button></main>';
const cacheName=source.match(/const CACHE='([^']+)'/)?.[1];
assert.ok(cacheName,'Nome do cache ausente');
function response(url){
  const path=new URL(url).pathname;
  const mime=path.endsWith('.webp')?'image/webp':path.endsWith('.png')?'image/png':
    path.endsWith('.svg')?'image/svg+xml':path.endsWith('.webmanifest')?'application/manifest+json':'text/html';
  return {status:200,type:'basic',redirected:false,url,headers:{get:()=>mime},
    clone(){return this},async text(){return html}};
}
async function scenario(existed,failAt){
  const listeners=new Map();
  const stored=new Map(existed?[[cacheName,new Map([['sentinel','preserved'],[scope+'index.html','original-editor']])]]:[]);
  let requests=0,deleted=false,skipWaiting=false;
  const context=vm.createContext({
    URL,Set,Array,console:{error:()=>{},warn:()=>{}},
    self:{registration:{scope},addEventListener:(event,fn)=>listeners.set(event,fn),
      skipWaiting:async()=>{skipWaiting=true}},
    caches:{
      keys:async()=>[...stored.keys()],
      open:async name=>{if(!stored.has(name))stored.set(name,new Map());const items=stored.get(name);
        return {match:async url=>items.get(url),put:async(url,res)=>{items.set(url,res)}}},
      delete:async name=>{deleted=true;return stored.delete(name)}
    },
    fetch:async url=>{requests++;if(requests===failAt)throw new Error('Falha simulada');return response(url)}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  listeners.get('install')({waitUntil:p=>{pending=p}});
  assert.ok(pending,'install deve usar waitUntil');
  if(failAt!==Infinity)await assert.rejects(pending,/Falha simulada/);
  else await pending;
  return {stored,deleted,skipWaiting,requests};
}
const old=await scenario(true,3);
assert.equal(old.stored.get(cacheName)?.get('sentinel'),'preserved','Cache preexistente não pode ser apagado');
assert.equal(old.stored.get(cacheName)?.get(scope+'index.html'),'original-editor','Instalação falha não pode sobrescrever HTML anterior');
assert.equal(old.deleted,false,'Instalação falha não deve apagar cache existente');
assert.equal(old.skipWaiting,false,'Instalação falha não deve assumir controle');
const fresh=await scenario(false,3);
assert.equal(fresh.stored.has(cacheName),false,'Cache novo incompleto deve ser removido');
assert.equal(fresh.deleted,true);
assert.equal(fresh.skipWaiting,false);
const success=await scenario(false,Infinity);
assert.equal(success.skipWaiting,true,'Instalação completa deve ativar a atualização');
assert.equal(success.stored.get(cacheName)?.size,28,'Pré-cache deve incluir raiz, HTML, manifest, 3 ícones e 22 molduras');
console.log('Instalação offline: cache anterior preservado, cache novo incompleto removido e 22 molduras armazenadas.');
