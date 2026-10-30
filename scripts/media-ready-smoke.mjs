import fs from 'node:fs';
import {chromium} from 'playwright-core';

const exe=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
if(!exe)throw Error('Chrome indisponível no runner');
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
const page=await browser.newPage();
try{
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForFunction(()=>document.querySelectorAll('#gallery .tile').length===22,{timeout:30000});
  // Simula Android lento: metadados chegam, mas nenhum quadro foi decodificado.
  await page.evaluate(()=>{
    const original=document.createElement.bind(document);
    document.createElement=function(tag,...args){
      const element=original(tag,...args);
      if(String(tag).toLowerCase()==='video' && !window.__mockVideo){
        Object.defineProperty(element,'src',{configurable:true,get(){return 'mock:video'},set(){}});
        window.__mockVideo=element;
      }
      return element;
    };
  });
  await page.locator('#media').setInputFiles({
    name:'video-lento.mp4',mimeType:'video/mp4',buffer:Buffer.from('video simulado')
  });
  await page.waitForFunction(()=>!!window.__mockVideo);
  await page.evaluate(()=>window.__mockVideo.onloadedmetadata());
  const state=await page.evaluate(()=>({
    loading:mediaLoading,disabled:document.querySelector('#savePNG').disabled,
    videoAssigned:!!video
  }));
  if(!state.loading||!state.disabled||state.videoAssigned)
    throw Error('Metadados liberaram PNG antes de decodificar um quadro: '+JSON.stringify(state));
  // Um arquivo corrompido não pode reabilitar PNG com a moldura vazia.
  await page.evaluate(()=>window.__mockVideo.onerror());
  const failed=await page.evaluate(()=>({
    loading:mediaLoading,disabled:document.querySelector('#savePNG').disabled,
    message:document.querySelector('#status').textContent
  }));
  if(failed.loading||!failed.disabled||!failed.message.includes('não conseguiu abrir'))
    throw Error('Falha de vídeo liberou exportação PNG inválida: '+JSON.stringify(failed));
  console.log('Metadados sem quadro e falha de vídeo: PNG bloqueado corretamente.');
}finally{await browser.close()}
