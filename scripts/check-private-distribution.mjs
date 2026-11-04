import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

// Testa o pacote distribuído, não apenas os templates do gerador.
// O servidor local nunca deve escutar na rede Wi-Fi/LAN.
const root=path.join('dist','Estudio-Coroado-Privado');
const windows=fs.readFileSync(path.join(root,'Iniciar-PC-Windows.cmd'),'utf8');
const android=fs.readFileSync(path.join(root,'Iniciar-Android-Termux.sh'),'utf8');
const offline=fs.readFileSync(path.join(root,'Estudio_Coroado_Offline.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
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
console.log('Integridade do pacote: 22 molduras e recursos PWA idênticos aos originais.');
console.log('Pacote: iniciadores restritos a localhost, PWA local e 22 molduras offline.');
