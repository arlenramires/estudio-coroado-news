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
for(const icon of manifest.icons||[]){
  assert.match(icon.src,/^icons\/[a-z0-9-]+\.(?:png|svg)$/i,'Ícone fora do diretório local');
  assert.ok(!icon.src.includes('..'),'Ícone com travessia de diretório');
  assert.ok(!fs.lstatSync('icons').isSymbolicLink(),'Diretório de ícones não pode ser link simbólico');
  assert.ok(fs.lstatSync(icon.src).isFile(),'Ícone deve ser arquivo regular, não link simbólico');
}
console.log('Manifesto privado: sem destinos externos, handlers ou atalhos inesperados.');
