import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
const exe=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
if(!exe)throw Error('Chrome/Chromium não instalado no runner');
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1300,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 // Segurar a primeira moldura até testar uma foto selecionada antes de o catálogo terminar.
 let releaseFirstFrame;
 await page.route('**/molduras/original_01.webp',async route=>{
   await new Promise(resolve=>{releaseFirstFrame=resolve});
   await route.continue();
 });
 await page.goto(process.env.STUDIO_URL || 'http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'});
 const initialDisabled=await page.locator('#savePNG').isDisabled();
 if(!initialDisabled)throw Error('PNG liberado antes de carregar as molduras');
 await page.evaluate(()=>document.querySelector('#savePNG').onclick());
 const initialStatus=await page.locator('#status').textContent();
 if(!initialStatus.includes('Aguarde o carregamento das molduras'))throw Error('PNG vazio não foi bloqueado durante inicialização');
 // Regressão: uma mídia pronta não pode desbloquear PNG se as 22 molduras ainda carregam.
 await page.locator('#media').setInputFiles({name:'arquivo-corrompido.png',mimeType:'image/png',buffer:Buffer.from('nao-e-uma-imagem')});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Falha ao abrir foto'));
 if(!(await page.locator('#savePNG').isDisabled()))throw Error('Mídia inválida desbloqueou PNG antes do catálogo');
 const earlyPng64=await page.evaluate(()=>{
   const t=document.createElement('canvas');t.width=t.height=32;
   t.getContext('2d').fillRect(0,0,32,32);
   return t.toDataURL('image/png').split(',')[1];
 });
 await page.locator('#media').setInputFiles({name:'foto-antes-das-molduras.png',mimeType:'image/png',buffer:Buffer.from(earlyPng64,'base64')});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Foto encaixada'));
 if(!(await page.locator('#savePNG').isDisabled()))throw Error('Foto pronta desbloqueou PNG antes das 22 molduras');
 await page.evaluate(()=>document.querySelector('#savePNG').onclick());
 if(!(await page.locator('#status').textContent()).includes('Aguarde o carregamento das molduras'))throw Error('Clique programático ignorou a proteção de PNG incompleto');
 if(typeof releaseFirstFrame!=='function')throw Error('A primeira moldura não foi interceptada');
 releaseFirstFrame();
 await page.waitForFunction(()=>document.querySelectorAll('#gallery .tile').length===22,null,{timeout:25000});
 if(await page.locator('#savePNG').isDisabled())throw Error('PNG não foi liberado após carregar as 22 molduras');
 console.log('Inicialização lenta aprovada: nenhum PNG vazio e exportação liberada após carregar as molduras.');
 await page.selectOption('#editorial','21');
 const png64=await page.evaluate(()=>{const t=document.createElement('canvas');t.width=t.height=32;const g=t.getContext('2d');g.fillStyle='#f00';g.fillRect(0,0,32,32);return t.toDataURL('image/png').split(',')[1]});
 await page.locator('#media').setInputFiles({name:'vermelho.png',mimeType:'image/png',buffer:Buffer.from(png64,'base64')});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Foto encaixada'),null,{timeout:12000});
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
 if(!pendingMessage.includes('Aguarde uma mídia válida terminar de carregar'))throw Error('Proteção de PNG durante carregamento não funcionou: '+pendingMessage);
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
 // Exercita a exportação PNG real de TODAS as 22 molduras, não apenas a
 // presença das miniaturas. Confere assinatura, dimensões e tamanho do download.
 await page.selectOption('#format','feed');
 const feedHashes=new Set();
 for(let i=0;i<22;i++){
   await page.selectOption('#editorial',String(i));
   const expected=await page.evaluate(()=>{
     const [w,h]=canvasFormat();
     const frame=frames[selected];
     if(!frame?.img?.complete||!frame.img.naturalWidth||!frame.img.naturalHeight)
       throw Error('Moldura selecionada não terminou de carregar');
     if(frame.img.naturalWidth!==frame.w||frame.img.naturalHeight!==frame.h)
       throw Error('Dimensões da imagem divergem do catálogo: '+frame.img.naturalWidth+'x'+frame.img.naturalHeight);
     const ctx=canvas.getContext('2d',{willReadFrequently:true});
     const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
     let visible=0;
     for(let p=3;p<pixels.length;p+=Math.max(4,Math.floor(pixels.length/4096/4)*4))
       if(pixels[p]>0)visible++;
     if(visible===0)throw Error('Prévia da moldura está totalmente transparente');
     return {w,h};
   });
   const downloadPromise=page.waitForEvent('download',{timeout:20000});
   await page.click('#savePNG');
   const download=await downloadPromise;
   const filename=download.suggestedFilename();
   if(!filename.toLowerCase().endsWith('.png'))
     throw Error('Moldura '+(i+1)+' exportou extensão incorreta: '+filename);
   const file=await download.path();
   const bytes=fs.readFileSync(file);
   if(bytes.length<1000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')
     throw Error('PNG inválido/vazio na moldura '+(i+1));
   const hash=createHash('sha256').update(bytes).digest('hex');
   if(feedHashes.has(hash))throw Error('Duas molduras geraram o mesmo PNG no Feed: moldura '+(i+1));
   feedHashes.add(hash);
   const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
   if(width!==expected.w||height!==expected.h)
     throw Error('PNG com dimensões incorretas na moldura '+(i+1)+': '+width+'x'+height);
 }
 if(feedHashes.size!==22)throw Error('Exportações Feed não produziram 22 arquivos distintos');
 console.log('PNG de todas as 22 molduras aprovado: downloads válidos, dimensões corretas e conteúdo distinto.');

 // O formato vertical deve gerar PNG 1080x1920 de verdade para TODAS
 // as 22 molduras, inclusive após alternar do Feed.
 await page.selectOption('#format','story');
 const storyHashes=new Set();
 for(let index=0;index<22;index++){
   await page.selectOption('#editorial',String(index));
   // A prévia vertical deve mostrar a moldura correta antes de gerar o arquivo.
   const preview=await page.evaluate(()=>{
     const frame=frames[selected];
     const [width,height]=canvasFormat();
     const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
     let visible=false;
     for(let offset=3;offset<pixels.length;offset+=Math.max(4,Math.floor(pixels.length/4096/4)*4)){
       if(pixels[offset]>0){visible=true;break;}
     }
     return {loaded:!!frame?.img?.complete&&frame.img.naturalWidth===frame.w&&frame.img.naturalHeight===frame.h,
       width,height,canvasWidth:canvas.width,canvasHeight:canvas.height,visible};
   });
   if(!preview.loaded||!preview.visible||preview.width!==1080||preview.height!==1920||
      preview.canvasWidth!==1080||preview.canvasHeight!==1920)
     throw Error('Prévia vertical inválida na moldura '+(index+1)+': '+JSON.stringify(preview));
   const promise=page.waitForEvent('download',{timeout:20000});
   await page.click('#savePNG');
   const result=await promise;
   if(!result.suggestedFilename().toLowerCase().endsWith('.png'))
     throw Error('Exportação vertical sem extensão PNG: moldura '+(index+1));
   const bytes=fs.readFileSync(await result.path());
   if(bytes.length<1000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')
     throw Error('PNG vertical inválido: moldura '+(index+1));
   const hash=createHash('sha256').update(bytes).digest('hex');
   if(storyHashes.has(hash))throw Error('Duas molduras geraram o mesmo PNG vertical: moldura '+(index+1));
   storyHashes.add(hash);
   if(bytes.readUInt32BE(16)!==1080||bytes.readUInt32BE(20)!==1920)
     throw Error('PNG vertical não possui 1080x1920: moldura '+(index+1));
 }
 if(storyHashes.size!==22)throw Error('Exportações Story não produziram 22 arquivos distintos');
 await page.selectOption('#format','feed');
 // Regressão: voltar de Story para Feed deve alterar também o arquivo exportado,
 // não apenas o seletor ou a prévia.
 await page.selectOption('#editorial','0');
 const backToFeed=page.waitForEvent('download',{timeout:20000});
 await page.click('#savePNG');
 const backToFeedFile=await backToFeed;
 const feedBytes=fs.readFileSync(await backToFeedFile.path());
 const feedDimensions=await page.evaluate(()=>canvasFormat());
 if(feedBytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||
    feedBytes.readUInt32BE(16)!==feedDimensions[0]||
    feedBytes.readUInt32BE(20)!==feedDimensions[1]||
    (feedDimensions[0]===1080&&feedDimensions[1]===1920))
   throw Error('Retorno de Story para Feed exportou dimensões incorretas');
 console.log('PNG vertical aprovado: 22 molduras em 1080x1920 e retorno ao Feed com dimensões corretas.');

 // Confirmar que a versão privada continua utilizável sem conexão após o primeiro carregamento.
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.reload();
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:15000});
 await page.context().setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelectorAll('#gallery .tile').length===22,null,{timeout:15000});
 console.log('PWA offline aprovado: 22 molduras carregadas sem rede.');
 await page.context().setOffline(false);
 if(errors.length)throw Error('Erros de navegador: '+errors.join(' | '));
}finally{await browser.close();}
