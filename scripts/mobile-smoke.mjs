import fs from 'node:fs';
import {chromium} from 'playwright-core';
const exe=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
if(!exe)throw Error('Chrome indisponível no runner');
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForFunction(()=>document.querySelectorAll('#gallery .tile').length===22,{timeout:30000});
  const dims=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
  if(dims.width>dims.viewport+2)throw Error('Editor ultrapassa largura da tela Android: '+JSON.stringify(dims));
  await page.locator('#gallery .tile').last().tap();
  if(await page.locator('#editorial').inputValue()!=='21')throw Error('Toque não selecionou a última moldura');
  const red=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSx8AAAAASUVORK5CYII=','base64');
  await page.locator('#media').setInputFiles({name:'foto.png',mimeType:'image/png',buffer:red});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Foto encaixada'),{timeout:15000});
  await page.locator('#headline').fill('TESTE CELULAR');
  const download=page.waitForEvent('download',{timeout:15000});
  await page.locator('#savePNG').tap();
  const file=await download;
  if(!file.suggestedFilename().endsWith('.png'))throw Error('Exportação móvel não retornou PNG');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>document.querySelector('#offlineReady').textContent.includes('Cache offline preparado'),{timeout:15000});
  // Uma moldura ausente não pode ser anunciada como disponível offline.
  const cacheCheck=await page.evaluate(async()=>{
    const keys=(await caches.keys()).filter(name=>name.startsWith('estudio-coroado-offline-'));
    if(keys.length!==1)throw Error('Cache do Estúdio não encontrado ou duplicado');
    const cache=await caches.open(keys[0]),asset='./molduras/original_22.webp';
    const had=!!(await cache.match(asset));
    await cache.delete(asset);
    const incomplete=await verifyOfflineCache();
    await cache.add(asset);
    const complete=await verifyOfflineCache();
    return {had,incomplete,complete};
  });
  if(!cacheCheck.had||cacheCheck.incomplete||!cacheCheck.complete)throw Error('Diagnóstico de cache incompleto incorreto: '+JSON.stringify(cacheCheck));
  const codec=await page.locator('#videoCapability').textContent();
  if(!codec.includes('Gravação'))throw Error('Diagnóstico de gravação não apareceu: '+codec);
  await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:15000});
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#gallery .tile').length===22,{timeout:15000});
  if(errors.length)throw Error('Erros no modo celular: '+errors.join(' | '));
  console.log('Teste de tela móvel aprovado: toque, 22 molduras, foto, PNG, offline e sem rolagem horizontal.');
}finally{await browser.close()}
