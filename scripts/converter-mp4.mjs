#!/usr/bin/env node
// Conversão local opcional para navegadores que exportam WebM.
// Uso: node scripts/converter-mp4.mjs entrada.webm saida.mp4
import {spawnSync} from 'node:child_process';
import {existsSync,statSync,lstatSync,renameSync,rmSync,realpathSync} from 'node:fs';
import {resolve,extname,dirname,basename,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const [inputArg,outputArg]=process.argv.slice(2);
if(!inputArg||!outputArg){console.error('Uso: node scripts/converter-mp4.mjs entrada.webm saida.mp4 (requer FFmpeg e FFprobe)');process.exit(2)}
const input=resolve(inputArg),output=resolve(outputArg);
if(input===output||extname(input).toLowerCase()!=='.webm'||extname(output).toLowerCase()!=='.mp4'||!existsSync(input)||!lstatSync(input).isFile()||
   !existsSync(dirname(output))||!statSync(dirname(output)).isDirectory()||
   (lstatSync(output,{throwIfNoEntry:false})!==undefined&&!lstatSync(output).isFile())||
   (existsSync(output)&&realpathSync(input)===realpathSync(output))){
 console.error('Entrada inexistente, saída inválida ou caminhos iguais.');process.exit(2);
}
// Converte em arquivo temporário no mesmo diretório: falhas não deixam MP4 parcial.
const temporary=join(dirname(output),'.'+basename(output)+'.'+randomUUID()+'.mp4');
function run(cmd,args,{maxBuffer=4*1024*1024}={}){const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer});if(r.error)throw new Error(cmd+': '+r.error.message);if(r.status!==0)throw new Error(cmd+': '+(r.stderr||r.stdout).slice(-1200));return r.stdout}
function probe(file){return JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=index,codec_type,codec_name,duration:format=format_name,duration','-of','json',file]))}
try{
 const source=probe(input);
 // Não aceitar um MP4 ou outro contêiner renomeado para .webm: a conversão
 // destina-se especificamente a gravações WebM do navegador.
 if(!source.format?.format_name?.split(',').includes('webm'))
   throw new Error('Entrada não é um contêiner WebM válido');
 if(!source.streams?.some(s=>s.codec_type==='video'))throw new Error('Entrada sem faixa de vídeo');
 if(!source.streams.some(s=>s.codec_type==='audio'))throw new Error('Entrada sem faixa de áudio: não é possível recuperar som ausente');
 // Faixas anunciadas no cabeçalho podem estar vazias: verificar pacotes reais
 // antes de gastar tempo convertendo e antes de tocar na saída existente.
 const inputPackets=JSON.parse(run('ffprobe',['-v','error','-count_packets','-show_entries','stream=index,codec_type,nb_read_packets','-of','json',input]));
 // A conversão usa somente 0:v:0 e 0:a:0. Não basta haver pacotes em
 // outra faixa do mesmo tipo se a primeira estiver vazia.
 for(const type of ['video','audio']){
   const selected=source.streams.find(s=>s.codec_type===type);
   const stream=inputPackets.streams?.find(s=>s.index===selected?.index);
   if(!stream||!(Number(stream.nb_read_packets)>0))
     throw new Error('WebM de entrada sem pacotes na primeira faixa de '+type);
 }
 // Verifica o WebM original inteiro antes de codificar. Um cabeçalho e pacotes
 // presentes não garantem que o conteúdo esteja decodificável até o final.
 // Assim, uma entrada corrompida falha sem tocar no MP4 anterior.
 run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-xerror','-err_detect','explode','-i',input,
   '-map','0:v:0','-map','0:a:0','-f','null','-']);
 // Gravações WebM do MediaRecorder frequentemente não trazem duration no
 // cabeçalho. Calcular a duração pelos timestamps reais dos pacotes evita
 // rejeitar vídeos válidos exportados pelo Estúdio.
 let sourceDuration=Number(source.format?.duration);
 if(!Number.isFinite(sourceDuration)||sourceDuration<=0){
   // O JSON de timestamps pode ultrapassar 4 MiB em gravações longas.
   // Reservar limite maior somente para esta consulta, mantendo os demais comandos restritos.
   const packetData=JSON.parse(run('ffprobe',['-v','error','-show_packets','-show_entries',
     'packet=stream_index,pts_time,duration_time','-of','json',input],{maxBuffer:64*1024*1024}));
   // FFmpeg converte apenas 0:v:0 e 0:a:0. Não incluir timestamps de
   // faixas extras que não farão parte do MP4 (podem ter duração diferente).
   const firstVideo=source.streams.findIndex(s=>s.codec_type==='video');
   const firstAudio=source.streams.findIndex(s=>s.codec_type==='audio');
   const streamIndexes=[firstVideo,firstAudio].map(i=>source.streams[i].index??i);
   // Não espalhar todos os timestamps em Math.max(...array): gravações
   // longas podem conter centenas de milhares de pacotes e estourar a pilha.
   const allowedIndexes=new Set(streamIndexes);
   let latest=NaN;
   for(const packet of packetData.packets||[]){
     if(!allowedIndexes.has(packet.stream_index))continue;
     const pts=Number(packet.pts_time);
     const duration=packet.duration_time==null?0:Number(packet.duration_time);
     if(!Number.isFinite(pts)||!Number.isFinite(duration)||duration<0)continue;
     const end=pts+duration;
     if(Number.isFinite(end)&&end>=0&&(Number.isNaN(latest)||end>latest))latest=end;
   }
   sourceDuration=latest;
 }
 if(!Number.isFinite(sourceDuration)||sourceDuration<=0)
   throw new Error('Duração da entrada ausente ou inválida, inclusive nos timestamps dos pacotes');
 run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-i',input,'-map','0:v:0','-map','0:a:0','-map_metadata','-1','-map_chapters','-1','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-preset','medium','-c:a','aac','-b:a','192k','-movflags','+faststart',temporary]);
 const result=probe(temporary);
 if(!result.format?.format_name?.split(',').includes('mp4')||
    !result.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264')||
    !result.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac')||
    !(Number(result.format.duration)>0))throw new Error('Arquivo convertido não passou na validação H.264/AAC');
 // A presença de um stream no cabeçalho não comprova que o codificador
 // escreveu amostras: verificar pacotes reais de vídeo e áudio no MP4.
 const packets=JSON.parse(run('ffprobe',['-v','error','-count_packets','-show_entries','stream=codec_type,nb_read_packets','-of','json',temporary]));
 for(const type of ['video','audio']){
   const stream=packets.streams?.find(s=>s.codec_type===type);
   if(!stream||!(Number(stream.nb_read_packets)>0))
     throw new Error('MP4 sem pacotes decodificáveis de '+type);
 }
 // Pacotes existentes não garantem quadros e amostras decodificáveis.
 // Decodificar ambas as faixas até o fim antes de substituir o MP4 anterior.
 // -xerror interrompe em erros de decodificação, e -nostdin evita bloqueios.
 run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-xerror','-err_detect','explode','-i',temporary,
   '-map','0:v:0','-map','0:a:0','-f','null','-']);
 if(!(statSync(temporary).size>0))throw new Error('MP4 convertido está vazio');
 // Evita entregar um MP4 aparentemente válido, porém truncado ou com duração
 // incompatível com a gravação original. Pequenas diferenças de encoder são normais.
 const outputDuration=Number(result.format.duration);
 const tolerance=Math.max(0.75,sourceDuration*0.02);
 if(Math.abs(outputDuration-sourceDuration)>tolerance)
   throw new Error('Duração do MP4 diverge da entrada: '+sourceDuration+'s → '+outputDuration+'s');
 renameSync(temporary,output);
 console.log('MP4 H.264/AAC validado: '+output);
}catch(err){console.error('Conversão falhou: '+err.message);process.exitCode=1}
finally{rmSync(temporary,{force:true})}
