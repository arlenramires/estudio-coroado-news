import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve('dist/Estudio-Coroado-Privado');
const manifest=path.join(root,'SHA256SUMS.txt');
if(!fs.existsSync(manifest))throw Error('Pacote sem SHA256SUMS.txt');
if(fs.lstatSync(root).isSymbolicLink()||fs.lstatSync(manifest).isSymbolicLink())
  throw Error('Pacote ou manifesto não pode ser link simbólico');
const lines=fs.readFileSync(manifest,'utf8').trim().split(/\r?\n/);
const listed=new Set();
for(const line of lines){
  const match=/^([a-f0-9]{64})  (.+)$/.exec(line);
  if(!match)throw Error('Linha de checksum inválida: '+line);
  const [,expected,relative]=match;
  if(!relative||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(part=>part===''||part==='.'||part==='..')||listed.has(relative))
    throw Error('Caminho inválido ou duplicado: '+relative);
  listed.add(relative);
  const file=path.join(root,relative);
  let current=root;
  for(const part of relative.split('/')){
    current=path.join(current,part);
    if(!fs.existsSync(current))throw Error('Arquivo ausente: '+relative);
    if(fs.lstatSync(current).isSymbolicLink())throw Error('Link simbólico proibido: '+relative);
  }
  if(!fs.lstatSync(file).isFile())throw Error('Entrada não é arquivo: '+relative);
  const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(actual!==expected)throw Error('Checksum divergente: '+relative);
}
const files=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const absolute=path.join(dir,entry.name);
    if(entry.isSymbolicLink())throw Error('Link simbólico proibido no pacote: '+absolute);
    if(entry.isDirectory())walk(absolute);
    else if(entry.isFile()&&absolute!==manifest)
      files.push(path.relative(root,absolute).split(path.sep).join('/'));
  }
}
walk(root);
for(const file of files)if(!listed.has(file))throw Error('Arquivo não registrado no checksum: '+file);
if(files.length!==listed.size)throw Error('Quantidade de arquivos divergente');
const offline=fs.readFileSync(path.join(root,'Estudio_Coroado_Offline.html'),'utf8');
const embedded=[...offline.matchAll(/"src":"data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})"/g)];
if(embedded.length!==22)throw Error('HTML offline não incorpora exatamente 22 molduras: '+embedded.length);
for(const [index,match] of embedded.entries()){
  const encoded=match[1];
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length<30||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')
    throw Error('Moldura incorporada não é um WebP válido: '+(index+1));
  if(bytes.readUInt32LE(4)+8!==bytes.length)
    throw Error('Tamanho RIFF inconsistente na moldura: '+(index+1));
  if(!['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16)))
    throw Error('Chunk WebP inválido na moldura: '+(index+1));
}
if(/"src":"molduras\/original_/.test(offline))throw Error('HTML offline depende de molduras externas');
console.log('Entrega validada: '+files.length+' arquivos íntegros e 22 molduras incorporadas no HTML offline.');
