// Regressão: controles escritos apenas em scripts/estilos não são elementos do editor.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
const url=scope+'index.html';
const title='<title>Estúdio Coroado News 24H</title>';
const variants=[
  title+'<script>const fake = \'<div id="editorial"></div><button id="savePNG"></button>\';</script>',
  title+'<style>/* <div id="editorial"></div><button id="savePNG"></button> */</style>',
  title+'<div id="editorial"></div><script>const fake = \'<button id="savePNG"></button>\';</script>'
];
for(const html of variants){
  const handlers=new Map();
  const cached={marker:'valid-cached-editor'};
  let writes=0;
  const response={status:200,type:'basic',url,headers:{get:()=> 'text/html'},clone(){return {text:async()=>html}}};
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn)},
    caches:{open:async()=>({match:async()=>cached,put:async()=>{writes++}})},
    fetch:async()=>response,
    Response:{error:()=>({status:0})}
  });
  new vm.Script(source,{filename:'sw.js'}).runInContext(context);
  let pending;
  handlers.get('fetch')({request:{url,method:'GET',mode:'navigate',headers:{has:()=>false}},respondWith:p=>pending=p});
  assert.equal(await pending,cached,'HTML sem controles reais substituiu editor offline');
  assert.equal(writes,0,'HTML falso contaminou cache');
}
console.log('PWA: controles falsos em script/style não substituem o editor.');
