// Regressão funcional: o PWA privado não deve interceptar mídia, URLs
// parametrizadas ou requisições parciais, nem servir cache de terceiros.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('sw.js','utf8');
const listeners=new Map();
const scope='https://studio.example/private/';
const assets=new Map();
let networkCalls=0;
let serverUnavailable=false;
let serverErrorStatus=null;
let serverWrongMime=false;
const cache={
  match:async request=>assets.get(typeof request==='string'?new URL(request,scope).href:request.url),
  put:async(request,response)=>{assets.set(request.url,response)}
};
const context=vm.createContext({
  URL,Set,Array,
  self:{registration:{scope},addEventListener:(name,fn)=>listeners.set(name,fn)},
  caches:{open:async()=>cache},
  fetch:async request=>{networkCalls++;if(serverUnavailable)throw new Error('Falha de conexão simulada');
    if(serverErrorStatus!==null)return {ok:false,status:serverErrorStatus,type:'basic',url:request.url};
    return {ok:true,status:200,type:'basic',url:request.url,headers:{get:()=>serverWrongMime?'application/octet-stream':request.url.endsWith('.webp')?'image/webp':'text/html; charset=utf-8'},clone(){return this}}},
  Response:{error:()=>({error:true})}
});
new vm.Script(source,{filename:'sw.js'}).runInContext(context);
const handler=listeners.get('fetch');
assert.equal(typeof handler,'function');
const root=new URL('index.html',scope).href;
const request=(url,options={})=>({
  url,method:options.method||'GET',mode:options.mode||'same-origin',
  headers:{has:key=>key==='range'&&!!options.range}
});
async function dispatch(req){
  let response;
  handler({request:req,respondWith:promise=>{response=promise}});
  return response===undefined?null:await response;
}
for(const req of [
  request(root+'?token=private'),
  request('https://other.example/index.html'),
  request(root,{method:'POST'}),
  request(root,{range:true})
])assert.equal(await dispatch(req),null,'Requisição não autorizada interceptada');
assert.equal(networkCalls,0);
const first=await dispatch(request(root));
assert.equal(first.url,root);
assert.equal(networkCalls,1);
const second=await dispatch(request(root));
assert.equal(second.url,root);
assert.equal(networkCalls,2,'HTML deve tentar atualização online');
serverUnavailable=true;
const offline=await dispatch(request(root));
assert.equal(offline.url,root,'Falha de conexão deve usar editor já armazenado');
assert.equal(offline.ok,true,'Editor offline deve continuar utilizável após erro do servidor');
// A navegação pela raiz do escopo também deve abrir o editor offline.
const home=new URL('./',scope).href;
const offlineHome=await dispatch(request(home,{mode:'navigate'}));
assert.equal(offlineHome.url,root,'Navegação inicial deve recuperar index.html do cache');
assert.equal(offlineHome.ok,true,'Página inicial deve permanecer utilizável sem conexão');
assert.equal(networkCalls,4,'Cada navegação deve tentar atualização antes do fallback');
serverUnavailable=false;
// Um servidor pode responder 200 com bytes/tipo incorretos após uma publicação
// incompleta. Não substituir o editor offline válido por essa resposta.
serverWrongMime=true;
const invalidHtml=await dispatch(request(root));
assert.equal(invalidHtml.url,root,'HTML com MIME inválido deve recuperar o editor do cache');
assert.equal(invalidHtml.ok,true,'Resposta 200 inválida não pode quebrar o editor offline');
serverWrongMime=false;
serverUnavailable=false;
serverErrorStatus=503;
const httpError=await dispatch(request(root));
assert.equal(httpError.status,503,'Erro HTTP 503 legítimo não pode ser mascarado pelo cache');
assert.equal(networkCalls,6,'Erro HTTP deve ser obtido pela rede');
console.log('Service worker: fallback somente em falha de conexão e preservação de HTTP 503.');


// Regressão: quota esgotada ou armazenamento bloqueado não deve derrubar
// respostas válidas da rede (HTML e recursos gráficos).
{
  const listenersWithBrokenCache=new Map();
  let writes=0;
  const brokenCache={
    match:async()=>undefined,
    put:async()=>{writes++;throw new Error('QuotaExceededError')}
  };
  const testContext=vm.createContext({
    URL,Set,Array,console:{warn:()=>{}},
    self:{registration:{scope},addEventListener:(name,fn)=>listenersWithBrokenCache.set(name,fn)},
    caches:{open:async()=>brokenCache},
    fetch:async req=>({ok:true,status:200,type:'basic',url:req.url,headers:{get:()=>req.url.endsWith('.webp')?'image/webp':'text/html; charset=utf-8'},clone(){return this}}),
    Response:{error:()=>({error:true})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(testContext);
  const fetchHandler=listenersWithBrokenCache.get('fetch');
  async function fetchThroughWorker(req){
    let result;
    fetchHandler({request:req,respondWith:promise=>{result=promise}});
    assert.ok(result,'Recurso autorizado deve ser interceptado');
    return await result;
  }
  const html=await fetchThroughWorker(request(root,{mode:'navigate'}));
  assert.equal(html.status,200,'Falha ao gravar HTML não pode descartar resposta da rede');
  const frame=new URL('molduras/original_01.webp',scope).href;
  const image=await fetchThroughWorker(request(frame));
  assert.equal(image.status,200,'Falha ao gravar moldura não pode descartar resposta da rede');
  assert.equal(image.url,frame);
  assert.equal(writes,2,'Ambos os caminhos devem tentar gravar no cache');
  console.log('Service worker: respostas HTML e moldura preservadas quando cache.put falha.');
}
