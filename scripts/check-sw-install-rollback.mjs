// Regressão: instalação incompleta nunca apaga cache preexistente.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('sw.js', 'utf8');
const scope = 'https://studio.example/private/';

async function scenario(preexisting) {
  const listeners = new Map();
  const deleted = [];
  const entries = new Map();
  const cacheName = source.match(/const CACHE='([^']+)'/)?.[1];
  assert.ok(cacheName, 'Identificador do cache deve existir');
  const cache = {
    put: async (url, response) => { entries.set(url, response); }
  };
  let fetchCount = 0;
  const context = vm.createContext({
    URL, Set, Array, console: { error() {}, warn() {} },
    self: {
      registration: { scope },
      addEventListener: (name, callback) => listeners.set(name, callback),
      skipWaiting: async () => {}
    },
    caches: {
      keys: async () => preexisting ? [cacheName] : [],
      open: async () => cache,
      delete: async name => { deleted.push(name); entries.clear(); return true; }
    },
    fetch: async url => {
      fetchCount++;
      if (fetchCount === 2) throw new Error('Falha simulada na rede');
      return {
        status: 200, type: 'basic', redirected: false, url,
        headers: { get: () => 'text/html; charset=utf-8' },
        clone() { return this; },
        async text() { return '<title>Estúdio Coroado News 24H</title><main id="editorial"><button id="savePNG"></button></main>'; }
      };
    }
  });
  new vm.Script(source, { filename: 'sw.js' }).runInContext(context);
  const install = listeners.get('install');
  assert.equal(typeof install, 'function');
  let pending;
  install({ waitUntil(promise) { pending = promise; } });
  await assert.rejects(pending, /Falha simulada na rede/);
  assert.equal(fetchCount, 2, 'Falha precisa ocorrer após iniciar o pré-cache');
  assert.deepEqual(deleted, preexisting ? [] : [cacheName],
    preexisting ? 'Cache anterior não pode ser excluído' : 'Cache novo incompleto deve ser removido');
}

await scenario(true);
await scenario(false);
console.log('Service worker: rollback preserva cache existente e limpa cache novo incompleto.');

async function skipWaitingFailure(preexisting) {
  const listeners = new Map();
  const cacheName = source.match(/const CACHE='([^']+)'/)?.[1];
  const entries = new Map();
  const deleted = [];
  const existingUrl = new URL('./index.html', scope).href;
  if (preexisting) entries.set(existingUrl, { status:200, type:'basic', redirected:false,
    url:existingUrl, headers:{get:()=> 'text/html'}, clone(){return this;},
    text:async()=>'<title>Estúdio Coroado News 24H</title><main id="editorial"><button id="savePNG"></button></main>' });
  const initial = new Map(entries);
  const cache = {
    match: async url => entries.get(url),
    put: async (url,response) => { entries.set(url,response); },
    delete: async url => { deleted.push(url); return entries.delete(url); }
  };
  const responseFor = url => {
    const ext = new URL(url).pathname;
    const type = ext.endsWith('.webp')?'image/webp':ext.endsWith('.png')?'image/png':
      ext.endsWith('.svg')?'image/svg+xml':ext.endsWith('.webmanifest')?'application/manifest+json':'text/html';
    return {status:200,type:'basic',redirected:false,url,headers:{get:()=>type},
      clone(){return this;},async text(){return '<title>Estúdio Coroado News 24H</title><main id="editorial"><button id="savePNG"></button></main>'}};
  };
  const context=vm.createContext({
    URL,Set,Array,console:{error(){},warn(){}},
    self:{registration:{scope},addEventListener:(name,fn)=>listeners.set(name,fn),
      skipWaiting:async()=>{throw Error('Falha simulada no skipWaiting')}},
    caches:{keys:async()=>preexisting?[cacheName]:[],open:async()=>cache,
      delete:async name=>{assert.equal(name,cacheName);entries.clear();return true}},
    fetch:async url=>responseFor(url)
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  listeners.get('install')({waitUntil(promise){pending=promise}});
  await assert.rejects(pending,/Falha simulada no skipWaiting/);
  assert.deepEqual([...entries.keys()], [...initial.keys()],
    'Falha ao ativar não pode deixar novos recursos no cache');
  assert.ok(!preexisting || deleted.length>0,'Cache existente deve reverter os recursos novos');
}
await skipWaitingFailure(true);
await skipWaitingFailure(false);
console.log('Service worker: falha em skipWaiting reverte pré-cache novo e preserva cache existente.');
