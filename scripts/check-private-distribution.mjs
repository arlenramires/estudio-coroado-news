import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Testa o pacote distribuído, não apenas os templates do gerador.
// O servidor local nunca deve escutar na rede Wi-Fi/LAN.
const root=path.join('dist','Estudio-Coroado-Privado');
const windows=fs.readFileSync(path.join(root,'Iniciar-PC-Windows.cmd'),'utf8');
const android=fs.readFileSync(path.join(root,'Iniciar-Android-Termux.sh'),'utf8');
const offline=fs.readFileSync(path.join(root,'Estudio_Coroado_Offline.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
// Valida a sintaxe real do shell Android no runner Linux, além das inspeções textuais.
// Um script com aspas desbalanceadas poderia passar no teste de substrings.
if(process.platform!=='win32'){
  const script=path.join(root,'Iniciar-Android-Termux.sh');
  const check=spawnSync('sh',['-n',script],{encoding:'utf8'});
  assert.equal(check.error,undefined,'Não foi possível executar o verificador de sintaxe do shell');
  assert.equal(check.status,0,'Iniciador Android contém erro de sintaxe: '+check.stderr);
}
// Os iniciadores precisam ser executáveis também quando a pasta tem espaços.
// Aspas precedidas de barra invertida são literais no shell e quebram o cd.
assert.ok(windows.includes('cd /d "%~dp0"'), 'Windows: diretório do pacote deve estar entre aspas');
assert.ok(android.includes('cd "$(dirname "$0")"'), 'Android: diretório do pacote deve estar entre aspas');
assert.ok(!windows.includes(String.raw`\"`), 'Windows: aspas não podem estar escapadas');
assert.ok(!android.includes(String.raw`\"`), 'Android: aspas não podem estar escapadas');
assert.ok(windows.includes("ThreadingHTTPServer(('127.0.0.1',8765)"), 'Windows: servidor deve escutar somente em localhost');
assert.ok(android.includes('python -m http.server 8765 --bind 127.0.0.1'), 'Android: servidor deve escutar somente em localhost');
assert.ok(!(windows+android).includes('0.0.0.0'), 'Servidor não pode escutar em todas as interfaces');
assert.equal(manifest.start_url,'./index.html');
assert.equal(manifest.scope,'./');
assert.equal((offline.match(/data:image\/webp;base64,/g)||[]).length,22,
  'HTML offline precisa incorporar exatamente 22 molduras');
for(let i=1;i<=22;i++){
  const name='original_'+String(i).padStart(2,'0')+'.webp';
  assert.ok(fs.statSync(path.join(root,'molduras',name)).size>1000,name);
}
// O ZIP deve transportar os mesmos bytes do acervo aprovado, não apenas arquivos
// com nomes e tamanhos plausíveis. Evita distribuição de molduras desatualizadas.
for(let i=1;i<=22;i++){
  const name='original_'+String(i).padStart(2,'0')+'.webp';
  const source=fs.readFileSync(path.join('molduras',name));
  const distributed=fs.readFileSync(path.join(root,'molduras',name));
  assert.deepEqual(distributed,source,'Moldura divergente no pacote: '+name);
}
// Confere os demais recursos que o PWA precisa servir sem rede externa.
for(const name of ['index.html','manifest.webmanifest','sw.js',
  'icons/studio.svg','icons/studio-192.png','icons/studio-512.png']){
  assert.deepEqual(fs.readFileSync(path.join(root,name)),fs.readFileSync(name),
    'Recurso PWA divergente no pacote: '+name);
}
// O pacote privado também precisa levar o conversor MP4 e seu iniciador
// exatamente como foram testados no repositório, sem versões antigas.
for(const name of ['Converter-MP4-Windows.cmd','scripts/converter-mp4.mjs']){
  const source=fs.readFileSync(name);
  const packaged=fs.readFileSync(path.join(root,name));
  assert.deepEqual(packaged,source,'Conversor MP4 divergente no pacote: '+name);
}
console.log('Conversor MP4: iniciador e script idênticos aos originais.');

// O HTML único precisa funcionar sem acesso ao diretório molduras/.
// Referências residuais podem deixar a prévia vazia ao abrir o arquivo no Android.
assert.ok(!/"src":"molduras\//.test(offline),
  'HTML offline contém caminho de moldura não incorporada');
const embedded=[...offline.matchAll(/"src":"data:image\/webp;base64,([A-Za-z0-9+/=]+)"/g)];
assert.equal(embedded.length,22,'HTML offline deve conter 22 imagens incorporadas');
for(let i=0;i<22;i++){
  const encoded=embedded[i][1];
  const bytes=Buffer.from(encoded,'base64');
  assert.equal(bytes.toString('base64'),encoded,'Base64 inválido na moldura '+(i+1));
  const name='original_'+String(i+1).padStart(2,'0')+'.webp';
  assert.deepEqual(bytes,fs.readFileSync(path.join(root,'molduras',name)),
    'Moldura incorporada fora de ordem ou divergente: '+name);
}
console.log('Integridade do pacote: 22 molduras e recursos PWA idênticos aos originais.');
console.log('Pacote: iniciadores restritos a localhost, PWA local e 22 molduras offline.');


 // Exercita o verificador Python distribuído: não basta conferir os hashes
 // em JavaScript, pois Windows/Termux executam especificamente este script.
 const pythonCandidates=process.platform==='win32'?['py','python']:['python3','python'];
 const python=pythonCandidates.find(bin=>{
   const probe=spawnSync(bin,bin==='py'?['-3','--version']:['--version'],{encoding:'utf8'});
   return !probe.error&&probe.status===0;
 });
 if(python){
   const args=python==='py'?['-3','Verificar-integridade.py']:['Verificar-integridade.py'];
   const valid=spawnSync(python,args,{cwd:root,encoding:'utf8'});
   assert.equal(valid.status,0,'Verificador Python rejeitou pacote válido: '+valid.stderr+valid.stdout);
   // Usa cópia temporária mínima para testar adulteração sem tocar na entrega.
   const os=await import('node:os');
   const crypto=await import('node:crypto');
   const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'estudio-integridade-'));
   try{
     const fixture=path.join(tmp,'Verificar-integridade.py');
     fs.copyFileSync(path.join(root,'Verificar-integridade.py'),fixture);
     const required=['index.html','manifest.webmanifest','sw.js','icons/studio.svg','icons/studio-192.png','icons/studio-512.png',
       'Estudio_Coroado_Offline.html','Iniciar-PC-Windows.cmd','Iniciar-Android-Termux.sh','LEIA-ME-PRIMEIRO.txt','Verificar-integridade.py',
       'Converter-MP4-Windows.cmd','scripts/converter-mp4.mjs',
       ...Array.from({length:22},(_,i)=>'molduras/original_'+String(i+1).padStart(2,'0')+'.webp')];
     for(const name of required){
       const dest=path.join(tmp,name);
       fs.mkdirSync(path.dirname(dest),{recursive:true});
       if(name!=='Verificar-integridade.py')fs.writeFileSync(dest,'conteudo de teste: '+name);
     }
     const sums=required.map(name=>crypto.createHash('sha256').update(fs.readFileSync(path.join(tmp,name))).digest('hex')+'  '+name).sort().join('\n')+'\n';
     fs.writeFileSync(path.join(tmp,'SHA256SUMS.txt'),sums);
     const verify=()=>spawnSync(python,args,{cwd:tmp,encoding:'utf8'});
     assert.equal(verify().status,0,'Verificador Python rejeitou fixture íntegra');
     fs.appendFileSync(path.join(tmp,'index.html'),'alterado');
     assert.notEqual(verify().status,0,'Verificador Python aceitou arquivo adulterado');
     fs.writeFileSync(path.join(tmp,'index.html'),'conteudo de teste: index.html');
     fs.writeFileSync(path.join(tmp,'arquivo-extra.txt'),'nao listado');
     assert.notEqual(verify().status,0,'Verificador Python aceitou arquivo sem checksum');
   }finally{fs.rmSync(tmp,{recursive:true,force:true});}
   console.log('Verificador Python aprovado: pacote real, alteração de conteúdo e arquivo extra.');
 }else{
   console.warn('Python não encontrado: testes do verificador portátil ignorados neste ambiente Node.');
 }


// Teste funcional do iniciador Android com diretório contendo espaços.
// Simula Python local sem abrir portas ou depender de um aparelho físico.
if(process.platform!=='win32'){
  const os=await import('node:os');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'estudio android com espacos '));
  try{
    const bin=path.join(tmp,'bin');
    const app=path.join(tmp,'pacote com espacos');
    fs.mkdirSync(bin);
    fs.mkdirSync(app);
    fs.copyFileSync(path.join(root,'Iniciar-Android-Termux.sh'),path.join(app,'Iniciar-Android-Termux.sh'));
    fs.writeFileSync(path.join(app,'Verificar-integridade.py'),'# fixture de teste\n');
    const fake=path.join(bin,'python');
    fs.writeFileSync(fake,'#!/bin/sh\nprintf "%s\\n" "$*" >> "$ESTUDIO_TEST_LOG"\n');
    fs.chmodSync(fake,0o755);
    const log=path.join(tmp,'python.log');
    const run=spawnSync('sh',[path.join(app,'Iniciar-Android-Termux.sh')],{
      cwd:tmp,encoding:'utf8',env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,ESTUDIO_TEST_LOG:log}
    });
    assert.equal(run.status,0,'Iniciador Android falhou com espaços no caminho: '+run.stderr);
    assert.deepEqual(fs.readFileSync(log,'utf8').trim().split('\n'),[
      'Verificar-integridade.py','-m http.server 8765 --bind 127.0.0.1'
    ],'Iniciador Android não verificou integridade antes de servir somente localhost');
    console.log('Iniciador Android aprovado em execução simulada com espaços no caminho.');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
