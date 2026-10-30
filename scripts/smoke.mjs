import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const exe=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
if(!exe)throw Error('Chrome/Chromium não instalado no runner');
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1300,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 // A primeira moldura pode demorar no Android. Não exportar um PNG vazio enquanto carrega.
 await page.route('**/molduras/original_01.webp',async route=>{
   await new Promise(resolve=>setTimeout(resolve,900));
   await route.continue();
 });
 await page.goto(process.env.STUDIO_URL || 'http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'});
 const initialDisabled=await page.locator('#savePNG').isDisabled();
 if(!initialDisabled)throw Error('PNG liberado antes de carregar as molduras');
 await page.evaluate(()=>document.querySelector('#savePNG').onclick());
 const initialStatus=await page.locator('#status').textContent();
 if(!initialStatus.includes('Aguarde o carregamento das molduras'))throw Error('PNG vazio não foi bloqueado durante inicialização');
 await page.waitForFunction(()=>document.querySelectorAll('#gallery .tile').length===22,{timeout:25000});
 if(await page.locator('#savePNG').isDisabled())throw Error('PNG não foi liberado após carregar as 22 molduras');
 console.log('Inicialização lenta aprovada: nenhum PNG vazio e exportação liberada após carregar as molduras.');
 await page.selectOption('#editorial','21');
 const png64=await page.evaluate(()=>{const t=document.createElement('canvas');t.width=t.height=32;const g=t.getContext('2d');g.fillStyle='#f00';g.fillRect(0,0,32,32);return t.toDataURL('image/png').split(',')[1]});
 await page.locator('#media').setInputFiles({name:'vermelho.png',mimeType:'image/png',buffer:Buffer.from(png64,'base64')});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Foto encaixada'),{timeout:12000});
 const sample=await page.evaluate(()=>{const f=frames[selected],[W,H]=canvasFormat(),sc=Math.min(W/f.w,H/f.h),dx=(W-f.w*sc)/2,dy=(H-f.h*sc)/2;const x=Math.floor(dx+(f.box[0]+f.box[2]*.70)*sc),y=Math.floor(dy+(f.box[1]+f.box[3]*.35)*sc);return Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data)});
 if(sample[0]<190||sample[1]>120||sample[2]>120)throw Error('Foto não aparece na janela da moldura: '+sample);
 await page.fill('#headline','TESTE DE PUBLICAÇÃO');
 const download=page.waitForEvent('download',{timeout:15000});await page.click('#savePNG');const file=await download;
 const target=path.resolve('smoke-output.png');await file.saveAs(target);
 if(fs.statSync(target).size<10000)throw Error('PNG exportado inválido');
 console.log('Teste visual aprovado: 22 molduras, foto vermelha visível, manchete e PNG exportado. Bytes:',fs.statSync(target).size);

 // Regressão: callback assíncrono de PNG não pode baixar uma arte obsoleta.
 let stalePngDownloads=0;
 page.on('download',()=>{stalePngDownloads++});
 await page.evaluate(()=>{
   const original=canvas.toBlob.bind(canvas);
   window.__restorePng=()=>{canvas.toBlob=original};
   canvas.toBlob=(callback,...args)=>original(blob=>{window.__releasePng=()=>callback(blob)},...args);
 });
 await page.click('#savePNG');
 await page.waitForFunction(()=>typeof window.__releasePng==='function');
 await page.fill('#headline','MANCHETE ALTERADA DURANTE EXPORTACAO');
 await page.evaluate(()=>window.__releasePng());
 await page.waitForTimeout(250);
 if(stalePngDownloads)throw Error('PNG obsoleto foi entregue após edição');
 await page.evaluate(()=>window.__restorePng());
 const freshPng=page.waitForEvent('download',{timeout:15000});
 await page.click('#savePNG');
 const freshFile=await freshPng;
 if(!freshFile.suggestedFilename().endsWith('.png'))throw Error('Novo PNG não foi exportado');
 console.log('PNG assíncrono aprovado: edição invalida download antigo e permite nova exportação.');
 // Uma codificação PNG pendente deve ser invalidada quando a exportação de vídeo
 // bloqueia o editor, evitando download atrasado durante a gravação.
 let pngDuringVideo=0;
 const countBusyPng=()=>{pngDuringVideo++};
 page.on('download',countBusyPng);
 await page.evaluate(()=>{
   const original=canvas.toBlob.bind(canvas);
   window.__restoreBusyPng=()=>{canvas.toBlob=original};
   canvas.toBlob=(callback,...args)=>original(blob=>{window.__releaseBusyPng=()=>callback(blob)},...args);
 });
 await page.click('#savePNG');
 await page.waitForFunction(()=>typeof window.__releaseBusyPng==='function');
 await page.evaluate(()=>setExportBusy(true));
 await page.evaluate(()=>window.__releaseBusyPng());
 await page.waitForTimeout(250);
 if(pngDuringVideo)throw Error('PNG pendente foi baixado depois de iniciar exportação de vídeo');
 await page.evaluate(()=>{window.__restoreBusyPng();setExportBusy(false)});
 page.off('download',countBusyPng);
 if(await page.locator('#savePNG').isDisabled())throw Error('PNG permaneceu bloqueado após exportação de vídeo');
 console.log('PNG pendente aprovado: início da exportação de vídeo invalida download atrasado.');

 // Regressão: uma foto ainda em carregamento não pode deixar a foto antiga na prévia
 // nem permitir exportar uma arte sem a mídia recém-selecionada.
 await page.evaluate(()=>{
   const originalLoad=load;
   window.__restorePendingLoad=()=>{load=originalLoad};
   load=src=>src.startsWith('blob:')
     ? new Promise((resolve,reject)=>{window.__completePendingLoad=()=>originalLoad(src).then(resolve,reject)})
     : originalLoad(src);
 });
 await page.locator('#media').setInputFiles({name:'nova-foto-pendente.png',mimeType:'image/png',buffer:Buffer.from(png64,'base64')});
 await page.waitForFunction(()=>typeof window.__completePendingLoad==='function');
 const pendingState=await page.evaluate(()=>({
   photoCleared:photo===null,videoCleared:video===null,
   pngDisabled:document.querySelector('#savePNG').disabled,
   status:document.querySelector('#status').textContent
 }));
 if(!pendingState.photoCleared||!pendingState.videoCleared||!pendingState.pngDisabled||!pendingState.status.includes('Carregando'))
   throw Error('Editor permite exportar mídia ainda não carregada: '+JSON.stringify(pendingState));
 await page.evaluate(()=>document.querySelector('#savePNG').onclick());
 const pendingMessage=await page.locator('#status').textContent();
 if(!pendingMessage.includes('Aguarde o carregamento'))throw Error('Proteção de PNG durante carregamento não funcionou');
 await page.evaluate(()=>window.__completePendingLoad());
 await page.waitForFunction(()=>photo?.naturalWidth===32&&!document.querySelector('#savePNG').disabled);
 await page.evaluate(()=>window.__restorePendingLoad());
 console.log('Troca de mídia pendente aprovada: prévia antiga limpa e PNG bloqueado até carregar.');
 // Regressão: uma foto lenta não pode substituir uma foto escolhida depois.
 await page.evaluate(()=>{
   const originalLoad=load;let delayed=false;
   load=src=>{
     if(src.startsWith('blob:')&&!delayed){
       delayed=true;
       return new Promise((resolve,reject)=>{window.releaseDelayedPhoto=()=>originalLoad(src).then(resolve,reject)});
     }
     return originalLoad(src);
   };
 });
 const blue64=Buffer.from(await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=c.height=64;
   const g=c.getContext('2d');g.fillStyle='#0000ff';g.fillRect(0,0,64,64);
   return c.toDataURL('image/png').split(',')[1];
 }),'base64');
 await page.locator('#media').setInputFiles({name:'foto-lenta.png',mimeType:'image/png',buffer:Buffer.from(png64,'base64')});
 await page.locator('#media').setInputFiles({name:'foto-nova.png',mimeType:'image/png',buffer:blue64});
 await page.waitForFunction(()=>photo?.naturalWidth===64);
 await page.evaluate(()=>window.releaseDelayedPhoto());
 await page.waitForTimeout(250);
 const photoState=await page.evaluate(()=>({width:photo?.naturalWidth,status:document.querySelector('#status').textContent}));
 if(photoState.width!==64||!photoState.status.includes('Foto encaixada'))throw Error('Foto anterior sobrescreveu a nova seleção: '+JSON.stringify(photoState));
 // Regressão: metadados de um vídeo antigo não podem reativar o vídeo após escolher foto.
 await page.evaluate(()=>{
   const originalCreate=document.createElement.bind(document);
   document.createElement=function(tag,...args){
     const el=originalCreate(tag,...args);
     if(String(tag).toLowerCase()==='video')window.staleVideo=el;
     return el;
   };
 });
 await page.locator('#media').setInputFiles({name:'video-antigo.mp4',mimeType:'video/mp4',buffer:Buffer.from('video incompleto')});
 await page.locator('#media').setInputFiles({name:'foto-final.png',mimeType:'image/png',buffer:blue64});
 await page.waitForFunction(()=>photo?.naturalWidth===64&&document.querySelector('#status').textContent.includes('Foto encaixada'));
 await page.evaluate(()=>{const v=window.staleVideo;v.onloadedmetadata?.();v.onloadeddata?.();v.onerror?.()});
 const videoState=await page.evaluate(()=>({hasVideo:!!video,photoWidth:photo?.naturalWidth,tools:document.querySelector('#videoTools').style.display,status:document.querySelector('#status').textContent}));
 if(videoState.hasVideo||videoState.photoWidth!==64||videoState.tools!=='none'||!videoState.status.includes('Foto encaixada'))throw Error('Vídeo anterior reativado após trocar por foto: '+JSON.stringify(videoState));
 console.log('Troca rápida de mídia aprovada: callbacks antigos de foto/vídeo ignorados.');
 // Android pode fornecer MIME vazio ou genérico ao escolher um vídeo.
 const mobileMime=await page.evaluate(async(png64)=>{
   const input=document.querySelector('#media');
   const choose=(name,type,bytes)=>{
     const dt=new DataTransfer();
     dt.items.add(new File([bytes],name,{type}));
     input.files=dt.files;
     input.dispatchEvent(new Event('change',{bubbles:true}));
   };
   choose('gravacao-celular.MP4','application/octet-stream',new Uint8Array([0,1,2]));
   const videoTools=document.querySelector('#videoTools').style.display;
   choose('imagem-sem-mime.png','',Uint8Array.from(atob(png64),c=>c.charCodeAt(0)));
   await new Promise((resolve,reject)=>{
     const timeout=setTimeout(()=>reject(Error('Imagem sem MIME não carregou')),5000);
     const check=()=>{if(photo?.naturalWidth===32){clearTimeout(timeout);resolve()}else setTimeout(check,40)};
     check();
   });
   return {videoTools,photoWidth:photo?.naturalWidth,finalTools:document.querySelector('#videoTools').style.display};
 },png64);
 if(mobileMime.videoTools!=='block'||mobileMime.photoWidth!==32||mobileMime.finalTools!=='none')throw Error('Detecção de mídia Android com MIME genérico falhou: '+JSON.stringify(mobileMime));
 console.log('Mídia Android aprovada: MP4 com MIME genérico e PNG sem MIME reconhecidos.');
 // Confirmar que a versão privada continua utilizável sem conexão após o primeiro carregamento.
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.reload();
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:15000});
 await page.context().setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelectorAll('#gallery .tile').length===22,{timeout:15000});
 console.log('PWA offline aprovado: 22 molduras carregadas sem rede.');
 await page.context().setOffline(false);
 if(errors.length)throw Error('Erros de navegador: '+errors.join(' | '));
}finally{await browser.close();}
