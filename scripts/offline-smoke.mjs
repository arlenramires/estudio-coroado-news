import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const exe=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
if(!exe)throw Error('Chrome não instalado');
const file=path.resolve('dist/Estudio_Coroado_Offline.html');
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
const page=await browser.newPage({acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
// O arquivo offline deve funcionar sem rede: rejeitar qualquer tentativa HTTP(S).
const networkRequests=[];
page.on('request',request=>{if(/^https?:/i.test(request.url()))networkRequests.push(request.url())});
await page.route(/^https?:\/\//,route=>route.abort('internetdisconnected'));
try{
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(()=>document.querySelectorAll('#gallery .tile').length===22,{timeout:30000});
  const loaded=await page.evaluate(()=>frames.length===22&&frames.every(f=>f.img.complete&&f.img.naturalWidth>0));
  if(!loaded)throw Error('Molduras não abriram no arquivo local');
  const embedded=await page.evaluate(()=>frames.length===22&&frames.every(f=>f.src.startsWith('data:image/webp;base64,')));
  if(!embedded)throw Error('Arquivo offline contém molduras externas ou incompletas');
  const offlineInfo=await page.locator('#offlineReady').textContent();
  if(!offlineInfo.includes('Arquivo único pronto para uso offline'))throw Error('Diagnóstico incorreto do HTML offline: '+offlineInfo);
  const codec=await page.locator('#videoCapability').textContent();
  if(!codec.includes('Gravação'))throw Error('Diagnóstico de gravação ausente: '+codec);
  await page.fill('#headline','ESTÚDIO OFFLINE');
  const download=page.waitForEvent('download',{timeout:15000});
  await page.click('#savePNG');
  const d=await download;
  await d.saveAs('offline-smoke.png');
  if(fs.statSync('offline-smoke.png').size<10000)throw Error('PNG offline inválido');
  if(networkRequests.length)throw Error('HTML offline tentou acessar rede: '+networkRequests.join(' | '));
  if(errors.length)throw Error('Erros no HTML offline: '+errors.join(' | '));
  console.log('HTML local aprovado: 22 molduras e PNG sem servidor nem rede.');
}finally{await browser.close()}
