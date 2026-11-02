#!/usr/bin/env node
// Conversão local opcional para navegadores que exportam WebM.
// Uso: node scripts/converter-mp4.mjs entrada.webm saida.mp4
import {spawnSync} from 'node:child_process';
import {existsSync,statSync,renameSync,rmSync,realpathSync} from 'node:fs';
import {resolve,extname,dirname,basename,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const [inputArg,outputArg]=process.argv.slice(2);
if(!inputArg||!outputArg){console.error('Uso: node scripts/converter-mp4.mjs entrada.webm saida.mp4 (requer FFmpeg e FFprobe)');process.exit(2)}
const input=resolve(inputArg),output=resolve(outputArg);
if(input===output||extname(output).toLowerCase()!=='.mp4'||!existsSync(input)||!statSync(input).isFile()||
   (existsSync(output)&&realpathSync(input)===realpathSync(output))){
 console.error('Entrada inexistente, saída inválida ou caminhos iguais.');process.exit(2);
}
// Converte em arquivo temporário no mesmo diretório: falhas não deixam MP4 parcial.
const temporary=join(dirname(output),'.'+basename(output)+'.'+randomUUID()+'.mp4');
function run(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:4*1024*1024});if(r.error)throw new Error(cmd+': '+r.error.message);if(r.status!==0)throw new Error(cmd+': '+(r.stderr||r.stdout).slice(-1200));return r.stdout}
function probe(file){return JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name:format=format_name,duration','-of','json',file]))}
try{
 const source=probe(input);
 if(!source.streams?.some(s=>s.codec_type==='video'))throw new Error('Entrada sem faixa de vídeo');
 if(!source.streams.some(s=>s.codec_type==='audio'))throw new Error('Entrada sem faixa de áudio: não é possível recuperar som ausente');
 run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-i',input,'-map','0:v:0','-map','0:a:0','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-preset','medium','-c:a','aac','-b:a','192k','-movflags','+faststart',temporary]);
 const result=probe(temporary);
 if(!result.format?.format_name?.split(',').includes('mp4')||
    !result.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264')||
    !result.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac')||
    !(Number(result.format.duration)>0))throw new Error('Arquivo convertido não passou na validação H.264/AAC');
 renameSync(temporary,output);
 console.log('MP4 H.264/AAC validado: '+output);
}catch(err){console.error('Conversão falhou: '+err.message);process.exitCode=1}
finally{rmSync(temporary,{force:true})}
