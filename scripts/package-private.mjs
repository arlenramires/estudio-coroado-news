import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const dest=path.join(root,'dist','Estudio-Coroado-Privado');
const required=['index.html','manifest.webmanifest','sw.js','icons/studio.svg','icons/studio-192.png','icons/studio-512.png',
  ...Array.from({length:22},(_,i)=>'molduras/original_'+String(i+1).padStart(2,'0')+'.webp')];
// Recria o pacote do zero para impedir arquivos obsoletos de entregas anteriores.\nfs.rmSync(dest,{recursive:true,force:true});\nfs.mkdirSync(dest,{recursive:true});
for(const file of required){
  const source=path.join(root,file),target=path.join(dest,file);
  if(!fs.existsSync(source))throw Error('Arquivo necessário ausente: '+file);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target);
  const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  if(sha(source)!==sha(target))throw Error('Cópia divergente: '+file);
}
const offline=path.join(root,'dist','Estudio_Coroado_Offline.html');
if(!fs.existsSync(offline))throw Error('Execute primeiro: node scripts/build-offline.mjs');
fs.copyFileSync(offline,path.join(dest,'Estudio_Coroado_Offline.html'));
const win=String.raw`@echo off
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 goto py
where python >nul 2>&1
if %errorlevel%==0 goto python
echo Python nao encontrado. Abra Estudio_Coroado_Offline.html para usar sem instalar.
pause
exit /b 1
:py
py -3 -c "import http.server,webbrowser; s=http.server.ThreadingHTTPServer(('127.0.0.1',8765),http.server.SimpleHTTPRequestHandler); print('Servidor privado ativo em http://127.0.0.1:8765/ - mantenha esta janela aberta'); webbrowser.open('http://127.0.0.1:8765/index.html'); s.serve_forever()"
goto end
:python
python -c "import http.server,webbrowser; s=http.server.ThreadingHTTPServer(('127.0.0.1',8765),http.server.SimpleHTTPRequestHandler); print('Servidor privado ativo em http://127.0.0.1:8765/ - mantenha esta janela aberta'); webbrowser.open('http://127.0.0.1:8765/index.html'); s.serve_forever()"
:end
`;
const android=String.raw`#!/data/data/com.termux/files/usr/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v python >/dev/null 2>&1; then
  echo "Instale Python no Termux: pkg install python"
  exit 1
fi
echo "Abra http://127.0.0.1:8765/index.html no Chrome."
echo "Para instalar o PWA: menu do Chrome > Instalar app (quando disponivel)."
python -m http.server 8765 --bind 127.0.0.1
`;
fs.writeFileSync(path.join(dest,'Iniciar-PC-Windows.cmd'),win);
fs.writeFileSync(path.join(dest,'Iniciar-Android-Termux.sh'),android,{mode:0o755});
fs.writeFileSync(path.join(dest,'LEIA-ME-PRIMEIRO.txt'),String.raw`ESTUDIO COROADO NEWS 24H - PACOTE PRIVADO PC E ANDROID

USO IMEDIATO (SEM SERVIDOR, SEM INTERNET):
Abra Estudio_Coroado_Offline.html no Chrome/Edge no PC.
No Android, extraia o ZIP e abra esse HTML pelo gerenciador de arquivos.
O arquivo unico inclui as 22 molduras. Ele NAO e um PWA instalavel.

PWA NO WINDOWS (INSTALACAO PELO NAVEGADOR):
1. Extraia o ZIP inteiro (nao abra arquivos de dentro do ZIP).
2. Com Python instalado, execute Iniciar-PC-Windows.cmd e mantenha a janela aberta.
   O navegador so sera aberto depois de o servidor iniciar.
3. No Chrome ou Edge, acesse http://127.0.0.1:8765/index.html
4. Aguarde carregar as 22 molduras e use o menu > Instalar aplicativo.
5. Depois do primeiro carregamento, o cache do PWA pode operar offline.
   Para atualizacoes, abra novamente com o servidor ativo.

PWA NO ANDROID (SEM HOSPEDAGEM PUBLICA):
1. Instale Termux de fonte confiavel e instale Python: pkg install python.
2. Execute termux-setup-storage e autorize acesso aos arquivos, se usar Downloads.
3. Extraia todo o ZIP em uma pasta acessivel ao Termux.
4. No Termux, entre na pasta e execute sh Iniciar-Android-Termux.sh
5. No Chrome do proprio Android, abra http://127.0.0.1:8765/index.html
6. Aguarde as 22 molduras; menu > Instalar app/Adicionar a tela inicial.
7. Se o Chrome nao oferecer instalacao, use o HTML offline como alternativa.

IMPORTANTE: nenhum arquivo e enviado a um servidor externo pelo editor.
MP4 so se o navegador suportar MediaRecorder MP4; caso contrario, WebM.
Teste exportacao com audio no seu aparelho antes de publicar.
Nao e APK; a instalacao Android fisica ainda precisa de validacao.
Nao use IP HTTP do PC para instalar PWA no Android.
Se o Termux nao encontrar a pasta Downloads, execute termux-setup-storage, autorize e use ~/storage/downloads.
Se o PWA nao abrir offline, acesse-o com servidor ativo uma vez e aguarde o aviso de cache pronto.
`);
// Lista verificável de integridade para detectar ZIP extraído parcialmente ou alterado.
const files=[];
function collect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const absolute=path.join(dir,entry.name);
  if(entry.isDirectory())collect(absolute);
  else if(entry.isFile()&&entry.name!=='SHA256SUMS.txt')files.push(absolute);
}}
collect(dest);
const sums=files.map(file=>{
  const relative=path.relative(dest,file).split(path.sep).join('/');
  const digest=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return digest+'  '+relative;
}).sort().join('\n')+'\n';
fs.writeFileSync(path.join(dest,'SHA256SUMS.txt'),sums);
for(const line of sums.trimEnd().split('\n')){
  const [digest,relative]=line.split('  ');
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(dest,relative))).digest('hex');
  if(actual!==digest)throw Error('Falha de integridade no pacote: '+relative);
}
console.log('Pacote privado gerado:',dest,'com',required.length,'arquivos do PWA + HTML offline e iniciadores.');
