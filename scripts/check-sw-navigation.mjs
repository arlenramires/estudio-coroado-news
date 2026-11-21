import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Regressão: navegação não deve armazenar página de login/erro com HTTP 200.
const scope='https://studio.example.test/';
const handlers=new Map();
const writes=[];
let networkHtml='<html><title>Login</title><main>Entre na conta</main></html>';
let networkFails=false;
let networkStatus=200;
let networkRedirected=false;
let networkType='basic';
const validHtml='<!doctype html><title>Estúdio Coroado News 24H</title><main id="editorial"></main><button id="savePNG">PNG</button>';
const response=(url,html)=>({
  url,status:networkStatus,type:networkType,redirected:networkRedirected,
  headers:{get:key=>key.toLowerCase()==='content-type'?'text/html':null},
  clone(){return response(url,html)},
  async text(){return html}
});
const cache={
  async match(){return response(scope+'index.html',validHtml)},
  async put(req,res){writes.push({url:typeof req==='string'?req:req.url,html:await res.text()})}
};
const context=vm.createContext({
  URL,
  self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
  caches:{open:async()=>cache},
  fetch:async req=>{if(networkFails)throw new Error('offline');return response(req.url,networkHtml)},
  Response:{error:()=>({status:0})}
});
new vm.Script(fs.readFileSync('sw.js','utf8'),{filename:'sw.js'}).runInContext(context);
const fetchHandler=handlers.get('fetch');
async function navigate(url){
  let promise;
  fetchHandler({request:{url,method:'GET',mode:'navigate',headers:{has:()=>false}},respondWith:p=>{promise=p}});
  assert.ok(promise,'Navegação não interceptada');
  return promise;
}
const login=await navigate(scope);
assert.equal(await login.text(),validHtml,'Página de login deve cair no editor offline válido');
assert.equal(writes.length,0,'Página de login não pode substituir editor no cache');
networkHtml=validHtml;
const valid=await navigate(scope+'index.html');
assert.equal(await valid.text(),validHtml);
assert.equal(writes.length,1,'Editor válido deve atualizar cache');
// HTTP 302/redirect e respostas opacas não podem substituir o editor offline.
networkStatus=302;
const redirected=await navigate(scope);
assert.equal(await redirected.text(),validHtml,'Redirecionamento não deve substituir editor offline');
assert.equal(writes.length,1,'Redirecionamento não deve gravar cache');
networkStatus=200;
networkRedirected=true;
const redirected200=await navigate(scope);
assert.equal(await redirected200.text(),validHtml,'Resposta redirecionada HTTP 200 deve cair no cache');
assert.equal(writes.length,1,'Resposta redirecionada HTTP 200 não deve gravar cache');
networkRedirected=false;
networkType='opaque';
const opaque=await navigate(scope);
assert.equal(await opaque.text(),validHtml,'Resposta opaca deve cair no editor offline');
assert.equal(writes.length,1,'Resposta opaca não deve gravar cache');
networkType='basic';
networkFails=true;
const offline=await navigate(scope);
assert.equal(await offline.text(),validHtml,'Navegação offline deve manter editor');
assert.equal(writes.length,1,'Falha de rede não deve alterar cache');
console.log('Navegação PWA: login rejeitado, editor atualizado e fallback offline preservado.');
