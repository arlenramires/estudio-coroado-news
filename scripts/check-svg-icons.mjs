import fs from 'node:fs';
import path from 'node:path';

// SVG de ícone não deve executar scripts nem carregar recursos remotos.
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
for(const icon of manifest.icons ?? []){
  if(!icon.src?.endsWith('.svg'))continue;
  if(!/^icons\/[a-zA-Z0-9_-]+\.svg$/.test(icon.src))
    throw Error('Caminho de ícone SVG não permitido: '+icon.src);
  const file=path.resolve(icon.src);
  if(fs.lstatSync(file).isSymbolicLink()||!fs.lstatSync(file).isFile())
    throw Error('Ícone SVG deve ser arquivo regular: '+icon.src);
  const svg=fs.readFileSync(file,'utf8');
  if(!/^\s*<svg\b/i.test(svg)||!/<\/svg>\s*$/i.test(svg))
    throw Error('Estrutura SVG inválida: '+icon.src);
  if(/<\s*(?:script|foreignObject|iframe|object|embed|image|use|animate|set)\b/i.test(svg)||
     /\bon[a-z]+\s*=/i.test(svg)||
     /\b(?:href|src)\s*=/i.test(svg)||
     /(?:@import|url\s*\(|javascript:|data:|https?:\/\/|<\!DOCTYPE|<\!ENTITY)/i.test(svg))
    throw Error('SVG com referência ativa ou externa: '+icon.src);
}
console.log('Ícones SVG locais sem referências ativas: OK');
