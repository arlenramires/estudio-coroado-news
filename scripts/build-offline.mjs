import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const paths=[...new Set([...html.matchAll(/"src":"(molduras\/original_\d{2}\.webp)"/g)].map(m=>m[1]))];
if(paths.length!==22)throw Error('Esperadas 22 molduras, encontradas '+paths.length);
for(const asset of paths){
  const data='data:image/webp;base64,'+fs.readFileSync(path.join(root,asset)).toString('base64');
  html=html.replaceAll('"src":"'+asset+'"','"src":"'+data+'"');
}
html=html.replace(/<link rel="manifest"[^>]*>/,'').replace(/<link rel="icon"[^>]*>/,'');
const out=path.join(root,'dist','Estudio_Coroado_Offline.html');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,html);
if(html.includes('"src":"molduras/'))throw Error('Moldura externa restante');
console.log('HTML único para PC e celular:',out,fs.statSync(out).size,'bytes; 22 molduras incorporadas.');
