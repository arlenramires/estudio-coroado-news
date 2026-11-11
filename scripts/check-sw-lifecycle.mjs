import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Verifica instalação atômica e limpeza restrita ao namespace do Estúdio.
const source=fs.readFileSync('sw.js','utf8');
// Acompanha automaticamente a versão real do cache ao atualizar o service worker.
const cacheName=source.match(/\bconst CACHE\s*=\s*['"](estudio-coroado-offline-v\d+)['"]\s*;/)?.[1];
assert.ok(cacheName,'Nome/versionamento do cache PWA não encontrado');
const scope='https://studio.example/private/';
const listeners=new Map();
const stored=new Set(['estudio-coroado-offline-antigo','cache-de-outro-aplicativo']);
const removed=[];
let failInstall=true;
let skipWaitingCalls=0;
let claimCalls=0;
let failCacheListing=false;
let failCacheCleanup=false;
const cache={
  put:async()=>{},
  match:async()=>undefined
};
const fetchAsset=async url=>{
  if(failInstall)throw new Error('Falha simulada no pré-cache');
  const type=url.endsWith('.webp')?'image/webp':
    url.endsWith('.png')?'image/png':
    url.endsWith('.svg')?'image/svg+xml':
    url.endsWith('.webmanifest')?'application/manifest+json':'text/html';
  return {status:200,type:'basic',url,headers:{get:name=>name.toLowerCase()==='content-type'?type:null}};
};
const context=vm.createContext({
  URL,Set,Array,console,fetch:fetchAsset,
  self:{
    registration:{scope},
    addEventListener:(name,fn)=>listeners.set(name,fn),
    skipWaiting:async()=>{skipWaitingCalls++},
    clients:{claim:async()=>{claimCalls++}}
  },
  caches:{
    open:async name=>{stored.add(name);return cache},
    keys:async()=>{if(failCacheListing)throw new Error('CacheStorage.keys bloqueado');return [...stored]},
    delete:async name=>{if(failCacheCleanup)throw new Error('CacheStorage.delete bloqueado');removed.push(name);return stored.delete(name)}
  }
});
new vm.Script(source,{filename:'sw.js'}).runInContext(context);
async function fire(name){
  let pending;
  listeners.get(name)({waitUntil:promise=>{pending=promise}});
  assert.ok(pending,name+' não chamou waitUntil');
  return pending;
}
// Falha no pré-cache deve rejeitar a instalação, sem substituir o SW anterior.
await assert.rejects(fire('install'),/Falha simulada no pré-cache/);
assert.equal(skipWaitingCalls,0,'Instalação incompleta não pode chamar skipWaiting');
assert.equal(stored.has(cacheName),false,'Cache parcial deve ser excluído');
// Mesmo se a limpeza falhar, a instalação incompleta deve continuar rejeitada.
failCacheCleanup=true;
await assert.rejects(fire('install'),/Falha simulada no pré-cache/);
assert.equal(skipWaitingCalls,0,'Falha de limpeza não autoriza ativação incompleta');
assert.equal(stored.has(cacheName),true,'Falha simulada de exclusão preserva cache parcial');
failCacheCleanup=false;
stored.delete(cacheName); // Isola o cenário seguinte da tentativa de pré-cache anterior.
failInstall=false;
await fire('install');
assert.equal(skipWaitingCalls,1,'Instalação após recuperação deve prosseguir');
await fire('activate');
assert.equal(claimCalls,1);
assert.equal(stored.has('estudio-coroado-offline-antigo'),false);
assert.equal(stored.has('cache-de-outro-aplicativo'),true,'Cache de outro app não pode ser excluído');
assert.equal(stored.has(cacheName),true);
assert.deepEqual(removed.sort(),['estudio-coroado-offline-antigo',cacheName].sort());
console.log('PWA: pré-cache incompleto rejeita instalação, tenta limpar cache parcial e preserva caches de terceiros.');

// Mesmo com CacheStorage parcialmente bloqueado, o SW deve ativar e controlar clientes.
failCacheListing=true;
await fire('activate');
assert.equal(claimCalls,2,'Falha ao listar caches não deve bloquear clients.claim');
failCacheListing=false;
stored.add('estudio-coroado-offline-antigo-2');
failCacheCleanup=true;
await fire('activate');
assert.equal(claimCalls,3,'Falha ao excluir cache antigo não deve bloquear clients.claim');
assert.equal(stored.has('cache-de-outro-aplicativo'),true,'Cache de terceiros deve permanecer intacto');
assert.equal(stored.has(cacheName),true,'Cache ativo deve permanecer intacto');
console.log('PWA: ativação resiliente a falhas de listagem e exclusão de caches.');
