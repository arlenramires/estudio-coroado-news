import fs from 'node:fs';
import {chromium} from 'playwright-core';
import {execFileSync,spawnSync} from 'node:child_process';
const exe=['/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));if(!exe)throw Error('Chrome não instalado');
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=red:s=320x240:r=15','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','2.5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','test-input.mp4']);
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const mobile=process.env.STUDIO_TEST_MOBILE==='1';
const context=await browser.newContext(mobile?{acceptDownloads:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}:{acceptDownloads:true});
const page=await context.newPage();
// Simula Wake Lock mesmo no Chrome do runner: deve ser solicitado e liberado
// tanto em exportação normal quanto no fallback e no arquivo HTML offline.
await page.addInitScript(()=>{
  window.__wakeLockTest={requests:0,releases:0};
  Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{
    request:async(type)=>{
      if(type!=='screen')throw Error('Tipo de Wake Lock inesperado: '+type);
      window.__wakeLockTest.requests++;
      return {release:async()=>{window.__wakeLockTest.releases++}};
    }
  }});
});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
if(process.env.STUDIO_TEST_CODEC_FALLBACK==='1'){
 await page.addInitScript(()=>{
   const Native=window.MediaRecorder;
   function RecorderWithRejectedMP4(stream,options){
     if(options?.mimeType?.startsWith('video/mp4'))throw new DOMException('MP4 recusado pelo dispositivo','NotSupportedError');
     return new Native(stream,options);
   }
   RecorderWithRejectedMP4.isTypeSupported=Native.isTypeSupported.bind(Native);
   window.MediaRecorder=RecorderWithRejectedMP4;
 });
}
if(process.env.STUDIO_TEST_CODEC_START_FALLBACK==='1'){
 await page.addInitScript(()=>{
   const Native=window.MediaRecorder;
   window.__rejectedMp4Starts=0;
   function RecorderWithRejectedStart(stream,options){
     if(options?.mimeType?.startsWith('video/mp4')){
       return {mimeType:options.mimeType,state:'inactive',start(){window.__rejectedMp4Starts++;throw new DOMException('MP4 recusado ao iniciar','NotSupportedError')}};
     }
     return new Native(stream,options);
   }
   RecorderWithRejectedStart.isTypeSupported=mime=>mime.startsWith('video/mp4')||Native.isTypeSupported(mime);
   window.MediaRecorder=RecorderWithRejectedStart;
 });
}
try{
 await page.goto(process.env.STUDIO_URL || 'http://127.0.0.1:8765/index.html');
 await page.waitForFunction(()=>document.querySelectorAll('.tile').length===22);
 // Regressão Android: currentTime já reflete o destino, mas a decodificação ainda não terminou.
 const seekResult=await page.evaluate(async()=>{
   const fake=new EventTarget();fake.readyState=2;fake.seeking=false;
   let time=0,settled=false;
   Object.defineProperty(fake,'currentTime',{get:()=>time,set:value=>{time=value;fake.seeking=true}});
   const pending=seekForExport(fake,.75).then(()=>{settled=true});
   await new Promise(resolve=>setTimeout(resolve,40));
   const premature=settled;
   fake.seeking=false;fake.dispatchEvent(new Event('seeked'));
   await pending;
   return {premature,settled};
 });
 if(seekResult.premature||!seekResult.settled)throw Error('Exportação não aguardou o quadro decodificado: '+JSON.stringify(seekResult));
 await page.locator('#media').setInputFiles('test-input.mp4');
 await page.waitForFunction(()=>document.querySelector('#videoTools').style.display==='block' && document.querySelector('#trimEnd').value!=='0',{timeout:15000});
 // Metadados não bastam: o editor só libera exportação após decodificar o primeiro quadro.
 await page.waitForFunction(()=>video && !mediaLoading && video.readyState>=2 && !document.querySelector('#savePNG').disabled,{timeout:15000});
 await page.fill('#trimStart','0');await page.fill('#trimEnd','2');
 // Simula verificação lenta do cabeçalho: o editor não pode ser liberado antes da entrega.
 await page.evaluate(()=>{
   const original=Blob.prototype.arrayBuffer;
   window.__restoreHeaderRead=()=>{Blob.prototype.arrayBuffer=original};
   Blob.prototype.arrayBuffer=function(...args){
     if(this.size===16 && !window.__headerHeld){
       window.__headerHeld=true;
       return new Promise((resolve,reject)=>{window.__releaseHeaderRead=()=>original.apply(this,args).then(resolve,reject)});
     }
     return original.apply(this,args);
   };
 });
 const promise=page.waitForEvent('download',{timeout:30000});
 await page.click('#saveVideo');
 // Enquanto grava, impedir troca de mídia, moldura, texto ou formato (arquivo inconsistente).
 await page.waitForFunction(()=>document.querySelector('#media').disabled && document.querySelector('#editorial').disabled && document.querySelector('#format').disabled && document.querySelector('#headline').disabled && document.querySelector('#savePNG').disabled && [...document.querySelectorAll('#gallery .tile')].every(b=>b.disabled) && document.querySelector('#stopVideo').style.display==='block');
 await page.waitForFunction(()=>typeof window.__releaseHeaderRead==='function',{timeout:20000});
 const held=await page.evaluate(()=>({
   recording,mediaDisabled:document.querySelector('#media').disabled,
   headlineDisabled:document.querySelector('#headline').disabled,
   exportDisabled:document.querySelector('#saveVideo').disabled,
   cancelVisible:document.querySelector('#stopVideo').style.display==='block'
 }));
 if(!held.recording||!held.mediaDisabled||!held.headlineDisabled||!held.exportDisabled||!held.cancelVisible)
   throw Error('Editor liberado antes de validar o vídeo: '+JSON.stringify(held));
 await page.evaluate(()=>{window.__releaseHeaderRead();window.__restoreHeaderRead()});
 const d=await promise;
 // A prévia do vídeo final deve ficar disponível no próprio Estúdio, além do download.
 await page.waitForFunction(()=>{
   const preview=document.querySelector('#videoPreview');
   return preview.style.display==='block' && preview.src.startsWith('blob:') && preview.controls;
 },{timeout:10000});
 await page.waitForFunction(()=>!document.querySelector('#media').disabled && !document.querySelector('#editorial').disabled && !document.querySelector('#savePNG').disabled && [...document.querySelectorAll('#gallery .tile')].every(b=>!b.disabled));
 const wake=await page.evaluate(()=>window.__wakeLockTest);
 if(wake.requests!==1||wake.releases!==1)throw Error('Wake Lock não foi solicitado e liberado corretamente: '+JSON.stringify(wake));
 if(process.env.STUDIO_TEST_CODEC_START_FALLBACK==='1'){
   const rejected=await page.evaluate(()=>window.__rejectedMp4Starts);
   if(!rejected||!d.suggestedFilename().endsWith('.webm'))throw Error('Fallback após falha no start do MP4 não ocorreu: '+rejected+' / '+d.suggestedFilename());
   console.log('Fallback aprovado: MP4 anunciado, recusado no start, WebM exportado.');
 }
 const name=d.suggestedFilename();await d.saveAs('test-output-'+name);
 const target='test-output-'+name;
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','json',target],{encoding:'utf8'})).streams;
 const types=streams.map(x=>x.codec_type);
 if(!types.includes('video'))throw Error('Arquivo exportado sem vídeo');
 if(!types.includes('audio'))throw Error('Arquivo exportado sem áudio: '+JSON.stringify(streams));
 const volume=spawnSync('ffmpeg',['-hide_banner','-nostats','-i',target,'-vn','-af','volumedetect','-f','null','-'],{encoding:'utf8'});
 if(volume.status!==0)throw Error('Não foi possível decodificar áudio exportado: '+volume.stderr.slice(-500));
 const measured=volume.stderr.match(/mean_volume:\s*(-?[0-9.]+) dB/);
 if(!measured||Number(measured[1])< -55)throw Error('Áudio exportado está silencioso ou inaudível: '+(measured?.[1]||'sem medição'));

 const frames=Number(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','default=noprint_wrappers=1:nokey=1',target],{encoding:'utf8'}).trim());
 if(!Number.isFinite(frames)||frames<8)throw Error('Vídeo exportado com poucos quadros: '+frames);
 let duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',target],{encoding:'utf8'}).trim());
 // WebM produzido pelo MediaRecorder pode não trazer duração no cabeçalho; validar pelos timestamps reais dos pacotes.
 if(!Number.isFinite(duration)){
   const lines=execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','packet=pts_time,duration_time','-of','csv=p=0',target],{encoding:'utf8'}).trim().split('\n');
   const times=lines.map(line=>{const [pts,dt]=line.split(',').map(Number);return Number.isFinite(pts)?pts+(Number.isFinite(dt)?dt:0):NaN}).filter(Number.isFinite);
   duration=times.length?Math.max(...times):NaN;
 }
 if(!Number.isFinite(duration)||duration<1.2)throw Error('Vídeo exportado curto demais: '+duration);
 // Regressão: um erro do MediaRecorder não pode disponibilizar um arquivo parcial.
 let unexpectedDownloads=0;
 page.on('download',()=>{unexpectedDownloads++});
 await page.click('#saveVideo');
 await page.waitForFunction(()=>recorder?.state==='recording',{timeout:15000});
 await page.evaluate(()=>recorder.onerror({error:new Error('erro simulado de gravação')}));
 await page.waitForFunction(()=>!document.querySelector('#media').disabled && document.querySelector('#status').textContent.includes('Nenhum arquivo parcial foi entregue.'),{timeout:15000});
 await page.waitForTimeout(300);
 if(unexpectedDownloads)throw Error('Gravação com erro entregou arquivo parcial');
 const wakeAfterError=await page.evaluate(()=>window.__wakeLockTest);
 if(wakeAfterError.requests!==2||wakeAfterError.releases!==2)throw Error('Wake Lock não liberado após erro de gravação: '+JSON.stringify(wakeAfterError));
 console.log('Erro simulado do gravador: sem download parcial, controles e Wake Lock liberados.');

 // Cancelamento manual também precisa descartar o arquivo parcial, sem substituir a prévia anterior.
 await page.click('#saveVideo');
 await page.waitForFunction(()=>recorder?.state==='recording',{timeout:15000});
 await page.click('#stopVideo');
 await page.waitForFunction(()=>!document.querySelector('#media').disabled && document.querySelector('#status').textContent.includes('Exportação cancelada.'),{timeout:15000});
 await page.waitForTimeout(300);
 if(unexpectedDownloads)throw Error('Cancelamento manual entregou arquivo parcial');
 const wakeAfterCancel=await page.evaluate(()=>window.__wakeLockTest);
 if(wakeAfterCancel.requests!==3||wakeAfterCancel.releases!==3)throw Error('Wake Lock não liberado após cancelamento: '+JSON.stringify(wakeAfterCancel));
 if(await page.locator('#videoPreview').getAttribute('src')===null)throw Error('Cancelamento apagou a prévia válida anterior');
 console.log('Cancelamento manual aprovado: nenhum arquivo parcial, prévia preservada e controles liberados.');

 // Regressão Android: bloquear a tela ou trocar de app não pode gerar um vídeo congelado.
 await page.click('#saveVideo');
 await page.waitForFunction(()=>recorder?.state==='recording',{timeout:15000});
 await page.evaluate(()=>{
   Object.defineProperty(document,'hidden',{configurable:true,value:true});
   document.dispatchEvent(new Event('visibilitychange'));
   delete document.hidden;
 });
 await page.waitForFunction(()=>!document.querySelector('#media').disabled && document.querySelector('#status').textContent.includes('segundo plano'),{timeout:15000});
 await page.waitForTimeout(300);
 if(unexpectedDownloads)throw Error('Exportação em segundo plano entregou vídeo parcial');
 const wakeAfterHidden=await page.evaluate(()=>window.__wakeLockTest);
 if(wakeAfterHidden.requests!==4||wakeAfterHidden.releases!==4)throw Error('Wake Lock não liberado ao sair do Estúdio: '+JSON.stringify(wakeAfterHidden));
 if(await page.locator('#videoPreview').getAttribute('src')===null)throw Error('Saída para segundo plano apagou a prévia anterior');
 console.log('Segundo plano aprovado: exportação descartada, prévia mantida e Wake Lock liberado.');

 // Regressão: exportar novamente sem selecionar a mídia deve preservar o áudio.
 // audioDest é compartilhado entre exportações: não encerrar seus tracks no cleanup.
 const audioTracks=await page.evaluate(()=>audioDest?.stream.getAudioTracks().map(t=>t.readyState));
 if(!audioTracks?.length||audioTracks.some(state=>state!=='live'))throw Error('Track de áudio encerrado após exportar: '+JSON.stringify(audioTracks));
 const repeatPromise=page.waitForEvent('download',{timeout:30000});
 await page.click('#saveVideo');
 const repeat=await repeatPromise;
 await page.waitForFunction(()=>!recording && !document.querySelector('#media').disabled,{timeout:15000});
 const repeatTarget='test-repeat-'+repeat.suggestedFilename();
 await repeat.saveAs(repeatTarget);
 const repeatStreams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','json',repeatTarget],{encoding:'utf8'})).streams;
 const repeatTypes=repeatStreams.map(x=>x.codec_type);
 if(!repeatTypes.includes('video')||!repeatTypes.includes('audio'))throw Error('Segunda exportação sem vídeo/áudio: '+JSON.stringify(repeatTypes));
 const repeatVolume=spawnSync('ffmpeg',['-hide_banner','-nostats','-i',repeatTarget,'-vn','-af','volumedetect','-f','null','-'],{encoding:'utf8'});
 const repeatMeasured=repeatVolume.stderr.match(/mean_volume:[ ]*(-?[0-9.]+) dB/);
 if(repeatVolume.status!==0||!repeatMeasured||Number(repeatMeasured[1])< -55)throw Error('Áudio ausente ou silencioso na segunda exportação: '+(repeatMeasured?.[1]||repeatVolume.stderr.slice(-200)));
 if(unexpectedDownloads!==1)throw Error('Quantidade inesperada de downloads após segunda exportação: '+unexpectedDownloads);
 const wakeAfterRepeat=await page.evaluate(()=>window.__wakeLockTest);
 if(wakeAfterRepeat.requests!==5||wakeAfterRepeat.releases!==5)throw Error('Wake Lock não liberado após segunda exportação: '+JSON.stringify(wakeAfterRepeat));
 console.log('Exportação consecutiva aprovada: vídeo e áudio audível preservados na segunda gravação.');

 // Regressão móvel: requestData() pode falhar durante o cancelamento.
 // Mesmo assim stop() deve ocorrer e liberar o editor, sem entregar um arquivo parcial.
 await page.click('#saveVideo');
 await page.waitForFunction(()=>recorder?.state==='recording',{timeout:15000});
 await page.evaluate(()=>{
   recorder.requestData=()=>{throw new DOMException('Bloco de mídia indisponível','InvalidStateError')};
 });
 await page.click('#stopVideo');
 await page.waitForFunction(()=>!recording && !document.querySelector('#media').disabled && document.querySelector('#status').textContent.includes('Exportação cancelada.'),{timeout:15000});
 await page.waitForTimeout(300);
 if(unexpectedDownloads!==1)throw Error('Falha de requestData entregou arquivo parcial: '+unexpectedDownloads);
 if(await page.locator('#videoPreview').getAttribute('src')===null)throw Error('Falha de requestData apagou prévia válida');
 const wakeAfterRequestFailure=await page.evaluate(()=>window.__wakeLockTest);
 if(wakeAfterRequestFailure.requests!==6||wakeAfterRequestFailure.releases!==6)
   throw Error('Falha de requestData não liberou Wake Lock: '+JSON.stringify(wakeAfterRequestFailure));
 console.log('Falha simulada de requestData: stop executado, sem arquivo parcial, controles e Wake Lock liberados.');

 // Regressão: se o navegador encerrar o MediaRecorder sem o editor pedir stop(),
 // os bytes gravados até ali não podem ser oferecidos como vídeo finalizado.
 await page.click('#saveVideo');
 await page.waitForFunction(()=>recorder?.state==='recording',{timeout:15000});
 await page.evaluate(()=>recorder.stop());
 await page.waitForFunction(()=>!recording && !document.querySelector('#media').disabled && document.querySelector('#status').textContent.includes('interrompida pelo navegador'),{timeout:15000});
 await page.waitForTimeout(300);
 if(unexpectedDownloads!==1)throw Error('Interrupção inesperada entregou vídeo parcial: '+unexpectedDownloads);
 if(await page.locator('#videoPreview').getAttribute('src')===null)throw Error('Interrupção inesperada apagou a prévia anterior');
 const wakeAfterUnexpectedStop=await page.evaluate(()=>window.__wakeLockTest);
 if(wakeAfterUnexpectedStop.requests!==7||wakeAfterUnexpectedStop.releases!==7)
   throw Error('Interrupção inesperada não liberou Wake Lock: '+JSON.stringify(wakeAfterUnexpectedStop));
 console.log('Stop inesperado do navegador: nenhum download parcial, prévia preservada e controles liberados.');

 // Regressão: ao terminar a gravação, a leitura assíncrona do cabeçalho ainda
 // mantém o botão Cancelar visível. Cancelar nesse intervalo não pode baixar o arquivo.
 await page.evaluate(()=>{
   const original=Blob.prototype.arrayBuffer;
   window.__restoreFinalHeader=()=>{Blob.prototype.arrayBuffer=original};
   window.__finalHeaderHeld=false;
   Blob.prototype.arrayBuffer=function(...args){
     if(this.size===16 && !window.__finalHeaderHeld){
       window.__finalHeaderHeld=true;
       return new Promise((resolve,reject)=>{
         window.__releaseFinalHeader=()=>original.apply(this,args).then(resolve,reject);
       });
     }
     return original.apply(this,args);
   };
 });
 await page.click('#saveVideo');
 await page.waitForFunction(()=>typeof window.__releaseFinalHeader==='function',{timeout:30000});
 const finalizing=await page.evaluate(()=>({
   recording,canCancel:document.querySelector('#stopVideo').style.display==='block',
   editingLocked:document.querySelector('#headline').disabled
 }));
 if(!finalizing.recording||!finalizing.canCancel||!finalizing.editingLocked)
   throw Error('Finalização não manteve cancelamento disponível: '+JSON.stringify(finalizing));
 await page.click('#stopVideo');
 await page.evaluate(()=>{window.__releaseFinalHeader();window.__restoreFinalHeader()});
 await page.waitForFunction(()=>!recording && !document.querySelector('#media').disabled && document.querySelector('#status').textContent.includes('Exportação cancelada.'),{timeout:15000});
 await page.waitForTimeout(300);
 if(unexpectedDownloads!==1)throw Error('Cancelamento durante validação entregou arquivo indevido: '+unexpectedDownloads);
 if(await page.locator('#videoPreview').getAttribute('src')===null)throw Error('Cancelamento na finalização apagou prévia válida');
 const wakeAfterFinalCancel=await page.evaluate(()=>window.__wakeLockTest);
 if(wakeAfterFinalCancel.requests!==8||wakeAfterFinalCancel.releases!==8)
   throw Error('Cancelamento na finalização não liberou Wake Lock: '+JSON.stringify(wakeAfterFinalCancel));
 console.log('Cancelamento durante validação assíncrona: sem download, prévia e controles preservados.');

 if(errors.length)throw Error('Erros no navegador: '+errors.join(' | '));
 console.log('Vídeo exportado com imagem e áudio:',name,fs.statSync(target).size,'bytes; streams:',types.join(','));
}finally{await browser.close()}
