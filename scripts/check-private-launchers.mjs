import fs from 'node:fs';
import assert from 'node:assert/strict';

// Regressão dos iniciadores: não expor a interface na rede local,
// nem abrir o navegador antes de o servidor estar escutando.
const source=fs.readFileSync('scripts/package-private.mjs','utf8');
assert.match(source,/ThreadingHTTPServer\(\('127\.0\.0\.1',8765\)/,
  'Windows deve escutar somente em loopback');
assert.match(source,/threading\.Timer\(0\.5,lambda: webbrowser\.open/,
  'Windows deve abrir o navegador após iniciar o servidor');
assert.match(source,/s\.serve_forever\(\)/,
  'Windows deve manter servidor local ativo');
assert.match(source,/python -m http\.server 8765 --bind 127\.0\.0\.1/,
  'Android deve escutar somente em loopback');
assert.match(source,/python Verificar-integridade\.py/,
  'Android deve verificar integridade antes de servir arquivos');
assert.match(source,/py -3 Verificar-integridade\.py/,
  'Windows com py deve verificar integridade');
assert.match(source,/if errorlevel 1 goto invalid/,
  'Windows deve impedir servidor quando integridade falha');
assert.doesNotMatch(source,/--bind 0\.0\.0\.0|\('0\.0\.0\.0',8765\)/,
  'Não permitir servidor exposto à rede');
console.log('Iniciadores privados: loopback e verificação de integridade presentes.');
