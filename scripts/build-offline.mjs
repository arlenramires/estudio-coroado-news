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
  // Recusa molduras vazias ou arquivos renomeados como WebP antes de empacotar.
  if(bytes.length<16||bytes.toString('ascii',0,4)!=='RIFF'||
     bytes.toString('ascii',8,12)!=='WEBP'||
     bytes.readUInt32LE(4)+8!==bytes.length)
    throw Error('Moldura WebP inválida ou truncada: '+asset);
  // Confere todos os chunks RIFF, inclusive padding de tamanho impar.
  // Um cabecalho RIFF correto nao garante que o WebP seja decodificavel.
  let offset=12;
  while(offset<bytes.length){
    if(offset+8>bytes.length)throw Error('Chunk WebP sem cabecalho completo: '+asset);
    const size=bytes.readUInt32LE(offset+4);
    const end=offset+8+size+(size%2);
    if(end>bytes.length)throw Error('Chunk WebP truncado ou sem padding: '+asset);
    offset=end;
  }
  if(offset!==bytes.length)throw Error('Chunks WebP nao cobrem o arquivo: '+asset);
  if(!['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16)))
    throw Error('Codec WebP nao reconhecido: '+asset);
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
// Só publicar o artefato depois de concluir todas as validações.
// Uma falha não pode deixar um HTML offline inválido em dist/.
if(html.includes('"src":"molduras/'))throw Error('Moldura externa restante');
const embedded=[...html.matchAll(/"src":"data:image\/webp;base64,([A-Za-z0-9+/=]+)"/g)];
if(embedded.length!==22)throw Error('HTML offline deve conter 22 imagens incorporadas, encontradas '+embedded.length);
for(let i=0;i<embedded.length;i++){
  const original=fs.readFileSync(path.join(root,paths[i]));
  if(!Buffer.from(embedded[i][1],'base64').equals(original))throw Error('Imagem offline divergente: '+paths[i]);
}
// O arquivo único deve continuar autossuficiente: nenhuma imagem, fonte, script
// ou folha de estilo pode depender de uma URL externa ou arquivo local ausente.
const resourceRefs=[...html.matchAll(/\b(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gi)]
  .map(match=>match[2]);
const unexpected=resourceRefs.filter(ref=>!ref.startsWith('data:')&&!ref.startsWith('#')&&!ref.startsWith('blob:'));
if(unexpected.length)throw Error('HTML offline contém recurso externo: '+unexpected.join(', '));
if(/<link\b[^>]*\brel\s*=\s*["']manifest["']/i.test(html))
  throw Error('HTML offline não pode depender de manifesto PWA');
if(/"src":"molduras\//.test(html))
  throw Error('HTML offline ainda referencia moldura no disco');
// Recursos indiretos em CSS e imports JS também quebram o uso offline.
// Examinar somente CSS real abaixo: varrer todo o HTML produz falsos positivos
// quando scripts contêm strings com `url(https://...)` ou `@import`.
// Referências CSS url(...) relativas (fontes, imagens e cursores) também
// quebram um HTML único, mesmo quando não são URLs HTTP.
const cssText=[
  ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(m=>m[1]),
  // Atributos style também podem carregar url() para arquivos não incorporados.
  ...[...html.matchAll(/\bstyle\s*=\s*(["'])(.*?)\1/gi)].map(m=>m[2])
].join('\n');
const cssUrls=[...cssText.matchAll(/\burl\s*\(\s*(["']?)([^)"']+)\1\s*\)/gi)]
  .map(match=>match[2].trim());
const externalCssUrls=cssUrls.filter(ref=>!ref.startsWith('data:')&&!ref.startsWith('blob:')&&!ref.startsWith('#'));
if(externalCssUrls.length)throw Error('HTML offline contém url() CSS externo: '+externalCssUrls.join(', '));
// Importações CSS relativas também exigem arquivos externos e invalidam o HTML único.
// Não basta bloquear URLs HTTP: @import './estilos.css' falharia sem internet.
if(/@import\s+(?:url\s*\(|["'])/i.test(cssText))
  throw Error('HTML offline contém @import CSS que depende de outro arquivo');
if(/\bimport\s*\(\s*['"`](?:https?:)?\/\//i.test(html))
  throw Error('HTML offline contém importação dinâmica remota');
if(/<script\b[^>]*\bsrc\s*=/i.test(html))
  throw Error('HTML offline contém script externo');
// Um elemento <base> altera a resolução de URLs e pode redirecionar recursos
// ou navegação para fora do arquivo local. Conteúdo incorporado também não
// pertence ao pacote único privado, mesmo quando usa srcdoc.
if(/<base\b/i.test(html))
  throw Error('HTML offline não pode definir base URL');
if(/<(?:iframe|frame|frameset|object|embed)\b/i.test(html))
  throw Error('HTML offline não pode incorporar documentos externos');
fs.mkdirSync(path.dirname(out),{recursive:true});
const temporary=out+'.tmp-'+process.pid;
try {
  fs.writeFileSync(temporary,html);
  fs.renameSync(temporary,out);
} finally {
  if(fs.existsSync(temporary))fs.unlinkSync(temporary);
}
console.log('HTML único para PC e celular:',out,fs.statSync(out).size,'bytes; 22 molduras incorporadas.');
