import fs from 'node:fs';
import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';
const exe=['/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));if(!exe)throw Error('Chrome não instalado');
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=red:s=320x240:r=15','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','2.5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','test-input.mp4']);
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8765/index.html');
 await page.waitForFunction(()=>document.querySelectorAll('.tile').length===22);
 await page.locator('#media').setInputFiles('test-input.mp4');
 await page.waitForFunction(()=>document.querySelector('#videoTools').style.display==='block' && document.querySelector('#trimEnd').value!=='0',{timeout:15000});
 await page.fill('#trimStart','0');await page.fill('#trimEnd','2');
 const promise=page.waitForEvent('download',{timeout:30000});
 await page.click('#saveVideo');
 const d=await promise;const name=d.suggestedFilename();await d.saveAs('test-output-'+name);
 const target='test-output-'+name;
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','json',target],{encoding:'utf8'})).streams;
 const types=streams.map(x=>x.codec_type);
 if(!types.includes('video'))throw Error('Arquivo exportado sem vídeo');
 if(!types.includes('audio'))throw Error('Arquivo exportado sem áudio: '+JSON.stringify(streams));
 if(errors.length)throw Error('Erros no navegador: '+errors.join(' | '));
 console.log('Vídeo exportado com imagem e áudio:',name,fs.statSync(target).size,'bytes; streams:',types.join(','));
}finally{await browser.close()}
