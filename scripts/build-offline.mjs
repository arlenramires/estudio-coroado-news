import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const paths=[...new Set([...html.matchAll(/"src":"(molduras\/original_\d{2}\.webp)"/g)].map(m=>m[1]))];
if(paths.length!==22)throw Error('Esperadas 22 molduras, encontradas '+paths.length);
const expected=Array.from({length:22},(_,i)=>'molduras/original_'+String(i+1).padStart(2,'0')+'.webp');
if(paths.some((asset,i)=>asset!==expected[i]))
  throw Error('Catálogo offline incompleto ou fora de ordem: '+paths.join(', '));
// O HTML offline deve ser produzido apenas a partir de molduras locais aprovadas.
const allFrameRefs=[...html.matchAll(/"src":"(molduras\/[^"]+)"/g)].map(m=>m[1]);
if(allFrameRefs.length!==22||allFrameRefs.some((asset,i)=>asset!==expected[i]))
  throw Error('Editor contém moldura externa, duplicada ou não aprovada');
for(const asset of paths){
  const bytes=fs.readFileSync(path.join(root,asset));
  const data='data:image/webp;base64,'+bytes.toString('base64');
  const token='"src":"'+asset+'"';
  if(!html.includes(token))throw Error('Moldura ausente no editor: '+asset);
  html=html.replaceAll(token,'"src":"'+data+'"');
  // Confere os bytes da imagem embutida, não apenas a quantidade de molduras.
  const decoded=Buffer.from(data.slice('data:image/webp;base64,'.length),'base64');
  if(!decoded.equals(bytes))throw Error('Moldura embutida diverge do original: '+asset);
}
html=html.replace(/<link rel="manifest"[^>]*>/,'').replace(/<link rel="icon"[^>]*>/,'');
const out=path.join(root,'dist','Estudio_Coroado_Offline.html');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,html);
if(html.includes('"src":"molduras/'))throw Error('Moldura externa restante');
const embedded=[...html.matchAll(/"src":"data:image\/webp;base64,([A-Za-z0-9+/=]+)"/g)];
if(embedded.length!==22)throw Error('HTML offline deve conter 22 imagens incorporadas, encontradas '+embedded.length);
for(let i=0;i<embedded.length;i++){
  const original=fs.readFileSync(path.join(root,paths[i]));
  if(!Buffer.from(embedded[i][1],'base64').equals(original))throw Error('Imagem offline divergente: '+paths[i]);
}
console.log('HTML único para PC e celular:',out,fs.statSync(out).size,'bytes; 22 molduras incorporadas.');
