#!/usr/bin/env node
// Teste real do conversor local: WebM com áudio -> MP4 H.264/AAC.
import {mkdtempSync,rmSync,existsSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'estudio-mp4-'));
function run(cmd,args,expect=0){
 const p=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:4*1024*1024});
 if(p.error)throw new Error(cmd+': '+p.error.message);
 if(p.status!==expect)throw new Error(cmd+' saiu '+p.status+' (esperado '+expect+'): '+(p.stderr||p.stdout).slice(-1500));
 return p.stdout;
}
try{
 const input=join(dir,'entrada.webm'),output=join(dir,'saida.mp4');
 run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=320x240:r=12:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libvpx','-b:v','150k','-c:a','libopus','-shortest',input]);
 run('node',['scripts/converter-mp4.mjs',input,output]);
 const info=JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name:format=duration','-of','json',output]));
 if(!info.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264')||!info.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac')||!(Number(info.format.duration)>0))throw new Error('MP4 sem H.264/AAC ou duração');
 const silent=join(dir,'sem-audio.webm');
 run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=160x120:r=12:d=1','-c:v','libvpx',silent]);
 const invalid=join(dir,'invalido.mp4');
 run('node',['scripts/converter-mp4.mjs',silent,invalid],1);
 if(existsSync(invalid))throw new Error('Conversão falha deixou MP4 parcial');
 writeFileSync(invalid,'arquivo anterior');
 run('node',['scripts/converter-mp4.mjs',silent,invalid],1);
 if(readFileSync(invalid,'utf8')!=='arquivo anterior')throw new Error('Conversão falha sobrescreveu arquivo anterior');
 if(readdirSync(dir).some(name=>name.startsWith('.invalido.mp4.')))throw new Error('Conversão falha deixou arquivo temporário');
 run('node',['scripts/converter-mp4.mjs',input,input],2);
 run('node',['scripts/converter-mp4.mjs',join(dir,'inexistente.webm'),join(dir,'ausente.mp4')],2);
 run('node',['scripts/converter-mp4.mjs',input,join(dir,'extensao.webm')],2);
 console.log('OK: conversão H.264/AAC e rejeição de WebM sem áudio e argumentos inválidos');
}finally{rmSync(dir,{recursive:true,force:true})}
