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

for(let i=1;i<=22;i++){
  const name='molduras/original_'+String(i).padStart(2,'0')+'.webp';
  const buffer=fs.readFileSync(path.join(dir,name));
  if(buffer.length<32||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WEBP'||buffer.readUInt32LE(4)+8!==buffer.length)
    throw Error('Moldura inválida ou vazia: '+name);
}
// Confere a integridade estrutural dos ícones PNG instaláveis, além dos hashes.
// Um arquivo PNG com conteúdo errado e checksum recalculado não pode passar.
for(const size of [192,512]){
  const name='icons/studio-'+size+'.png';
  const buffer=fs.readFileSync(path.join(dir,name));
  const signature=Buffer.from([137,80,78,71,13,10,26,10]);
  if(buffer.length<33||!buffer.subarray(0,8).equals(signature)||
     buffer.toString('ascii',12,16)!=='IHDR'||
     buffer.readUInt32BE(16)!==size||buffer.readUInt32BE(20)!==size)
    throw Error('Ícone PNG inválido ou com dimensões incorretas: '+name);
}
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.webmanifest'),'utf8'));
if(manifest.display!=='standalone'||!manifest.start_url||!manifest.icons?.some(icon=>icon.sizes?.includes('192x192'))||!manifest.icons?.some(icon=>icon.sizes?.includes('512x512')))
  throw Error('Manifesto PWA sem instalação standalone e ícones obrigatórios');
const sw=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
if(!sw.includes('Array.from({length:22}')||!sw.includes('cache.addAll(ASSETS)'))
  throw Error('Service worker não garante pré-cache das 22 molduras');

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
