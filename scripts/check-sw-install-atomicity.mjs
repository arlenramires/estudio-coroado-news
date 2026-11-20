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
async function scenario(existed,failAt,{invalidAt=Infinity,putFailAt=Infinity,httpFailAt=Infinity,redirectAt=Infinity,urlMismatchAt=Infinity,opaqueAt=Infinity,invalidCached=false}={}){
  const listeners=new Map();
  const stored=new Map(existed?[[cacheName,new Map([['sentinel','preserved'],[scope+'index.html','original-editor'],[scope+'molduras/original_01.webp','original-frame']])]]:[]);
  if(existed&&invalidCached)stored.get(cacheName).set(scope+'molduras/original_01.webp',{
    ...response(scope+'molduras/original_01.webp'),headers:{get:()=> 'text/html'}
  });
  let requests=0,puts=0,deleted=false,skipWaiting=false;
  const context=vm.createContext({
    URL,Set,Array,console:{error:()=>{},warn:()=>{}},
    self:{registration:{scope},addEventListener:(event,fn)=>listeners.set(event,fn),
      skipWaiting:async()=>{skipWaiting=true}},
    caches:{
      keys:async()=>[...stored.keys()],
      open:async name=>{if(!stored.has(name))stored.set(name,new Map());const items=stored.get(name);
        return {match:async url=>items.get(url),put:async(url,res)=>{puts++;if(puts===putFailAt)throw new Error('Falha simulada no cache.put');items.set(url,res)}}},
      delete:async name=>{deleted=true;return stored.delete(name)}
    },
    fetch:async url=>{requests++;if(requests===failAt)throw new Error('Falha simulada');return requests===invalidAt?{...response(url),headers:{get:()=> 'text/html'}}:requests===httpFailAt?{...response(url),status:503}:requests===redirectAt?{...response(url),redirected:true}:requests===urlMismatchAt?{...response(url),url:scope+'login'}:requests===opaqueAt?{...response(url),type:'opaque'}:response(url)}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  listeners.get('install')({waitUntil:p=>{pending=p}});
  assert.ok(pending,'install deve usar waitUntil');
  if(failAt!==Infinity||invalidAt!==Infinity||putFailAt!==Infinity||httpFailAt!==Infinity||redirectAt!==Infinity||urlMismatchAt!==Infinity||opaqueAt!==Infinity||invalidCached){
    await assert.rejects(pending, /Falha simulada|Recurso offline inválido|Falha simulada no cache\.put/);
  }else await pending;
  return {stored,deleted,skipWaiting,requests};
}
const old=await scenario(true,3);
assert.equal(old.stored.get(cacheName)?.get('sentinel'),'preserved','Cache preexistente não pode ser apagado');
assert.equal(old.stored.get(cacheName)?.get(scope+'index.html'),'original-editor','Instalação falha não pode sobrescrever HTML anterior');
assert.equal(old.stored.get(cacheName)?.get(scope+'molduras/original_01.webp'),'original-frame','Falha não pode sobrescrever moldura anterior');
assert.equal(old.deleted,false,'Instalação falha não deve apagar cache existente');
assert.equal(old.skipWaiting,false,'Instalação falha não deve assumir controle');
// Verificar todos os 28 pontos de falha, inclusive o primeiro e o último recurso.
// Uma instalação parcial nunca deve assumir controle nem apagar o cache anterior.
for(let failAt=1;failAt<=28;failAt++){
  for(const existed of [false,true]){
    const failed=await scenario(existed,failAt);
    assert.equal(failed.skipWaiting,false,'Falha no recurso '+failAt+' não deve ativar o worker');
    assert.equal(failed.stored.has(cacheName),existed,'Falha no recurso '+failAt+' deve preservar apenas cache preexistente');
    if(existed){
      assert.equal(failed.stored.get(cacheName).get(scope+'index.html'),'original-editor');
      assert.equal(failed.stored.get(cacheName).get(scope+'molduras/original_01.webp'),'original-frame');
    }
  }
}
const fresh=await scenario(false,3);
assert.equal(fresh.stored.has(cacheName),false,'Cache novo incompleto deve ser removido');
assert.equal(fresh.deleted,true);
assert.equal(fresh.skipWaiting,false);
// Uma resposta HTTP 200 com MIME errado não pode ser armazenada como moldura.
for(const existed of [false,true]){
  const invalid=await scenario(existed,Infinity,{invalidAt:7});
  assert.equal(invalid.skipWaiting,false,'Resposta inválida não deve ativar o worker');
  assert.equal(invalid.stored.has(cacheName),existed,'Falha de MIME deve preservar apenas cache preexistente');
  if(existed){
    assert.equal(invalid.stored.get(cacheName).get(scope+'index.html'),'original-editor');
    assert.equal(invalid.stored.get(cacheName).get(scope+'molduras/original_01.webp'),'original-frame');
  }
}
// Um servidor pode responder erro HTTP ou redirecionar para uma página de login.
// Nenhuma dessas respostas pode ativar o PWA ou destruir o editor já disponível offline.
for(const [failure,options] of [['HTTP 503',{httpFailAt:7}],['redirecionamento',{redirectAt:7}]]){
  for(const existed of [false,true]){
    const failed=await scenario(existed,Infinity,options);
    assert.equal(failed.skipWaiting,false,failure+' não deve ativar o worker');
    assert.equal(failed.stored.has(cacheName),existed,failure+' deve preservar apenas cache anterior');
    if(existed){
      assert.equal(failed.stored.get(cacheName).get(scope+'index.html'),'original-editor');
      assert.equal(failed.stored.get(cacheName).get(scope+'molduras/original_01.webp'),'original-frame');
    }
  }
}
// Uma resposta com URL trocada ou opaca não pode ser aceita como recurso offline.
for(const [failure,options] of [['URL divergente',{urlMismatchAt:7}],['resposta opaca',{opaqueAt:7}]]){
  for(const existed of [false,true]){
    const failed=await scenario(existed,Infinity,options);
    assert.equal(failed.skipWaiting,false,failure+' não deve ativar o worker');
    assert.equal(failed.stored.has(cacheName),existed,failure+' deve preservar o cache anterior');
    if(existed){
      assert.equal(failed.stored.get(cacheName).get(scope+'index.html'),'original-editor');
      assert.equal(failed.stored.get(cacheName).get(scope+'molduras/original_01.webp'),'original-frame');
    }
  }
}
// Exercitar falhas de gravação em todas as posições do pré-cache, não só na segunda.
// Se uma gravação falhar, o worker não pode assumir controle nem perder a versão anterior.
// O cache preexistente já contém HTML e a primeira moldura: são apenas 26 gravações novas.
// Testar 27/28 nessa situação não gera falha e produziria falso negativo na suíte.
for(const existed of [false,true]){
  for(let putFailAt=1;putFailAt<=(existed?26:28);putFailAt++){
    const failedPut=await scenario(existed,Infinity,{putFailAt});
    assert.equal(failedPut.skipWaiting,false,'Falha no cache.put '+putFailAt+' não deve ativar o worker');
    assert.equal(failedPut.stored.has(cacheName),existed,'Falha no cache.put '+putFailAt+' deve preservar somente cache preexistente');
    if(existed){
      assert.equal(failedPut.stored.get(cacheName).get(scope+'index.html'),'original-editor');
      assert.equal(failedPut.stored.get(cacheName).get(scope+'molduras/original_01.webp'),'original-frame');
      assert.equal(failedPut.stored.get(cacheName).get('sentinel'),'preserved');
    }
  }
}
const invalidCached=await scenario(true,Infinity,{invalidCached:true});
assert.equal(invalidCached.skipWaiting,false,'Moldura antiga com MIME inválido não pode ativar o worker');
assert.equal(invalidCached.deleted,false,'Falha de integridade não pode apagar o cache preexistente');
const existingSuccess=await scenario(true,Infinity);
assert.equal(existingSuccess.skipWaiting,true,'Cache existente completo deve permitir ativação');
assert.equal(existingSuccess.deleted,false,'Instalação bem-sucedida não deve apagar cache existente');
assert.equal(existingSuccess.stored.get(cacheName)?.get(scope+'index.html'),'original-editor',
  'Instalação bem-sucedida não deve sobrescrever HTML previamente armazenado');
assert.equal(existingSuccess.stored.get(cacheName)?.get(scope+'molduras/original_01.webp'),'original-frame',
  'Instalação bem-sucedida não deve sobrescrever moldura previamente armazenada');
assert.equal(existingSuccess.stored.get(cacheName)?.size,29,
  'Cache existente deve manter sentinela, HTML original e completar os outros 27 recursos');
const success=await scenario(false,Infinity);
assert.equal(success.skipWaiting,true,'Instalação completa deve ativar a atualização');
assert.equal(success.stored.get(cacheName)?.size,28,'Pré-cache deve incluir raiz, HTML, manifest, 3 ícones e 22 molduras');
console.log('Instalação offline: cache anterior preservado, cache novo incompleto removido e 22 molduras armazenadas.');
