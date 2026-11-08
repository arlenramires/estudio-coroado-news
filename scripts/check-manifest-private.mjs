import assert from 'node:assert/strict';
import fs from 'node:fs';

// Impede que futuras alterações no manifesto enviem o usuário para uma
// instalação externa ou registrem atalhos/handlers fora do Estúdio local.
// O manifesto deve ser um arquivo local regular: links simbólicos podem escapar do pacote privado.
assert.ok(fs.lstatSync('manifest.webmanifest').isFile(), 'Manifesto deve ser arquivo regular, não link simbólico');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
// Lista positiva: novas capacidades do manifesto exigem revisão explícita.
// Isso bloqueia extensões futuras de integração, links e lançamento externo
// que uma lista negativa de propriedades conhecidas poderia deixar passar.
const allowedFields=new Set([
  'id','name','short_name','description','lang','start_url','scope','display',
  'background_color','theme_color','icons'
]);
for(const field of Object.keys(manifest)){
  assert.ok(allowedFields.has(field),'Campo não autorizado no manifesto privado: '+field);
}
assert.equal(manifest.id,'./');
assert.equal(manifest.scope,'./');
assert.equal(manifest.start_url,'./index.html');
assert.equal(manifest.display,'standalone');
assert.equal(manifest.lang,'pt-BR', 'Idioma do PWA deve ser português brasileiro');
for (const field of ['name','short_name','description']) {
  assert.ok(typeof manifest[field] === 'string' && manifest[field].trim(), 'Metadado obrigatório ausente: '+field);
}
for (const field of ['background_color','theme_color']) {
  assert.match(manifest[field] ?? '', /^#[0-9a-fA-F]{6}$/, 'Cor inválida no manifesto: '+field);
}
for(const field of ['shortcuts','screenshots','related_applications','protocol_handlers','file_handlers','share_target','url_handlers','scope_extensions']){
  assert.ok(!(field in manifest), 'Manifesto privado não deve declarar '+field);
}
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length === 3, 'Manifesto deve conter os três ícones locais aprovados');
const allowedIcons=new Set(['icons/studio-192.png','icons/studio-512.png','icons/studio.svg']);
const seen = new Set();
for(const icon of manifest.icons){
  assert.ok(icon && typeof icon === 'object', 'Ícone inválido');
  assert.equal(typeof icon.src, 'string', 'Ícone sem caminho');
  assert.ok(allowedIcons.has(icon.src),'Ícone não aprovado: '+icon.src);
  for(const key of Object.keys(icon)){
    assert.ok(['src','sizes','type','purpose'].includes(key),'Propriedade inesperada no ícone: '+key);
  }
  assert.ok(!seen.has(icon.src), 'Ícone duplicado: '+icon.src);
  seen.add(icon.src);
  assert.equal(icon.type, icon.src.endsWith('.png') ? 'image/png' : 'image/svg+xml', 'MIME incorreto: '+icon.src);
  assert.equal(icon.purpose, icon.src.endsWith('.png') ? 'any maskable' : 'any', 'Finalidade do ícone incorreta: '+icon.src);
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
