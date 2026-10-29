import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {chromium} from 'playwright-core';

const root=process.cwd();
const dir=path.resolve('dist/Estudio-Coroado-Privado');
const assets=['index.html','manifest.webmanifest','sw.js','icons/studio.svg','icons/studio-192.png','icons/studio-512.png',
  ...Array.from({length:22},(_,i)=>'molduras/original_'+String(i+1).padStart(2,'0')+'.webp')];
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const file of assets){
  if(!fs.existsSync(path.join(dir,file)))throw Error('Arquivo não incluído: '+file);
  if(hash(path.join(dir,file))!==hash(path.join(root,file)))throw Error('Pacote alterou o arquivo: '+file);
}
for(const file of ['Estudio_Coroado_Offline.html','Iniciar-PC-Windows.cmd','Iniciar-Android-Termux.sh','LEIA-ME-PRIMEIRO.txt'])
  if(!fs.existsSync(path.join(dir,file)))throw Error('Instalação incompleta: '+file);
const windowsLauncher=fs.readFileSync(path.join(dir,'Iniciar-PC-Windows.cmd'),'utf8');
if(!windowsLauncher.includes('ThreadingHTTPServer')||!windowsLauncher.includes('webbrowser.open'))throw Error('Inicializador Windows não espera servidor antes de abrir o navegador');
if(windowsLauncher.includes('start "" "http://127.0.0.1:8765'))throw Error('Inicializador Windows abre navegador antes do servidor');
const androidInstructions=fs.readFileSync(path.join(dir,'LEIA-ME-PRIMEIRO.txt'),'utf8');
if(!androidInstructions.includes('termux-setup-storage')||!androidInstructions.includes('mantenha a janela aberta'))throw Error('Instruções de instalação local incompletas');
if(androidInstructions.includes(String.raw`\n`))throw Error('Instruções de instalação contêm barras n literais em vez de quebras de linha');
const offline=fs.readFileSync(path.join(dir,'Estudio_Coroado_Offline.html'),'utf8');
if((offline.match(/"src":"data:image\/webp;base64,/g)||[]).length!==22)throw Error('HTML offline sem as 22 molduras incorporadas');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.webmanifest'),'utf8'));
if(manifest.display!=='standalone'||!manifest.start_url||manifest.icons.length<2)throw Error('Manifesto PWA inválido');
const exe=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
if(!exe)throw Error('Chrome não encontrado para testar instalação local');
const types={'.html':'text/html','.webmanifest':'application/manifest+json','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const relative=decodeURIComponent(url.pathname).replace(/^\/+/,'')||'index.html';
  const full=path.resolve(dir,relative);
  if(!full.startsWith(dir+path.sep)){res.writeHead(403).end();return}
  try{res.setHeader('Content-Type',types[path.extname(full)]||'application/octet-stream');res.end(fs.readFileSync(full))}
  catch{res.writeHead(404).end('Not found')}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true,serviceWorkers:'allow'});
const page=await context.newPage();
const errors=[];page.on('pageerror',err=>errors.push(err.message));
try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
  await page.waitForFunction(()=>document.querySelectorAll('#gallery .tile').length===22);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#gallery .tile').length===22);
  const loaded=await page.evaluate(()=>frames.length===22&&frames.every(f=>f.img.complete&&f.img.naturalWidth>0));
  if(!loaded)throw Error('Molduras não funcionam offline no pacote');
  const d=page.waitForEvent('download',{timeout:15000});
  await page.locator('#savePNG').tap();
  if(!(await d).suggestedFilename().endsWith('.png'))throw Error('PNG indisponível offline');
  if(errors.length)throw Error('Erros no PWA empacotado: '+errors.join(' | '));
  console.log('Pacote privado aprovado: 22 molduras íntegras, PWA em localhost, offline e PNG em tela móvel.');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
