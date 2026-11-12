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
  // Limite defensivo para evitar ícones desproporcionais no pacote offline.
  if(Buffer.byteLength(svg,'utf8')>256*1024)
    throw Error('Ícone SVG excede 256 KiB: '+icon.src);
  // Declarações XML, instruções de processamento e comentários podem ocultar
  // conteúdo ativo ou depender de interpretações diferentes entre navegadores.
  if(/<\?(?:xml|xml-stylesheet|[^?]+)\b/i.test(svg)||/<!--[\s\S]*?-->/.test(svg)||/<\s*!/i.test(svg))
    throw Error('SVG contém instruções XML ou marcação não permitida: '+icon.src);
  if(!/^\s*<svg\b/i.test(svg)||!/<\/svg>\s*$/i.test(svg))
    throw Error('Estrutura SVG inválida: '+icon.src);
  // O namespace SVG oficial é obrigatório e não constitui carregamento remoto.
  // Removê-lo somente da análise de URLs mantém bloqueadas outras referências.
  if(!/<svg\s+[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg))
    throw Error('Namespace SVG oficial ausente: '+icon.src);
  const svgWithoutNamespace=svg.replace('xmlns="http://www.w3.org/2000/svg"','');
  if(/<\s*(?:script|foreignObject|iframe|object|embed|image|use|animate|set)\b/i.test(svg)||
     /\bon[a-z]+\s*=/i.test(svg)||
     /\b(?:xlink:href|formaction|style)\s*=/i.test(svg)||
     /\b(?:expression\s*\(|-moz-binding|behavior\s*:)/i.test(svg)||
     /\b(?:href|src)\s*=/i.test(svg)||
     /(?:@import|url\s*\(|javascript:|data:|https?:\/\/|<\!DOCTYPE|<\!ENTITY)/i.test(svgWithoutNamespace))
    throw Error('SVG com referência ativa ou externa: '+icon.src);
}
console.log('Ícones SVG locais sem referências ativas: OK');
