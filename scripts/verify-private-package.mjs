import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir=path.resolve('dist/Estudio-Coroado-Privado');
const checksumFile=path.join(dir,'SHA256SUMS.txt');
if(!fs.existsSync(checksumFile))throw Error('Pacote privado não gerado');
const lines=fs.readFileSync(checksumFile,'utf8').trim().split('\n');
const seen=new Set();
for(const line of lines){
  const match=/^([a-f0-9]{64})  (.+)$/.exec(line);
  if(!match)throw Error('Linha SHA256 inválida: '+line);
  const [,expected,relative]=match;
  if(relative.startsWith('/')||relative.includes('\\')||relative.split('/').includes('..')||seen.has(relative))
    throw Error('Caminho inseguro ou repetido: '+relative);
  seen.add(relative);
  const file=path.join(dir,relative);
  if(!fs.statSync(file).isFile())throw Error('Entrada não é arquivo: '+relative);
  const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(actual!==expected)throw Error('SHA256 divergente: '+relative);
}
const required=['index.html','manifest.webmanifest','sw.js','Estudio_Coroado_Offline.html',
  'Iniciar-PC-Windows.cmd','Iniciar-Android-Termux.sh','LEIA-ME-PRIMEIRO.txt',
  'icons/studio.svg','icons/studio-192.png','icons/studio-512.png',
  ...Array.from({length:22},(_,i)=>'molduras/original_'+String(i+1).padStart(2,'0')+'.webp')];
for(const file of required)if(!seen.has(file))throw Error('Arquivo obrigatório ausente: '+file);
function walk(folder){
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const absolute=path.join(folder,entry.name);
    if(entry.isSymbolicLink())throw Error('Link simbólico proibido no pacote: '+absolute);
    if(entry.isDirectory())walk(absolute);
    else if(entry.isFile()){
      const relative=path.relative(dir,absolute).split(path.sep).join('/');
      if(relative!=='SHA256SUMS.txt'&&!seen.has(relative))throw Error('Arquivo sem checksum: '+relative);
    }
  }
}
walk(dir);
const offline=fs.readFileSync(path.join(dir,'Estudio_Coroado_Offline.html'),'utf8');
if(!offline.includes('original_01')||!offline.includes('original_22'))
  throw Error('HTML offline não contém referências às molduras extremas');
console.log('Pacote privado verificado: '+seen.size+' arquivos íntegros, 22 molduras e nenhum arquivo extra.');
