import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve('dist/Estudio-Coroado-Privado');
const manifest=path.join(root,'SHA256SUMS.txt');
if(!fs.existsSync(manifest))throw Error('Pacote sem SHA256SUMS.txt');
const lines=fs.readFileSync(manifest,'utf8').trim().split(/\r?\n/);
const listed=new Set();
for(const line of lines){
  const match=/^([a-f0-9]{64})  (.+)$/.exec(line);
  if(!match)throw Error('Linha de checksum inválida: '+line);
  const [,expected,relative]=match;
  if(path.isAbsolute(relative)||relative.split('/').includes('..')||listed.has(relative))
    throw Error('Caminho inválido ou duplicado: '+relative);
  listed.add(relative);
  const file=path.join(root,relative);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw Error('Arquivo ausente: '+relative);
  const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(actual!==expected)throw Error('Checksum divergente: '+relative);
}
const files=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const absolute=path.join(dir,entry.name);
    if(entry.isDirectory())walk(absolute);
    else if(entry.isFile()&&absolute!==manifest)
      files.push(path.relative(root,absolute).split(path.sep).join('/'));
  }
}
walk(root);
for(const file of files)if(!listed.has(file))throw Error('Arquivo não registrado no checksum: '+file);
if(files.length!==listed.size)throw Error('Quantidade de arquivos divergente');
const offline=fs.readFileSync(path.join(root,'Estudio_Coroado_Offline.html'),'utf8');
const embedded=[...offline.matchAll(/"src":"data:image\/webp;base64,/g)].length;
if(embedded!==22)throw Error('HTML offline não incorpora exatamente 22 molduras: '+embedded);
if(/"src":"molduras\/original_/.test(offline))throw Error('HTML offline depende de molduras externas');
console.log('Entrega validada: '+files.length+' arquivos íntegros e 22 molduras incorporadas no HTML offline.');
