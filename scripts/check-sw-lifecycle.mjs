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
  addAll:async assets=>{
    assert.equal(assets.length,28,'PWA deve incluir 22 molduras e 6 recursos básicos');
    if(failInstall)throw new Error('Falha simulada no pré-cache');
  }
};
const context=vm.createContext({
  URL,Set,Array,
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
// Sem pré-cache, a instalação prossegue para permitir uso online.
await fire('install');
assert.equal(skipWaitingCalls,1,'Falha de pré-cache não deve bloquear o uso online');
assert.equal(stored.has(cacheName),false,'Cache parcial deve ser excluído');
// Falha na limpeza do cache parcial também não pode bloquear a instalação online.
failCacheCleanup=true;
await fire('install');
assert.equal(skipWaitingCalls,2,'Falha ao excluir cache parcial não deve bloquear instalação');
failCacheCleanup=false;
stored.delete(cacheName); // Isola o cenário seguinte da tentativa de pré-cache anterior.
failInstall=false;
await fire('install');
assert.equal(skipWaitingCalls,3,'Instalação após recuperação deve prosseguir');
await fire('activate');
assert.equal(claimCalls,1);
assert.equal(stored.has('estudio-coroado-offline-antigo'),false);
assert.equal(stored.has('cache-de-outro-aplicativo'),true,'Cache de outro app não pode ser excluído');
assert.equal(stored.has(cacheName),true);
assert.deepEqual(removed.sort(),['estudio-coroado-offline-antigo',cacheName].sort());
console.log('PWA: falha de pré-cache permite uso online, remove cache parcial e preserva caches de terceiros.');

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
