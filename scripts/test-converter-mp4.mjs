#!/usr/bin/env node
// Teste real do conversor local: WebM com áudio -> MP4 H.264/AAC.
import {mkdtempSync,rmSync,existsSync,readFileSync,writeFileSync,readdirSync,symlinkSync} from 'node:fs';
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
 // Repetir a conversão para a mesma saída deve substituir o MP4 antigo
 // apenas depois de validar o novo arquivo, sem deixar temporários.
 writeFileSync(output,'arquivo anterior');
 run('node',['scripts/converter-mp4.mjs',input,output]);
 const replaced=JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name:format=duration','-of','json',output]));
 if(!replaced.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264')||
    !replaced.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac')||
    !(Number(replaced.format.duration)>0))throw new Error('Segunda conversão não substituiu MP4 anterior por H.264/AAC válido');
 if(readdirSync(dir).some(name=>name.startsWith('.saida.mp4.')))throw new Error('Conversão bem-sucedida deixou arquivo temporário');
 const silent=join(dir,'sem-audio.webm');
 run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=160x120:r=12:d=1','-c:v','libvpx',silent]);
 const invalid=join(dir,'invalido.mp4');
 run('node',['scripts/converter-mp4.mjs',silent,invalid],1);
 if(existsSync(invalid))throw new Error('Conversão falha deixou MP4 parcial');
 writeFileSync(invalid,'arquivo anterior');
 run('node',['scripts/converter-mp4.mjs',silent,invalid],1);
 if(readFileSync(invalid,'utf8')!=='arquivo anterior')throw new Error('Conversão falha sobrescreveu arquivo anterior');
 if(readdirSync(dir).some(name=>name.startsWith('.invalido.mp4.')))throw new Error('Conversão falha deixou arquivo temporário');
 // Arquivo com extensão WebM, mas conteúdo inválido: não deve apagar a saída anterior.
 const corrupted=join(dir,'corrompido.webm'),preserved=join(dir,'preservado.mp4');
 writeFileSync(corrupted,'nao e um arquivo de video');
 writeFileSync(preserved,'MP4 anterior intacto');
 run('node',['scripts/converter-mp4.mjs',corrupted,preserved],1);
 if(readFileSync(preserved,'utf8')!=='MP4 anterior intacto')
   throw new Error('Entrada corrompida sobrescreveu MP4 anterior');
 if(readdirSync(dir).some(name=>name.startsWith('.preservado.mp4.')))
   throw new Error('Entrada corrompida deixou arquivo temporário');
 // Falha de conversão por diretório de destino inexistente também deve preservar a entrada.
 const inputBeforeFailure=readFileSync(input);
 run('node',['scripts/converter-mp4.mjs',input,join(dir,'diretorio-ausente','saida.mp4')],1);
 if(!readFileSync(input).equals(inputBeforeFailure))
   throw new Error('Falha no destino alterou o vídeo original');
 const alias=join(dir,'alias.mp4');
 symlinkSync(input,alias);
 const original=readFileSync(input);
 run('node',['scripts/converter-mp4.mjs',input,alias],2);
 if(!readFileSync(input).equals(original))throw new Error('Alias da entrada foi alterado');
 run('node',['scripts/converter-mp4.mjs',input,input],2);
 run('node',['scripts/converter-mp4.mjs',join(dir,'inexistente.webm'),join(dir,'ausente.mp4')],2);
 run('node',['scripts/converter-mp4.mjs',input,join(dir,'extensao.webm')],2);
 console.log('OK: conversão H.264/AAC e rejeição de WebM sem áudio e argumentos inválidos');
}finally{rmSync(dir,{recursive:true,force:true})}
