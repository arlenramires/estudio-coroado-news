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
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
if(manifest.display!=='standalone'||!manifest.icons?.length)throw new Error('Manifesto PWA incompleto');
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
  if(!sw.includes("'./"+expected+"'")&&!sw.includes("Array.from({length:22}"))throw new Error('Moldura ausente do pré-cache: '+expected);
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
if(!sw.includes('length:22'))throw new Error('Pré-cache não garante as 22 molduras');
for(const size of [192,512]){const b=fs.readFileSync('icons/studio-'+size+'.png');if(b.subarray(1,4).toString()!=='PNG'||b.readUInt32BE(16)!==size||b.readUInt32BE(20)!==size)throw new Error('Ícone PNG inválido: '+size)}
if(!sw.includes('cache.addAll(ASSETS)'))throw new Error('Pré-cache offline não configurado');
// Bloqueia publicação por Pages mesmo quando o workflow usa outro nome.
const workflowsDir='.github/workflows';
if(fs.existsSync(workflowsDir)){
  for(const name of fs.readdirSync(workflowsDir)){
    if(!/\.ya?ml$/i.test(name))continue;
    const workflow=fs.readFileSync(path.join(workflowsDir,name),'utf8');
    if(/actions\/deploy-pages(?:@|\b)|\bgithub-pages\b|\bpages:\s*write\b/i.test(workflow))
      throw new Error('Workflow de publicação pública não autorizado: '+name);
  }
}
if(fs.existsSync('.github/workflows/pages.yml'))throw new Error('Publicação pública não autorizada');
if(!html.includes('serviceWorker.register'))throw new Error('PWA não integrado ao editor');
if(!html.includes('id="offlineReady"')||!html.includes('id="videoCapability"'))throw new Error('Diagnóstico de offline/codec ausente');
console.log('Editor: JavaScript válido, '+new Set(sources).size+' molduras presentes, exportação implementada.');
