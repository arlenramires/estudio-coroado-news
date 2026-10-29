import fs from 'node:fs';
import {chromium} from 'playwright-core';
import {execFileSync,spawnSync} from 'node:child_process';
const exe=['/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));if(!exe)throw Error('Chrome não instalado');
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=red:s=320x240:r=15','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','2.5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','test-input.mp4']);
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const mobile=process.env.STUDIO_TEST_MOBILE==='1';
const context=await browser.newContext(mobile?{acceptDownloads:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}:{acceptDownloads:true});
const page=await context.newPage();
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
try{
 await page.goto(process.env.STUDIO_URL || 'http://127.0.0.1:8765/index.html');
 await page.waitForFunction(()=>document.querySelectorAll('.tile').length===22);
 await page.locator('#media').setInputFiles('test-input.mp4');
 await page.waitForFunction(()=>document.querySelector('#videoTools').style.display==='block' && document.querySelector('#trimEnd').value!=='0',{timeout:15000});
 await page.fill('#trimStart','0');await page.fill('#trimEnd','2');
 const promise=page.waitForEvent('download',{timeout:30000});
 await page.click('#saveVideo');
 // Enquanto grava, impedir troca de mídia, moldura, texto ou formato (arquivo inconsistente).
 await page.waitForFunction(()=>document.querySelector('#media').disabled && document.querySelector('#editorial').disabled && document.querySelector('#format').disabled && document.querySelector('#headline').disabled && document.querySelector('#savePNG').disabled && [...document.querySelectorAll('#gallery .tile')].every(b=>b.disabled) && document.querySelector('#stopVideo').style.display==='block');
 const d=await promise;
 // A prévia do vídeo final deve ficar disponível no próprio Estúdio, além do download.
 await page.waitForFunction(()=>{
   const preview=document.querySelector('#videoPreview');
   return preview.style.display==='block' && preview.src.startsWith('blob:') && preview.controls;
 },{timeout:10000});
 await page.waitForFunction(()=>!document.querySelector('#media').disabled && !document.querySelector('#editorial').disabled && !document.querySelector('#savePNG').disabled && [...document.querySelectorAll('#gallery .tile')].every(b=>!b.disabled));const name=d.suggestedFilename();await d.saveAs('test-output-'+name);
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
 if(errors.length)throw Error('Erros no navegador: '+errors.join(' | '));
 console.log('Vídeo exportado com imagem e áudio:',name,fs.statSync(target).size,'bytes; streams:',types.join(','));
}finally{await browser.close()}
