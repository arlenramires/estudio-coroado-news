import fs from 'node:fs';
import path from 'node:path';

// Regressão de instalação: o manifesto só pode apontar para arquivos locais
// existentes, dentro da pasta do Estúdio (sem fuga por ../ ou URL remota).
// Os arquivos de entrada também precisam ser arquivos regulares, não atalhos
// para conteúdo externo ao pacote privado.
for(const entry of ['index.html','manifest.webmanifest']){
  const stat=fs.lstatSync(entry,{throwIfNoEntry:false});
  if(!stat?.isFile()||stat.isSymbolicLink())
    throw new Error('Arquivo de entrada PWA ausente ou simbólico: '+entry);
}
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const local=(value,label)=>{
  if(typeof value!=='string'||!value||value.startsWith('/')||value.startsWith('\\')||value.includes('\\')||/%[0-9a-f]{2}/i.test(value)||/[?#]/.test(value)||/^[a-z][a-z\d+.-]*:/i.test(value)||value.startsWith('//'))
    throw new Error(label+': caminho não local: '+value);
  // Rejeitar segmentos internos . e .. antes de normalizar: URLs podem ser
  // interpretadas de modo diferente pelo navegador e pelo filesystem.
  const segments=value.split('/');
  if(segments.some((segment,index)=>segment===''||segment==='..'||(segment==='.'&&index!==0)))
    throw new Error(label+': segmentos de caminho ambíguos: '+value);
  // Não permitir barras duplicadas ou finais: o navegador pode interpretar URLs\n  // de forma distinta do filesystem e mascarar caminhos de instalação.\n  const normalized=path.posix.normalize(value);
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
  if(!target.startsWith('icons/'))throw new Error('Ícone fora do diretório icons: '+target);
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
