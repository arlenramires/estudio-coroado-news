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
console.log('Editor: JavaScript válido, '+new Set(sources).size+' molduras presentes, exportação implementada.');
