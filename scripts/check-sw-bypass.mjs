import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// O PWA privado nunca intercepta uploads, solicitações parciais ou URLs
// desconhecidas. Isso evita armazenar mídia do usuário e respostas incompletas.
const source=fs.readFileSync('sw.js','utf8');
const scope='http://127.0.0.1:8765/';
const cases=[
  {name:'POST para moldura',url:scope+'molduras/original_01.webp',method:'POST',range:false},
  {name:'Range para moldura',url:scope+'molduras/original_01.webp',method:'GET',range:true},
  {name:'URL com parâmetro',url:scope+'molduras/original_01.webp?token=privado',method:'GET',range:false},
  {name:'arquivo importado',url:scope+'midia-pessoal.mp4',method:'GET',range:false},
  {name:'origem externa',url:'https://example.org/index.html',method:'GET',range:false}
];
for(const test of cases){
  const listeners=new Map();
  let intercepted=false,networkCalls=0,cacheCalls=0;
  const context=vm.createContext({
    URL,console:{warn(){}},
    self:{registration:{scope},addEventListener:(name,fn)=>listeners.set(name,fn)},
    caches:{open:async()=>{cacheCalls++;throw new Error('Não deve acessar cache')}},
    fetch:async()=>{networkCalls++;throw new Error('Não deve buscar rede')},
    Response:{error:()=>({ok:false})}
  });
  new vm.Script(source).runInContext(context);
  listeners.get('fetch')({
    request:{url:test.url,method:test.method,mode:'no-cors',headers:{has:key=>key.toLowerCase()==='range'&&test.range}},
    respondWith:()=>{intercepted=true}
  });
  assert.equal(intercepted,false,test.name+' foi interceptado');
  assert.equal(networkCalls,0,test.name+' acionou fetch');
  assert.equal(cacheCalls,0,test.name+' acessou cache');
}
console.log('PWA: POST, Range, parâmetros, mídia pessoal e origens externas não são interceptados.');
