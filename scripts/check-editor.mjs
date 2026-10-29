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
for(let i=1;i<=22;i++){const p='molduras/original_'+String(i).padStart(2,'0')+'.webp';if(!fs.existsSync(p))throw new Error('Moldura offline ausente: '+p)}
for(const size of [192,512]){const b=fs.readFileSync('icons/studio-'+size+'.png');if(b.subarray(1,4).toString()!=='PNG'||b.readUInt32BE(16)!==size||b.readUInt32BE(20)!==size)throw new Error('Ícone PNG inválido: '+size)}
if(!sw.includes('cache.addAll(ASSETS)'))throw new Error('Pré-cache offline não configurado');
if(fs.existsSync('.github/workflows/pages.yml'))throw new Error('Publicação pública não autorizada');
if(!html.includes('serviceWorker.register'))throw new Error('PWA não integrado ao editor');
console.log('Editor: JavaScript válido, '+new Set(sources).size+' molduras presentes, exportação implementada.');
