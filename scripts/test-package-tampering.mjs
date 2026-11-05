import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve('dist/Estudio-Coroado-Privado');
const sums=path.join(root,'SHA256SUMS.txt');
const original=fs.readFileSync(sums);
const verify=()=>{
  const result=spawnSync(process.execPath,['scripts/verify-private-package.mjs'],{encoding:'utf8'});
  return {status:result.status, output:(result.stdout||'')+(result.stderr||'')};
};
function expectFailure(label,change,restore){
  try{
    change();
    const result=verify();
    if(result.status===0)throw Error('Verificador aceitou adulteração: '+label);
    if(!/Error:|erro|inválid|inseguro|divergente|proibido|ausente|link simbólico/i.test(result.output))
      throw Error('Falha inesperada em '+label+': '+result.output);
    console.log('Adulteração rejeitada: '+label);
  }finally{restore()}
}
if(verify().status!==0)throw Error('Pacote original precisa passar antes dos testes negativos');
const first='molduras/original_01.webp';
const frame=path.join(root,first);
const originalFrame=fs.readFileSync(frame);
expectFailure('moldura alterada',()=>{
  const changed=Buffer.from(originalFrame);
  changed[changed.length-1]^=1;
  fs.writeFileSync(frame,changed);
},()=>fs.writeFileSync(frame,originalFrame));
expectFailure('checksum adulterado',()=>{
  fs.writeFileSync(sums,original.toString('utf8').replace(/^[a-f0-9]/,c=>c==='a'?'b':'a'));
},()=>fs.writeFileSync(sums,original));
expectFailure('caminho de travessia',()=>{
  fs.writeFileSync(sums,original.toString('utf8').replace(first,'../original_01.webp'));
},()=>fs.writeFileSync(sums,original));
const unexpected=path.join(root,'arquivo-nao-listado.txt');
expectFailure('arquivo não listado',()=>fs.writeFileSync(unexpected,'extra'),()=>{
  if(fs.existsSync(unexpected))fs.unlinkSync(unexpected);
});
const symlink=path.join(root,'link-indevido');
try{
  fs.symlinkSync(frame,symlink);
  const result=verify();
  if(result.status===0)throw Error('Verificador aceitou link simbólico extra');
  console.log('Adulteração rejeitada: link simbólico');
}finally{if(fs.existsSync(symlink))fs.unlinkSync(symlink)}

// O verificador distribuído em Python também precisa rejeitar a remoção
// de uma moldura do manifesto, mesmo quando os hashes restantes são válidos.
const pythonVerify=()=>spawnSync('python3',['Verificar-integridade.py'],{cwd:root,encoding:'utf8'});
if(pythonVerify().status!==0)throw Error('Verificador Python rejeitou pacote original');
const manifestText=original.toString('utf8');
const reduced=manifestText.split('\n').filter(line=>!line.endsWith('  molduras/original_22.webp')).join('\n');
if(reduced===manifestText)throw Error('Moldura 22 não encontrada no manifesto');
try{
  fs.writeFileSync(sums,reduced);
  if(pythonVerify().status===0)throw Error('Verificador Python aceitou manifesto sem moldura 22');
  console.log('Adulteração rejeitada: moldura removida do manifesto Python');
}finally{fs.writeFileSync(sums,original)}

if(verify().status!==0)throw Error('Pacote não foi restaurado após testes negativos');
console.log('Testes negativos de integridade concluídos.');
