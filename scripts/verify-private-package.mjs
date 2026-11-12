import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir=path.resolve('dist/Estudio-Coroado-Privado');
const checksumFile=path.join(dir,'SHA256SUMS.txt');
if(!fs.existsSync(checksumFile))throw Error('Pacote privado não gerado');
// O próprio diretório raiz também não pode redirecionar a verificação
// para fora de dist/ por meio de um link simbólico.
if(fs.lstatSync(dir).isSymbolicLink()||!fs.lstatSync(dir).isDirectory())
  throw Error('Diretório do pacote privado inválido ou link simbólico');
// Também rejeita redirecionamento por um ancestral (por exemplo dist/).
// A raiz final pode ser uma pasta normal enquanto o caminho completo escapa
// do diretório de trabalho por meio de um link simbólico intermediário.
let ancestor=dir;
while(true){
  const parent=path.dirname(ancestor);
  if(parent===ancestor)break;
  ancestor=parent;
  if(fs.lstatSync(ancestor).isSymbolicLink())
    throw Error('Diretório ancestral do pacote é link simbólico: '+ancestor);
}
if(fs.lstatSync(checksumFile).isSymbolicLink())throw Error('Lista SHA256 não pode ser link simbólico');
const lines=fs.readFileSync(checksumFile,'utf8').trim().split('\n');
const seen=new Set();
for(const line of lines){
  const match=/^([a-f0-9]{64})  (.+)$/.exec(line);
  if(!match)throw Error('Linha SHA256 inválida: '+line);
  const [,expected,relative]=match;
  if(!relative||relative.startsWith('/')||relative.includes('\\')||relative.split('/').some(part=>part===''||part==='.'||part==='..')||seen.has(relative))
    throw Error('Caminho inseguro ou repetido: '+relative);
  seen.add(relative);
  const file=path.join(dir,relative);
  // Não siga links simbólicos nem nos diretórios intermediários: um checksum
  // válido não autoriza ler arquivos fora do pacote extraído.
  let current=dir;
  for(const part of relative.split('/')){
    current=path.join(current,part);
    const info=fs.lstatSync(current);
    if(info.isSymbolicLink())throw Error('Link simbólico proibido: '+relative);
  }
  if(!fs.lstatSync(file).isFile())throw Error('Entrada não é arquivo: '+relative);
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
// Impede que um manifesto alterado carregue ícones de uma origem remota.
const allowedIcons=new Set(['icons/studio.svg','icons/studio-192.png','icons/studio-512.png']);
for(const icon of manifest.icons||[]){
  if(typeof icon.src!=='string'||!allowedIcons.has(icon.src.replace(/^\.\//,'')))
    throw Error('Ícone externo ou inesperado no manifesto: '+String(icon.src));
}
for(const size of [192,512]){
  if(!manifest.icons.some(icon=>icon.src.replace(/^\.\//,'')==='icons/studio-'+size+'.png'&&icon.sizes?.split(/\s+/).includes(size+'x'+size)))
    throw Error('Ícone PNG local obrigatório ausente do manifesto: '+size);
}
const sw=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
// O pré-cache atual valida status, MIME e URL antes de cache.put().
// Não exigir cache.addAll(): esse método não valida o tipo de cada resposta.
if(!sw.includes('Array.from({length:22}')||
   !/for\\s*\\(const\\s+asset\\s+of\\s+ASSETS\\)/.test(sw)||
   !/await\\s+fetch\\(url,\\s*\\{cache:\\s*'no-store'\\}\\)/.test(sw)||
   !/await\\s+cache\\.put\\(url,\\s*response\\)/.test(sw)||
   !sw.includes("asset.endsWith('.webp')?'image/webp'")||
   !sw.includes('response.status!==200')||
   !sw.includes('!validType'))
  throw Error('Service worker não garante pré-cache validado das 22 molduras');

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
// Os iniciadores distribuídos não podem expor o servidor à rede local.
// Um bind em 0.0.0.0 (ou sem bind explícito) tornaria as mídias acessíveis
// a outros dispositivos na mesma rede durante a edição.
const windows=fs.readFileSync(path.join(dir,'Iniciar-PC-Windows.cmd'),'utf8');
const android=fs.readFileSync(path.join(dir,'Iniciar-Android-Termux.sh'),'utf8');
if(!windows.includes("('127.0.0.1',8765)")||
   !android.includes('--bind 127.0.0.1')||
   /(?:0\.0\.0\.0|--bind\s+(?:::|0\.0\.0\.0)|\('::',\s*8765\))/.test(windows+'\\n'+android))
  throw Error('Iniciador privado não restringe o servidor a localhost');
if(!windows.includes('cd /d "%~dp0"')||!android.includes('cd "$(dirname "$0")"'))
  throw Error('Iniciador não funciona em pasta com espaços');
const offline=fs.readFileSync(path.join(dir,'Estudio_Coroado_Offline.html'),'utf8');
// Confere os bytes incorporados, não apenas menções aos nomes das molduras.
// Uma página offline pode citar as 22 molduras e ainda estar sem as imagens.
const embedded=[...offline.matchAll(/"src":"data:image\/webp;base64,([A-Za-z0-9+/=]+)"/g)];
if(embedded.length!==22)throw Error('HTML offline deve incorporar exatamente 22 imagens WebP: '+embedded.length);
// A ordem visual é parte do catálogo aprovado: um pacote com as mesmas
// 22 imagens, mas permutadas, exibiria a moldura errada para cada editoria.
for(let i=0;i<embedded.length;i++){
  const expected=fs.readFileSync(path.join(dir,'molduras/original_'+String(i+1).padStart(2,'0')+'.webp'));
  const actual=Buffer.from(embedded[i][1],'base64');
  if(!actual.equals(expected))
    throw Error('Ordem ou conteúdo da moldura offline divergente na posição '+(i+1));
}
const embeddedHashes=new Map();
for(const match of embedded){
  const encoded=match[1];
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.toString('base64')!==encoded||bytes.length<32||
     bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')
    throw Error('Moldura incorporada inválida no HTML offline');
  const digest=crypto.createHash('sha256').update(bytes).digest('hex');
  embeddedHashes.set(digest,(embeddedHashes.get(digest)||0)+1);
}
for(let i=1;i<=22;i++){
  const name='molduras/original_'+String(i).padStart(2,'0')+'.webp';
  const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex');
  const count=embeddedHashes.get(digest)||0;
  if(!count)throw Error('Moldura não incorporada ou divergente no HTML offline: '+name);
  embeddedHashes.set(digest,count-1);
}
if([...embeddedHashes.values()].some(count=>count!==0))
  throw Error('HTML offline contém molduras duplicadas ou desconhecidas');
// O iniciador Android precisa ser sintaticamente válido no shell POSIX do Termux.
// Um erro de aspas pode deixar o pacote instalável no PC, mas inutilizável no telefone.
import {spawnSync} from 'node:child_process';
const shellCheck=spawnSync('sh',['-n',path.join(dir,'Iniciar-Android-Termux.sh')],{encoding:'utf8'});
if(shellCheck.error||shellCheck.status!==0)
  throw Error('Iniciador Android contém erro de sintaxe shell: '+(shellCheck.stderr||shellCheck.error?.message||'erro desconhecido'));
// O manifesto empacotado não pode ampliar o escopo para fora do servidor local.
if(manifest.start_url!=='./index.html'||manifest.scope!=='./'||manifest.id!=='./')
  throw Error('Manifesto empacotado alterou escopo privado do PWA');
console.log('Pacote privado verificado: '+seen.size+' arquivos íntegros, 22 molduras e nenhum arquivo extra.');
