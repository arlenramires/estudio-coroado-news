import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
// Executa também a validação profunda de CRC/chunks dos ícones PWA em toda
// execução do check-editor (local e CI), sem depender de etapa separada.
import './check-png-integrity.mjs';
import './check-manifest-private.mjs';
import './check-sw-private.mjs';
import './check-sw-boundaries.mjs';
import './check-sw-partial-response.mjs';
import './check-sw-mime.mjs';
import './check-sw-manifest-json.mjs';
import './check-sw-bypass.mjs';
import './check-sw-allowlist.mjs';
const html=fs.readFileSync('index.html','utf8');
// O diagnóstico offline também deve informar a quantidade correta de molduras.
if(!html.includes('Cache offline preparado: 22 molduras disponíveis sem internet neste navegador.'))
  throw new Error('Diagnóstico offline deve informar exatamente 22 molduras');
// O contador visível deve acompanhar o catálogo real; evita voltar a anunciar 23 molduras.
if(!/<h3>22 molduras disponíveis<\/h3>/.test(html))
  throw new Error('Contador visível de molduras deve indicar exatamente 22');
// Privacidade: o editor privado não pode carregar scripts, estilos, imagens ou
// fontes de terceiros. Uma dependência remota quebraria o uso offline e poderia
// transmitir informações de acesso a um servidor externo.
const remoteAttributes=[...html.matchAll(/\b(?:src|href|poster|action)\s*=\s*(["'])(.*?)\1/gi)]
  .map(match=>match[2]).filter(value=>/^(?:https?:)?\/\//i.test(value));
if(remoteAttributes.length)throw new Error('Recurso remoto não autorizado no editor privado: '+remoteAttributes.join(', '));
if(/<script\b[^>]*\bsrc\s*=/i.test(html))
  throw new Error('JavaScript externo não autorizado: manter editor autossuficiente e offline');
if(/<link\b[^>]*\brel\s*=\s*["'](?:stylesheet|preload|modulepreload)["']/i.test(html))
  throw new Error('Estilos ou módulos externos não autorizados no editor privado');
// Proteção adicional: CSS remoto e importações de código não podem contornar
// a verificação de atributos HTML, pois o Estúdio precisa funcionar offline.
const remoteCss=[...html.matchAll(/(?:@import\s+(?:url\s*\(\s*)?|url\s*\(\s*)["']?\s*((?:https?:)?\/\/[^\s"') ;]+)/gi)].map(m=>m[1]);
if(remoteCss.length)throw new Error('Dependência CSS remota não autorizada: '+remoteCss.join(', '));
if(/\bimport\s*\(\s*["'](?:https?:)?\/\//i.test(html))
  throw new Error('Importação dinâmica remota não autorizada');
// O editor privado não deve abrir canais de telemetria nem enviar mídia para servidores.
// Verifica chamadas de rede explícitas dentro do JavaScript incorporado.
const inlineCode=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const forbiddenNetwork=[
  /\b(?:new\s+)?(?:WebSocket|EventSource)\s*\(/,
  /\b(?:navigator\.)?sendBeacon\s*\(/,
  /\bfetch\s*\(\s*['"`]\s*(?:https?:)?\/\//i,
  /\.open\s*\(\s*['"`](?:GET|POST|PUT|PATCH|DELETE)['"`]\s*,\s*['"`]\s*(?:https?:)?\/\//i
];
if(forbiddenNetwork.some(pattern=>pattern.test(inlineCode)))
  throw new Error('Canal de rede ou envio remoto não autorizado no editor privado');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
if(!scripts.length)throw new Error('Editor sem JavaScript');
for(const [i,m] of scripts.entries()){new vm.Script(m[1],{filename:'index-inline-'+i+'.js'});}
const sources=[...html.matchAll(/molduras\/[a-zA-Z0-9_.-]+\.(?:webp|png|jpg)/g)].map(m=>m[0]);
const missing=[...new Set(sources)].filter(p=>!fs.existsSync(p));
if(missing.length)throw new Error('Molduras ausentes: '+missing.join(', '));
for(const p of new Set(sources)){const b=fs.readFileSync(p);if(b.length<1000)throw new Error('Imagem vazia: '+p);if(p.endsWith('.png')&&b.subarray(1,4).toString()!=='PNG')throw new Error('PNG inválido: '+p);if(p.endsWith('.webp')&&b.subarray(8,12).toString()!=='WEBP')throw new Error('WebP inválido: '+p);}
// Regressão PNG: o arquivo precisa ser gerado explicitamente como PNG e não pode
// ser entregue se uma exportação antiga terminar após uma nova solicitação.
if(!/canvas\.toBlob\(blob=>\{[\s\S]*?\},'image\/png'\)/.test(html))
  throw new Error('Exportação PNG deve usar Canvas.toBlob com MIME image/png');
if(!/const generation=\+\+pngGeneration/.test(html)||!/if\(generation!==pngGeneration\)return/.test(html))
  throw new Error('Exportação PNG deve descartar callbacks de gerações anteriores');
if(!/if\(!blob\)\{status\('Falha ao gerar PNG\./.test(html))
  throw new Error('Exportação PNG deve rejeitar blob vazio');
if(!html.includes("captureStream")||!html.includes("MediaRecorder"))throw new Error('Exportação de vídeo ausente');
// Com áudio habilitado, oferecer MP4 nativo com AAC antes do fallback WebM.
// Sem essa ordem, navegadores capazes de MP4 geravam sempre WebM com áudio.
if(!/const mimes=\$\('audio'\)\.checked\?\['video\/mp4;codecs=avc1\.42E01E,mp4a\.40\.2','video\/mp4','video\/webm;codecs=vp8,opus','video\/webm'\]/.test(html))
  throw new Error('Exportação com áudio deve tentar MP4 nativo antes do fallback WebM');
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
  // O validador não deve aceitar links simbólicos, mesmo que apontem para um WebP válido.
  // O pacote privado já os rejeita; esta checagem antecipa o erro antes dos testes de navegador.
  if(!fs.lstatSync(expected).isFile()||fs.lstatSync('molduras').isSymbolicLink())
    throw new Error('Moldura não regular ou diretório simbólico: '+expected);
  // Lê as dimensões reais do contêiner WebP (VP8, VP8L ou VP8X).
  // Impede que um arquivo trocado ou truncado passe só por existir no disco.
  const webp=fs.readFileSync(expected);
  if(webp.length<30||webp.toString('ascii',0,4)!=='RIFF'||webp.toString('ascii',8,12)!=='WEBP'||webp.readUInt32LE(4)+8!==webp.length)
    throw new Error('WebP corrompido ou tamanho RIFF incorreto: '+expected);
  // Valida toda a estrutura RIFF: chunks truncados, padding ausente e
  // comprimentos forjados não podem chegar ao pacote offline.
  let offset=12;
  while(offset<webp.length){
    if(offset+8>webp.length)throw new Error('Cabeçalho de chunk WebP truncado: '+expected);
    const length=webp.readUInt32LE(offset+4);
    const end=offset+8+length+(length%2);
    if(end>webp.length)throw new Error('Chunk WebP ultrapassa o arquivo: '+expected);
    offset=end;
  }
  if(offset!==webp.length)throw new Error('Estrutura de chunks WebP inválida: '+expected);
  const codec=webp.toString('ascii',12,16);
  let actualWidth,actualHeight;
  if(codec==='VP8X'){
    actualWidth=1+webp.readUIntLE(24,3);
    actualHeight=1+webp.readUIntLE(27,3);
  }else if(codec==='VP8L'){
    if(webp[20]!==0x2f)throw new Error('Assinatura VP8L inválida: '+expected);
    actualWidth=1+(((webp[22]&0x3f)<<8)|webp[21]);
    actualHeight=1+(((webp[24]&0x0f)<<10)|(webp[23]<<2)|((webp[22]&0xc0)>>6));
  }else if(codec==='VP8 '){
    if(webp[23]!==0x9d||webp[24]!==0x01||webp[25]!==0x2a)throw new Error('Assinatura VP8 inválida: '+expected);
    actualWidth=webp.readUInt16LE(26)&0x3fff;
    actualHeight=webp.readUInt16LE(28)&0x3fff;
  }else throw new Error('Codec WebP não reconhecido: '+expected);
  if(actualWidth!==asset.width||actualHeight!==asset.height)
    throw new Error('Dimensões reais da moldura divergem do catálogo: '+expected+' ('+actualWidth+'x'+actualHeight+')');
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
  // A área da manchete também deve ficar dentro do quadro original.
  // Evita exportações com texto invisível ou cortado após ajustes no catálogo.
  if(!Array.isArray(asset.title)||asset.title.length!==4||!asset.title.every(Number.isFinite))
    throw new Error('Área da manchete inválida: '+expected);
  const [tx,ty,tw,th]=asset.title;
  if(tx<0||ty<0||tw<=0||th<=0||tx+tw>asset.w||ty+th>asset.h)
    throw new Error('Manchete fora dos limites da moldura: '+expected);
  // Coordenadas do mascote são metadados de proteção visual: não redesenhar.
  if(!Array.isArray(asset.fish)||asset.fish.length!==4||!asset.fish.every(Number.isFinite))
    throw new Error('Metadados do mascote inválidos: '+expected);
  const [fx,fy,fw,fh]=asset.fish;
  if(fx<0||fy<0||fw<=0||fh<=0||fx+fw>asset.w||fy+fh>asset.h)
    throw new Error('Mascote fora dos limites da moldura: '+expected);
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
for(const size of [192,512]){const b=fs.readFileSync('icons/studio-'+size+'.png');if(b.length<24||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||b.readUInt32BE(16)!==size||b.readUInt32BE(20)!==size)throw new Error('Ícone PNG inválido: '+size)}
if(!sw.includes('cache.addAll(ASSETS)'))throw new Error('Pré-cache offline não configurado');
// O PWA pode permanecer online se o pré-cache falhar; não deve afirmar
// disponibilidade offline antes de todos os arquivos estarem armazenados.
if(!sw.includes('cache.addAll(ASSETS)')||!sw.includes('await self.skipWaiting()'))
  throw new Error('Instalação PWA não configurada');

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



// Uma falha de pré-cache não deve bloquear o editor online.
// A limpeza é tentada, mas falha de CacheStorage também é tolerada.
{
  const listeners=new Map();
  const operations=[];
  const fakeCaches={
    open:async()=>({addAll:async assets=>{
      operations.push('addAll:'+assets.length);
      throw new Error('falha simulada de download');
    }}),
    delete:async()=>{operations.push('delete');throw new Error('cache bloqueado')}
  };
  const worker={registration:{scope:'http://127.0.0.1:8765/'},
    addEventListener:(type,callback)=>listeners.set(type,callback),
    skipWaiting:async()=>{operations.push('skipWaiting')}};
  const context=vm.createContext({URL,self:worker,caches:fakeCaches,console:{warn(){}}});
  new vm.Script(sw,{filename:'sw.js'}).runInContext(context);
  let installation;
  listeners.get('install')({waitUntil:promise=>{installation=promise}});
  if(!installation)throw new Error('Instalação não aguarda tentativa de pré-cache');
  await installation;
  if(operations.join(',')!=='addAll:'+requiredPrecache.length+',delete,skipWaiting')
    throw new Error('Fallback online após falha do cache não funcionou: '+operations.join(','));
  console.log('Fallback online aprovado após falha de pré-cache e limpeza.');
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
if((sw.match(/response\.ok&&response\.status!==206&&response\.type==='basic'&&response\.url===req\.url/g)||[]).length!==2)
  throw new Error('Cache PWA deve rejeitar respostas redirecionadas ou de outra origem');


// Regressão de ativação: falha ao listar ou excluir caches antigos não pode
// impedir que o PWA assuma o controle do editor.
for(const failure of ['listagem','exclusao']){
  const listeners=new Map();
  const operations=[];
  const fakeCaches={
    keys:async()=>{operations.push('keys');if(failure==='listagem')throw new Error('CacheStorage bloqueado');return ['estudio-coroado-offline-v1','outro-app',vm.runInContext('CACHE',context)]},
    delete:async key=>{operations.push('delete:'+key);throw new Error('Exclusão bloqueada')}
  };
  const worker={
    registration:{scope:'http://127.0.0.1:8765/'},
    addEventListener:(type,callback)=>listeners.set(type,callback),
    clients:{claim:async()=>{operations.push('claim')}}
  };
  const context=vm.createContext({URL,self:worker,caches:fakeCaches,console:{warn(){}}});
  new vm.Script(sw,{filename:'sw.js'}).runInContext(context);
  let activation;
  listeners.get('activate')({waitUntil:promise=>{activation=promise}});
  if(!activation)throw new Error('Ativação não aguarda limpeza de cache');
  await activation;
  if(operations.at(-1)!=='claim')throw new Error('Ativação não assumiu controle após falha: '+failure);
  if(failure==='exclusao'&&operations.join(',')!=='keys,delete:estudio-coroado-offline-v1,claim')
    throw new Error('Ativação excluiu cache de outro app ou versão ativa: '+operations.join(','));
}
console.log('Ativação PWA aprovada com CacheStorage indisponível e exclusão bloqueada.');


// Regressão: uma resposta HTTP legítima (404/500) deve chegar ao usuário.
// O cache offline só substitui a rede quando há erro de conexão, nunca um HTTP de erro.
{
  const listeners=new Map();
  const target='http://127.0.0.1:8765/index.html';
  const request={url:target,method:'GET',mode:'navigate',headers:{has:()=>false}};
  const stale={status:200,marker:'stale'};
  const failure={status:404,marker:'network-404'};
  const worker={registration:{scope:'http://127.0.0.1:8765/'},
    addEventListener:(type,callback)=>listeners.set(type,callback)};
  const cache={match:async()=>stale,put:async()=>{throw new Error('HTTP 404 must not be cached')}};
  const context=vm.createContext({URL,self:worker,caches:{open:async()=>cache},
    fetch:async()=>failure,Response:{error:()=>({status:0})},console:{warn(){}}});
  new vm.Script(sw,{filename:'sw.js'}).runInContext(context);
  let responsePromise;
  listeners.get('fetch')({request,respondWith:promise=>{responsePromise=promise}});
  if(!responsePromise)throw new Error('Navegação do editor não foi interceptada');
  const response=await responsePromise;
  if(response!==failure)throw new Error('PWA ocultou erro HTTP com HTML antigo do cache');
  console.log('PWA preserva respostas HTTP de erro sem mascará-las com cache antigo.');
}
