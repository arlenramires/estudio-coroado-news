#!/usr/bin/env node
// Teste real do conversor local: WebM com áudio -> MP4 H.264/AAC.
import {mkdtempSync,rmSync,existsSync,readFileSync,writeFileSync,readdirSync,symlinkSync,lstatSync} from 'node:fs';
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
 run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=320x240:r=12:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libvpx','-b:v','150k','-c:a','libopus','-metadata','title=Privado-Estudio-Teste','-shortest',input]);
 run('node',['scripts/converter-mp4.mjs',input,output]);
 const info=JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name:format=duration:format_tags=title','-of','json',output]));
 if(info.format?.tags?.title)throw new Error('MP4 vazou título/metadados do arquivo original');
 // A presença de codec AAC não basta: decodifique a faixa e confirme que o tom
 // de teste realmente sobreviveu à conversão (evita MP4 com áudio mudo).
 const audioCheck=spawnSync('ffmpeg',['-hide_banner','-nostdin','-i',output,'-map','0:a:0','-af','volumedetect','-f','null','-'],{encoding:'utf8',maxBuffer:4*1024*1024});
 if(audioCheck.error||audioCheck.status!==0)throw new Error('Não foi possível decodificar o áudio do MP4: '+(audioCheck.stderr||audioCheck.error?.message));
 const volume=audioCheck.stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
 if(!volume||!Number.isFinite(Number(volume[1]))||Number(volume[1]) < -45)
   throw new Error('Áudio AAC ausente ou praticamente mudo após conversão: '+(volume?.[1]??'sem medição'));

 if(!info.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264')||!info.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac')||!(Number(info.format.duration)>0))throw new Error('MP4 sem H.264/AAC ou duração');
 // Caminhos com espaços e caracteres Unicode são comuns em Downloads no Windows/Android.
 // O conversor deve aceitar esses nomes sem invocar shell e preservar o original.
 const unicodeInput=join(dir,'vídeo de entrada ção.webm');
 const unicodeOutput=join(dir,'resultado com áudio ção.mp4');
 writeFileSync(unicodeInput,readFileSync(input));
 const unicodeOriginal=readFileSync(unicodeInput);
 run('node',['scripts/converter-mp4.mjs',unicodeInput,unicodeOutput]);
 const unicodeInfo=JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name:format=duration','-of','json',unicodeOutput]));
 if(!unicodeInfo.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264')||
    !unicodeInfo.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac')||
    !(Number(unicodeInfo.format.duration)>0))
   throw new Error('Conversão com nome Unicode/espaços não produziu MP4 H.264/AAC válido');
 if(!readFileSync(unicodeInput).equals(unicodeOriginal))
   throw new Error('Conversão com nome Unicode alterou o vídeo original');
 if(readdirSync(dir).some(name=>name.startsWith('.resultado com áudio ção.mp4.')))
   throw new Error('Conversão com nome Unicode deixou temporários');
 // Repetir a conversão para a mesma saída deve substituir o MP4 antigo
 // apenas depois de validar o novo arquivo, sem deixar temporários.
 writeFileSync(output,'arquivo anterior');
 run('node',['scripts/converter-mp4.mjs',input,output]);
 const replaced=JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name:format=duration','-of','json',output]));
 if(!replaced.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264')||
    !replaced.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac')||
    !(Number(replaced.format.duration)>0))throw new Error('Segunda conversão não substituiu MP4 anterior por H.264/AAC válido');
 // A segunda conversão deve manter áudio audível, não apenas declarar uma faixa AAC.
 const secondAudio=spawnSync('ffmpeg',['-hide_banner','-nostdin','-i',output,'-map','0:a:0','-af','volumedetect','-f','null','-'],{encoding:'utf8',maxBuffer:4*1024*1024});
 if(secondAudio.error||secondAudio.status!==0)
   throw new Error('Não foi possível decodificar o áudio da segunda conversão: '+(secondAudio.stderr||secondAudio.error?.message));
 const secondVolume=secondAudio.stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
 if(!secondVolume||!Number.isFinite(Number(secondVolume[1]))||Number(secondVolume[1]) < -45)
   throw new Error('Segunda conversão produziu áudio mudo ou inaudível: '+(secondVolume?.[1]??'sem medição'));
 if(readdirSync(dir).some(name=>name.startsWith('.saida.mp4.')))throw new Error('Conversão bem-sucedida deixou arquivo temporário');
 // Um MP4 renomeado para .webm não deve passar por WebM legítimo.
 const disguised=join(dir,'mp4-disfarcado.webm'),protectedOutput=join(dir,'saida-protegida.mp4');
 writeFileSync(disguised,readFileSync(output));
 writeFileSync(protectedOutput,'arquivo anterior preservado');
 run('node',['scripts/converter-mp4.mjs',disguised,protectedOutput],1);
 if(readFileSync(protectedOutput,'utf8')!=='arquivo anterior preservado')
   throw new Error('Contêiner disfarçado sobrescreveu o MP4 anterior');
 if(readdirSync(dir).some(name=>name.startsWith('.saida-protegida.mp4.')))
   throw new Error('Contêiner disfarçado deixou arquivo temporário');
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
 // Uma gravação WebM truncada deve falhar sem substituir uma exportação anterior.
 // Testa especificamente o caminho em que o cabeçalho existe, mas faltam dados.
 const truncated=join(dir,'truncado.webm'),truncatedOutput=join(dir,'truncado.mp4');
 const completeWebm=readFileSync(input);
 writeFileSync(truncated,completeWebm.subarray(0,Math.min(128,completeWebm.length)));
 writeFileSync(truncatedOutput,'exportacao anterior preservada');
 run('node',['scripts/converter-mp4.mjs',truncated,truncatedOutput],1);
 if(readFileSync(truncatedOutput,'utf8')!=='exportacao anterior preservada')
   throw new Error('WebM truncado substituiu exportação anterior');
 if(readdirSync(dir).some(name=>name.startsWith('.truncado.mp4.')))
   throw new Error('WebM truncado deixou arquivo temporário');
 // Um link simbólico de entrada deve ser recusado, inclusive quando aponta
 // para uma gravação WebM legítima, sem tocar no destino existente.
 const linkedInput=join(dir,'entrada-link.webm'),linkedInputOutput=join(dir,'entrada-link.mp4');
 symlinkSync(input,linkedInput);
 writeFileSync(linkedInputOutput,'saida anterior');
 run('node',['scripts/converter-mp4.mjs',linkedInput,linkedInputOutput],2);
 if(readFileSync(linkedInputOutput,'utf8')!=='saida anterior')
   throw new Error('Link simbólico de entrada substituiu saída anterior');
 if(readdirSync(dir).some(name=>name.startsWith('.entrada-link.mp4.')))
   throw new Error('Link simbólico de entrada deixou temporário');
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
 // A saída não pode ser um link simbólico para outro arquivo do usuário.
 const unrelated=join(dir,'documento-importante.txt'),linkedOutput=join(dir,'link-saida.mp4');
 writeFileSync(unrelated,'conteudo protegido');
 symlinkSync(unrelated,linkedOutput);
 run('node',['scripts/converter-mp4.mjs',input,linkedOutput],2);
 if(readFileSync(unrelated,'utf8')!=='conteudo protegido')
   throw new Error('Conversão alterou o alvo de um link simbólico de saída');
 if(!existsSync(linkedOutput))throw new Error('Conversão removeu link simbólico de saída');
 // Um link simbólico pendente não aparece em existsSync, mas ainda é uma saída proibida.
 const dangling=join(dir,'link-pendente.mp4');
 symlinkSync(join(dir,'alvo-inexistente.mp4'),dangling);
 run('node',['scripts/converter-mp4.mjs',input,dangling],2);
 if(!lstatSync(dangling).isSymbolicLink())throw new Error('Conversão substituiu link simbólico pendente');
 // Rejeitar extensão de entrada enganosa e destino que seja diretório,
 // antes de chamar FFmpeg ou alterar arquivos existentes.
 const renamedInput=join(dir,'entrada.mp4');
 writeFileSync(renamedInput,readFileSync(input));
 const rejectedOutput=join(dir,'rejeitado.mp4');
 run('node',['scripts/converter-mp4.mjs',renamedInput,rejectedOutput],2);
 if(existsSync(rejectedOutput))throw new Error('Entrada sem extensão WebM gerou saída');
 run('node',['scripts/converter-mp4.mjs',input,dir],2);
 // O caminho de destino pode terminar em .mp4 e ainda assim ser um diretório.
 const {mkdirSync}=await import('node:fs');
 const directoryOutput=join(dir,'pasta.mp4');
 mkdirSync(directoryOutput);
 run('node',['scripts/converter-mp4.mjs',input,directoryOutput],2);
 if(!lstatSync(directoryOutput).isDirectory())throw new Error('Diretório de saída foi alterado');
 run('node',['scripts/converter-mp4.mjs',input,input],2);
 run('node',['scripts/converter-mp4.mjs',join(dir,'inexistente.webm'),join(dir,'ausente.mp4')],2);
 run('node',['scripts/converter-mp4.mjs',input,join(dir,'extensao.webm')],2);
 console.log('OK: conversão H.264/AAC e rejeição de WebM sem áudio e argumentos inválidos');
}finally{rmSync(dir,{recursive:true,force:true})}
