import assert from 'node:assert/strict';
import fs from 'node:fs';

// Impede que futuras alterações no manifesto enviem o usuário para uma
// instalação externa ou registrem atalhos/handlers fora do Estúdio local.
// O manifesto deve ser um arquivo local regular: links simbólicos podem escapar do pacote privado.
assert.ok(fs.lstatSync('manifest.webmanifest').isFile(), 'Manifesto deve ser arquivo regular, não link simbólico');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
assert.equal(manifest.id,'./');
assert.equal(manifest.scope,'./');
assert.equal(manifest.start_url,'./index.html');
assert.equal(manifest.display,'standalone');
for(const field of ['shortcuts','screenshots','related_applications','protocol_handlers','file_handlers','share_target','url_handlers','scope_extensions']){
  assert.ok(!(field in manifest), 'Manifesto privado não deve declarar '+field);
}
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'Manifesto sem ícones instaláveis');
const seen = new Set();
for(const icon of manifest.icons){
  assert.ok(icon && typeof icon === 'object', 'Ícone inválido');
  assert.equal(typeof icon.src, 'string', 'Ícone sem caminho');
  assert.ok(!seen.has(icon.src), 'Ícone duplicado: '+icon.src);
  seen.add(icon.src);
  assert.equal(icon.type, icon.src.endsWith('.png') ? 'image/png' : 'image/svg+xml', 'MIME incorreto: '+icon.src);
  assert.equal(icon.sizes, icon.src.endsWith('.svg') ? 'any' : icon.src === 'icons/studio-192.png' ? '192x192' : icon.src === 'icons/studio-512.png' ? '512x512' : '', 'Dimensões inesperadas: '+icon.src);

  assert.match(icon.src,/^icons\/[a-z0-9-]+\.(?:png|svg)$/i,'Ícone fora do diretório local');
  assert.ok(!icon.src.includes('..'),'Ícone com travessia de diretório');
  assert.ok(!fs.lstatSync('icons').isSymbolicLink(),'Diretório de ícones não pode ser link simbólico');
  assert.ok(fs.lstatSync(icon.src).isFile(),'Ícone deve ser arquivo regular, não link simbólico');
}
for(const required of ['icons/studio-192.png','icons/studio-512.png']){
  assert.ok(seen.has(required), 'Ícone obrigatório ausente: '+required);
}
console.log('Manifesto privado: sem destinos externos, handlers ou atalhos inesperados.');
