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
 const sourceBeforeConversion=readFileSync(input);
 run('node',['scripts/converter-mp4.mjs',input,output]);
 // Exportar MP4 nunca deve alterar o WebM original, mesmo quando a conversão é bem-sucedida.
 if(!readFileSync(input).equals(sourceBeforeConversion))
   throw new Error('Conversão bem-sucedida modificou o WebM original');
 if(readdirSync(dir).some(name=>name.startsWith('.saida.mp4.')))
   throw new Error('Conversão inicial deixou arquivo temporário');
 const info=JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name:format=duration:format_tags=title','-of','json',output]));
 if(info.format?.tags?.title)throw new Error('MP4 vazou título/metadados do arquivo original');
 // Compatibilidade de publicação: H.264 em yuv420p e índice MP4 (moov)
 // antes dos dados de mídia (mdat), permitindo reprodução progressiva.
 const videoDetails=JSON.parse(run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=pix_fmt','-of','json',output]));
 if(videoDetails.streams?.[0]?.pix_fmt!=='yuv420p')
   throw new Error('MP4 não usa pixel format yuv420p compatível com redes sociais');
 // Confirmar propriedades reais das faixas, além do nome dos codecs.
 const videoTrack=videoDetails.streams?.[0];
 const dimensions=JSON.parse(run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',output])).streams?.[0];
 if(dimensions?.width!==320||dimensions?.height!==240)
   throw new Error('Conversão alterou as dimensões esperadas do vídeo de teste');
 const audioTrack=JSON.parse(run('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=sample_rate,channels','-of','json',output])).streams?.[0];
 if(!(Number(audioTrack?.sample_rate)>0&&Number.isInteger(audioTrack?.channels)&&audioTrack.channels>0))
   throw new Error('MP4 sem frequência de amostragem ou canais AAC válidos');
 const mp4Bytes=readFileSync(output);
 const moovPosition=mp4Bytes.indexOf(Buffer.from('moov'));
 const mdatPosition=mp4Bytes.indexOf(Buffer.from('mdat'));
 if(moovPosition<0||mdatPosition<0||moovPosition>mdatPosition)
   throw new Error('MP4 não possui moov antes de mdat (faststart)');

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
 // Uma gravação somente de áudio também deve ser rejeitada sem substituir
 // um MP4 já existente e sem deixar arquivo temporário.
 const audioOnly=join(dir,'som-sem-imagem.webm');
 const audioOnlyOutput=join(dir,'som-sem-imagem.mp4');
 run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libopus',audioOnly]);
 writeFileSync(audioOnlyOutput,'video anterior preservado');
 run('node',['scripts/converter-mp4.mjs',audioOnly,audioOnlyOutput],1);
 if(readFileSync(audioOnlyOutput,'utf8')!=='video anterior preservado')
   throw new Error('WebM apenas com áudio substituiu MP4 anterior');
 if(readdirSync(dir).some(name=>name.startsWith('.som-sem-imagem.mp4.')))
   throw new Error('WebM apenas com áudio deixou temporário');
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
 // Arquivo WebM vazio deve ser recusado sem apagar uma exportação anterior
 // nem deixar um arquivo temporário com aparência de MP4.
 const emptyWebm=join(dir,'vazio.webm'),emptyOutput=join(dir,'vazio.mp4');
 writeFileSync(emptyWebm,'');
 writeFileSync(emptyOutput,'mp4 anterior protegido');
 run('node',['scripts/converter-mp4.mjs',emptyWebm,emptyOutput],1);
 if(readFileSync(emptyOutput,'utf8')!=='mp4 anterior protegido')
   throw new Error('WebM vazio substituiu MP4 anterior');
 if(readdirSync(dir).some(name=>name.startsWith('.vazio.mp4.')))
   throw new Error('WebM vazio deixou arquivo temporário');
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
 // Uma gravação com cabeçalho e faixas reais, mas cortada no meio do fluxo,
 // não pode substituir o MP4 anterior nem deixar resíduos temporários.
 // Diferente do truncamento de 128 bytes, este caso exercita a decodificação.
 const halfWebm=join(dir,'interrompido.webm'),halfOutput=join(dir,'interrompido.mp4');
 writeFileSync(halfWebm,completeWebm.subarray(0,Math.floor(completeWebm.length/2)));
 writeFileSync(halfOutput,'MP4 anterior seguro');
 run('node',['scripts/converter-mp4.mjs',halfWebm,halfOutput],1);
 if(readFileSync(halfOutput,'utf8')!=='MP4 anterior seguro')
   throw new Error('WebM interrompido sobrescreveu MP4 anterior');
 if(readdirSync(dir).some(name=>name.startsWith('.interrompido.mp4.')))
   throw new Error('WebM interrompido deixou arquivo temporário');
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
 // Link simbólico pendente de entrada deve falhar como argumento inválido,
 // sem lançar exceção não tratada nem modificar uma saída anterior.
 const danglingInput=join(dir,'entrada-pendente.webm');
 const danglingInputOutput=join(dir,'pendente-saida.mp4');
 symlinkSync(join(dir,'webm-que-nao-existe.webm'),danglingInput);
 writeFileSync(danglingInputOutput,'saida intacta');
 run('node',['scripts/converter-mp4.mjs',danglingInput,danglingInputOutput],2);
 if(readFileSync(danglingInputOutput,'utf8')!=='saida intacta')
   throw new Error('Link pendente de entrada alterou saída anterior');
 if(readdirSync(dir).some(name=>name.startsWith('.pendente-saida.mp4.')))
   throw new Error('Link pendente de entrada deixou temporário');
 // Falha de conversão por diretório de destino inexistente também deve preservar a entrada.
 const inputBeforeFailure=readFileSync(input);
 // Destino inexistente deve ser rejeitado na validação dos argumentos,
 // antes de iniciar FFmpeg (código 2), sem alterar a gravação original.
 run('node',['scripts/converter-mp4.mjs',input,join(dir,'diretorio-ausente','saida.mp4')],2);
 if(!readFileSync(input).equals(inputBeforeFailure))
   throw new Error('Falha no destino alterou o vídeo original');
 // Não gravar em diretório de saída que seja link simbólico: evita
 // redirecionar a exportação para uma pasta inesperada.
 const linkedDir=join(dir,'diretorio-link');
 symlinkSync(dir,linkedDir,'dir');
 // Também recusar WebM acessado por ancestral simbólico, mesmo que o arquivo
 // final não seja um link: a validação deve ser simétrica à do destino.
 const inputViaLinkedDir=join(linkedDir,'entrada.webm');
 const outputFromLinkedInput=join(dir,'origem-simbolica.mp4');
 writeFileSync(outputFromLinkedInput,'saida protegida');
 run('node',['scripts/converter-mp4.mjs',inputViaLinkedDir,outputFromLinkedInput],2);
 if(readFileSync(outputFromLinkedInput,'utf8')!=='saida protegida')
   throw new Error('Entrada por diretório simbólico alterou MP4 anterior');
 if(readdirSync(dir).some(name=>name.startsWith('.origem-simbolica.mp4.')))
   throw new Error('Entrada por diretório simbólico deixou temporário');
 const linkedDirOutput=join(linkedDir,'nao-criar.mp4');
 run('node',['scripts/converter-mp4.mjs',input,linkedDirOutput],2);
 if(existsSync(join(dir,'nao-criar.mp4')))
   throw new Error('Conversão escreveu através de diretório simbólico');
 // O link pode estar em um ancestral, não apenas na pasta imediatamente anterior.
 const nestedLinkedDir=join(linkedDir,'subpasta-real');
 const {mkdirSync:makeNestedDir}=await import('node:fs');
 makeNestedDir(join(dir,'subpasta-real'));
 const nestedLinkedOutput=join(nestedLinkedDir,'nao-criar-aninhado.mp4');
 run('node',['scripts/converter-mp4.mjs',input,nestedLinkedOutput],2);
 if(existsSync(join(dir,'subpasta-real','nao-criar-aninhado.mp4')))
   throw new Error('Conversão atravessou um ancestral simbólico do destino');
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
