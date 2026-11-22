import fs from 'node:fs';
import path from 'node:path';

// Regressão de instalação: o manifesto só pode apontar para arquivos locais
// existentes, dentro da pasta do Estúdio (sem fuga por ../ ou URL remota).
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const local=(value,label)=>{
  if(typeof value!=='string'||!value||value.startsWith('/')||value.startsWith('\\')||value.includes('\\')||/[?#]/.test(value)||/^[a-z][a-z\d+.-]*:/i.test(value)||value.startsWith('//'))
    throw new Error(label+': caminho não local: '+value);
  const normalized=path.posix.normalize(value);
  if(normalized==='..'||normalized.startsWith('../'))
    throw new Error(label+': caminho fora do Estúdio: '+value);
  return normalized;
};
for(const field of ['id','start_url','scope'])local(manifest[field],field);
if(manifest.display!=='standalone')throw new Error('PWA deve abrir em modo standalone');
if(!Array.isArray(manifest.icons)||!manifest.icons.length)throw new Error('PWA sem ícones');
if(!fs.lstatSync('icons',{throwIfNoEntry:false})?.isDirectory()||fs.lstatSync('icons').isSymbolicLink())
  throw new Error('Diretório de ícones PWA ausente ou simbólico');
for(const icon of manifest.icons){
  const target=local(icon.src,'Ícone PWA');
  const stat=fs.lstatSync(target,{throwIfNoEntry:false});
  if(!stat?.isFile()||stat.isSymbolicLink())
    throw new Error('Ícone PWA ausente, inválido ou simbólico: '+target);
}
if(local(manifest.start_url,'start_url')!=='index.html')
  throw new Error('PWA deve iniciar no editor index.html');
const workerStat=fs.lstatSync('sw.js',{throwIfNoEntry:false});
if(!workerStat?.isFile()||workerStat.isSymbolicLink())
  throw new Error('Service worker ausente ou simbólico');
console.log('Manifesto PWA privado: caminhos locais, ícones presentes e início no editor.');
