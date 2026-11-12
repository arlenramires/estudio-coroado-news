// Regressão: moldura WebP adulterada nunca deve substituir o HTML offline válido.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'estudio-webp-integrity-'));
try {
  fs.mkdirSync(path.join(temp,'scripts'));
  fs.mkdirSync(path.join(temp,'molduras'));
  fs.mkdirSync(path.join(temp,'dist'));
  fs.copyFileSync(path.join(root,'index.html'),path.join(temp,'index.html'));
  fs.copyFileSync(path.join(root,'scripts/build-offline.mjs'),path.join(temp,'scripts/build-offline.mjs'));
  for(let i=1;i<=22;i++){
    const name='original_'+String(i).padStart(2,'0')+'.webp';
    fs.copyFileSync(path.join(root,'molduras',name),path.join(temp,'molduras',name));
  }
  const target=path.join(temp,'dist/Estudio_Coroado_Offline.html');
  fs.writeFileSync(target,'PACOTE_ANTERIOR_VALIDO');
  const frame=path.join(temp,'molduras/original_01.webp');
  const original=fs.readFileSync(frame);
  fs.writeFileSync(frame,original.subarray(0,original.length-1));
  const run=spawnSync(process.execPath,['scripts/build-offline.mjs'],{cwd:temp,encoding:'utf8'});
  assert.notEqual(run.status,0,'WebP truncado deve impedir a compilação');
  assert.match(run.stderr,/WebP inválida ou truncada/);
  assert.equal(fs.readFileSync(target,'utf8'),'PACOTE_ANTERIOR_VALIDO',
    'Falha não pode substituir o HTML offline anterior');
  assert.equal(fs.readdirSync(path.join(temp,'dist')).length,1,
    'Falha não deve deixar arquivo temporário distribuível');
  console.log('OK: WebP truncado rejeitado sem sobrescrever o pacote offline anterior.');

  // Regressões CSS: URLs externas/relativas em atributos style precisam ser
  // rejeitadas, sem apagar a última entrega válida.
  fs.writeFileSync(frame,original);
  const htmlPath=path.join(temp,'index.html');
  const cleanHtml=fs.readFileSync(htmlPath,'utf8');
  for(const [label,fragment] of [
    ['CSS remoto','<div style="background-image:url(https://example.org/x.png)"></div>'],
    ['CSS relativo','<div style="background-image:url(./missing.png)"></div>'],
    ['CSS importado','<style>@import "./missing.css";</style>']
  ]){
    fs.writeFileSync(htmlPath,cleanHtml.replace('</body>',fragment+'</body>'));
    const failure=spawnSync(process.execPath,['scripts/build-offline.mjs'],{cwd:temp,encoding:'utf8'});
    assert.notEqual(failure.status,0,label+' deve bloquear o HTML offline');
    assert.match(failure.stderr,/CSS externo|@import CSS/,label+' deve indicar a dependência');
    assert.equal(fs.readFileSync(target,'utf8'),'PACOTE_ANTERIOR_VALIDO');
    assert.equal(fs.readdirSync(path.join(temp,'dist')).length,1);
  }

  // Uma string JavaScript contendo url() não é CSS e não deve bloquear o pacote.
  fs.writeFileSync(htmlPath,cleanHtml.replace('</body>',
    '<script>const cssExample = "url(https://example.org/example.png)";</script></body>'));
  const success=spawnSync(process.execPath,['scripts/build-offline.mjs'],{cwd:temp,encoding:'utf8'});
  assert.equal(success.status,0,'String JavaScript não pode causar falso positivo: '+success.stderr);
  assert.ok(fs.readFileSync(target,'utf8').includes('data:image/webp;base64,'), 'Pacote deve incorporar molduras WebP');
  console.log('OK: CSS externo rejeitado, pacote preservado e string JS aceita.');
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
