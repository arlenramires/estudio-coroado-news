import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
if(!scripts.length)throw new Error('Editor sem JavaScript');
for(const [i,m] of scripts.entries()){new vm.Script(m[1],{filename:'index-inline-'+i+'.js'});}
const sources=[...html.matchAll(/molduras\/[a-zA-Z0-9_.-]+\.(?:webp|png|jpg)/g)].map(m=>m[0]);
const missing=[...new Set(sources)].filter(p=>!fs.existsSync(p));
if(missing.length)throw new Error('Molduras ausentes: '+missing.join(', '));
for(const p of new Set(sources)){const b=fs.readFileSync(p);if(b.length<1000)throw new Error('Imagem vazia: '+p);if(p.endsWith('.png')&&b.subarray(1,4).toString()!=='PNG')throw new Error('PNG inválido: '+p);if(p.endsWith('.webp')&&b.subarray(8,12).toString()!=='WEBP')throw new Error('WebP inválido: '+p);}
if(!html.includes("captureStream")||!html.includes("MediaRecorder"))throw new Error('Exportação de vídeo ausente');
// Em navegadores móveis, captureStream(0) pode lançar exceção mesmo com captura a 30 fps disponível.
if(!/try\{stream=recordCanvas\.captureStream\(0\)\}catch\(err\)\{[\s\S]*?stream=recordCanvas\.captureStream\(30\)\}/.test(html))
  throw new Error('Exportação deve usar captura a 30 fps se captureStream(0) falhar');
if(!/if\(!frameTrack\)throw new Error/.test(html))
  throw new Error('Exportação deve verificar se o navegador criou uma faixa de vídeo');
// Cancelamento durante preparação não deve deixar o vídeo original reproduzindo em segundo plano.
if(!/catch\(err\)\{recording=false;[\s\S]*?video\.pause\(\);setExportBusy\(false\)/.test(html))
  throw new Error('Falha/cancelamento de exportação deve pausar o vídeo original');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
if(manifest.display!=='standalone'||!manifest.icons?.length)throw new Error('Manifesto PWA incompleto');

if(manifest.start_url!=='./index.html'||manifest.scope!=='./'||manifest.id!=='./')
  throw new Error('PWA deve permanecer restrito ao diretório local do Estúdio');
const iconSources=new Set();
for(const icon of manifest.icons){
  if(typeof icon.src!=='string'||!/^icons\/[a-zA-Z0-9_.-]+\.(?:png|svg)$/.test(icon.src)||iconSources.has(icon.src))
    throw new Error('Ícone PWA inválido, externo ou duplicado: '+icon.src);
  if(!fs.existsSync(icon.src))throw new Error('Ícone PWA ausente: '+icon.src);
  if(icon.src.endsWith('.png')&&icon.type!=='image/png')throw new Error('MIME do ícone PNG incorreto: '+icon.src);
  if(icon.src.endsWith('.svg')&&icon.type!=='image/svg+xml')throw new Error('MIME do ícone SVG incorreto: '+icon.src);
  iconSources.add(icon.src);
}
for(const size of [192,512]){
  const src='icons/studio-'+size+'.png';
  if(!iconSources.has(src)||!manifest.icons.some(icon=>icon.src===src&&icon.sizes===size+'x'+size))
    throw new Error('Manifesto sem ícone instalável '+size+'x'+size);
}

const sw=fs.readFileSync('sw.js','utf8');new vm.Script(sw,{filename:'sw.js'});
const catalog=JSON.parse(fs.readFileSync('molduras/catalogo-22.json','utf8'));
if(!Array.isArray(catalog.assets)||catalog.assets.length!==22)throw new Error('Catálogo deve conter exatamente 22 molduras');
const catalogPaths=new Set();
for(let i=1;i<=22;i++){
  const expected='molduras/original_'+String(i).padStart(2,'0')+'.webp';
  const asset=catalog.assets[i-1];
  if(!asset||asset.id!==String(i).padStart(2,'0')||asset.target!==expected)throw new Error('Catálogo fora de ordem ou caminho incorreto: '+expected);
  if(typeof asset.name!=='string'||!asset.name.trim()||!Number.isInteger(asset.width)||asset.width<=0||!Number.isInteger(asset.height)||asset.height<=0)throw new Error('Metadados inválidos: '+expected);
  if(asset.status!=='publicado'||catalogPaths.has(asset.target))throw new Error('Moldura duplicada ou não publicada: '+expected);
  catalogPaths.add(asset.target);
  if(!fs.existsSync(expected))throw new Error('Moldura offline ausente: '+expected);
}
// Confere também o catálogo realmente utilizado pelo editor, não apenas os arquivos no disco.
const dataMatch=html.match(/const DATA\s*=\s*(\[[^;]*\]);/);
if(!dataMatch)throw new Error('Catálogo DATA do editor não encontrado');
let editorAssets;
try{editorAssets=JSON.parse(dataMatch[1]);}catch{throw new Error('Catálogo DATA do editor inválido')}
if(!Array.isArray(editorAssets)||editorAssets.length!==22)throw new Error('Editor deve oferecer exatamente 22 molduras');
const editorPaths=new Set();
for(let i=0;i<22;i++){
  const asset=editorAssets[i];
  const expected='molduras/original_'+String(i+1).padStart(2,'0')+'.webp';
  if(!asset||asset.src!==expected||editorPaths.has(asset.src))throw new Error('Moldura ausente, duplicada ou fora de ordem no editor: '+expected);
  if(typeof asset.name!=='string'||!asset.name.trim())throw new Error('Nome ausente no editor: '+expected);
  const catalogAsset=catalog.assets[i];
  if(asset.name!==catalogAsset.name||asset.w!==catalogAsset.width||asset.h!==catalogAsset.height)
    throw new Error('Editor e catálogo divergem em nome ou dimensões: '+expected);
  if(!Array.isArray(asset.box)||asset.box.length!==4||!asset.box.every(n=>Number.isFinite(n)))throw new Error('Área editável inválida: '+expected);
  if(!Number.isFinite(asset.w)||asset.w<=0||!Number.isFinite(asset.h)||asset.h<=0)throw new Error('Dimensões inválidas no editor: '+expected);
  // A janela da foto/vídeo deve caber inteiramente na moldura, sem coordenadas negativas.
  const [x,y,width,height]=asset.box;
  if(x<0||y<0||width<=0||height<=0||x+width>asset.w||y+height>asset.h)
    throw new Error('Janela de mídia fora dos limites da moldura: '+expected);
  editorPaths.add(asset.src);
}
// Executa a declaração do service worker em um contexto isolado para verificar
// a lista real de pré-cache, sem depender de uma substring no código-fonte.
const swContext=vm.createContext({
  URL,
  self:{registration:{scope:'http://127.0.0.1:8765/'},addEventListener(){}}
});
new vm.Script(sw,{filename:'sw.js'}).runInContext(swContext);
const precache=Array.from(vm.runInContext('ASSETS',swContext));
const requiredPrecache=[
  './','./index.html','./manifest.webmanifest',
  './icons/studio.svg','./icons/studio-192.png','./icons/studio-512.png',
  ...Array.from({length:22},(_,i)=>'./molduras/original_'+String(i+1).padStart(2,'0')+'.webp')
];
if(precache.length!==requiredPrecache.length||
   new Set(precache).size!==precache.length||
   requiredPrecache.some(asset=>!precache.includes(asset)))
  throw new Error('Pré-cache PWA incompleto, duplicado ou divergente das 22 molduras');
for(const size of [192,512]){const b=fs.readFileSync('icons/studio-'+size+'.png');if(b.subarray(1,4).toString()!=='PNG'||b.readUInt32BE(16)!==size||b.readUInt32BE(20)!==size)throw new Error('Ícone PNG inválido: '+size)}
if(!sw.includes('cache.addAll(ASSETS)'))throw new Error('Pré-cache offline não configurado');
// Uma falha de download não pode deixar um cache de instalação parcialmente preenchido.
if(!/try\s*\{\s*await cache\.addAll\(ASSETS\)\s*\}\s*catch\s*\(error\)\s*\{\s*await caches\.delete\(CACHE\);\s*throw error\s*\}/.test(sw))
  throw new Error('Instalação offline deve eliminar cache parcial após falha');

// Bloqueia publicação por Pages mesmo quando o workflow usa outro nome.
const workflowsDir='.github/workflows';
if(fs.existsSync(workflowsDir)){
  for(const name of fs.readdirSync(workflowsDir)){
    if(!/\.ya?ml$/i.test(name))continue;
    const workflow=fs.readFileSync(path.join(workflowsDir,name),'utf8');
    if(/actions\/(?:deploy-pages|configure-pages|upload-pages-artifact)(?:@|\b)|\bgithub-pages\b|\bpages:\s*write\b|peaceiris\/actions-gh-pages|JamesIves\/github-pages-deploy-action|\bgh-pages\b/i.test(workflow))
      throw new Error('Workflow de publicação pública não autorizado: '+name);
  }
}
if(fs.existsSync('.github/workflows/pages.yml'))throw new Error('Publicação pública não autorizada');
if(!html.includes('serviceWorker.register'))throw new Error('PWA não integrado ao editor');
if(!html.includes('id="offlineReady"')||!html.includes('id="videoCapability"'))throw new Error('Diagnóstico de offline/codec ausente');
console.log('Editor: JavaScript válido, '+new Set(sources).size+' molduras presentes, exportação implementada.');

// Regressão: não afirmar que um vídeo conserva áudio quando a faixa de captura está ausente.
if(!html.includes('Áudio original solicitado, mas a captura de áudio não está disponível')||!html.includes('stream.getAudioTracks().length'))throw new Error('Proteção contra exportação silenciosa ausente');

// Regressão: a faixa pode morrer durante a gravação, mesmo após passar no teste inicial.
if(!/if\(\$\('audio'\)\.checked&&!stream\.getAudioTracks\(\)\.some\(t=>t\.readyState==='live'\)\)/.test(html))
  throw new Error('Exportação deve descartar arquivo quando áudio termina durante gravação');



// Teste funcional da instalação: uma falha no pré-cache deve apagar o cache
// incompleto e rejeitar a instalação, sem deixar um PWA aparentemente offline.
{
  const listeners=new Map();
  const operations=[];
  const fakeCaches={
    open:async name=>({addAll:async assets=>{
      operations.push('addAll:'+assets.length);
      throw new Error('falha simulada de download');
    }}),
    delete:async name=>{operations.push('delete:'+name);return true}
  };
  const worker={
    registration:{scope:'http://127.0.0.1:8765/'},
    addEventListener:(type,callback)=>listeners.set(type,callback),
    skipWaiting:async()=>{operations.push('skipWaiting')}
  };
  const context=vm.createContext({URL,self:worker,caches:fakeCaches});
  new vm.Script(sw,{filename:'sw.js'}).runInContext(context);
  const install=listeners.get('install');
  if(!install)throw new Error('Service worker sem evento install');
  let installation;
  install({waitUntil:promise=>{installation=promise}});
  if(!installation||typeof installation.then!=='function')
    throw new Error('Instalação não aguarda o pré-cache');
  let rejected=false;
  try{await installation}catch(error){rejected=String(error.message).includes('falha simulada')}
  if(!rejected||operations[0]!=='addAll:'+requiredPrecache.length||
     operations[1]!=='delete:estudio-coroado-offline-v32'||
     operations.includes('skipWaiting'))
    throw new Error('Instalação falha não removeu o cache parcial: '+operations.join(','));
  console.log('Rollback do pré-cache aprovado: instalação rejeitada e cache parcial apagado.');
}


// Teste funcional de instalação bem-sucedida: todos os arquivos essenciais
// precisam ser pré-carregados antes de liberar o controle ao novo service worker.
{
  const listeners=new Map();
  const operations=[];
  const fakeCaches={
    open:async name=>({addAll:async assets=>{
      operations.push('addAll:'+assets.length);
      if(assets.length!==requiredPrecache.length)throw new Error('Pré-cache incompleto');
    }}),
    delete:async name=>{operations.push('delete:'+name);return true}
  };
  const worker={
    registration:{scope:'http://127.0.0.1:8765/'},
    addEventListener:(type,callback)=>listeners.set(type,callback),
    skipWaiting:async()=>{operations.push('skipWaiting')}
  };
  const context=vm.createContext({URL,self:worker,caches:fakeCaches});
  new vm.Script(sw,{filename:'sw.js'}).runInContext(context);
  let installation;
  listeners.get('install')({waitUntil:promise=>{installation=promise}});
  if(!installation||typeof installation.then!=='function')
    throw new Error('Instalação bem-sucedida não aguardou o pré-cache');
  await installation;
  if(operations.join(',')!=='addAll:'+requiredPrecache.length+',skipWaiting')
    throw new Error('Instalação bem-sucedida não aguardou os arquivos: '+operations.join(','));
  console.log('Instalação offline aprovada: pré-cache completo antes de skipWaiting.');
}

// Cache privado não deve persistir redirecionamentos nem respostas de origem diferente.
if((sw.match(/response\.ok&&response\.type==='basic'&&response\.url===req\.url/g)||[]).length!==2)
  throw new Error('Cache PWA deve rejeitar respostas redirecionadas ou de outra origem');
