import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const catalog=JSON.parse(fs.readFileSync('molduras/catalogo-22.json','utf8'));
if(!Array.isArray(catalog.assets)||catalog.assets.length!==22)
  throw Error('Catálogo deve conter exatamente 22 molduras');
const ids=new Set(),targets=new Set(),digests=new Map();
for(const [index,asset] of catalog.assets.entries()){
  const expected=String(index+1).padStart(2,'0');
  if(asset.id!==expected)throw Error('ID fora de ordem: '+asset.id);
  if(ids.has(asset.id)||targets.has(asset.target))throw Error('Moldura duplicada: '+asset.id);
  ids.add(asset.id);targets.add(asset.target);
  if(asset.target!==`molduras/original_${expected}.webp`)
    throw Error('Caminho inesperado: '+asset.target);
  if(!Number.isInteger(asset.width)||asset.width<100||!Number.isInteger(asset.height)||asset.height<100)
    throw Error('Dimensões inválidas no catálogo: '+asset.id);
  const file=path.resolve(asset.target);
  if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())
    throw Error('Moldura deve ser arquivo regular, sem link simbólico: '+asset.target);
  const data=fs.readFileSync(file);
  const digest=createHash('sha256').update(data).digest('hex');
  if(digests.has(digest))throw Error('Molduras com conteúdo idêntico: '+digests.get(digest)+' e '+asset.target);
  digests.set(digest,asset.target);
  if(data.length<1024||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WEBP')
    throw Error('Arquivo WebP inválido: '+asset.target);
  const riffSize=data.readUInt32LE(4)+8;
  if(riffSize!==data.length)throw Error('WebP truncado ou com bytes extras: '+asset.target);
  let offset=12,foundImage=false;
  while(offset+8<=data.length){
    const kind=data.toString('ascii',offset,offset+4);
    const length=data.readUInt32LE(offset+4);
    const end=offset+8+length;
    if(end>data.length)throw Error('Chunk WebP truncado: '+asset.target);
    if(['VP8 ','VP8L','ANIM','ANMF'].includes(kind))foundImage=true;
    if(length%2 && (end>=data.length || data[end]!==0))
      throw Error('Padding RIFF ausente ou inválido: '+asset.target);
    offset=end+(length%2);
  }
  if(offset!==data.length||!foundImage)throw Error('WebP sem imagem válida: '+asset.target);
}
console.log('Integridade RIFF e catálogo: 22 molduras verificadas.');
