# Estúdio Coroado News 24H

Editor independente, exclusivo deste repositório. Nenhum arquivo do portal de notícias nem do Serviço Certo é modificado.

## Molduras
As **22 molduras aprovadas** estão publicadas em `molduras/original_01.webp` até `original_22.webp`. São versões WebP otimizadas das imagens recuperadas do acervo, mantendo composição e mascote, sem redesenho. O catálogo com nomes e dimensões está em `molduras/catalogo-22.json`.

## Usar
Abra `index.html` em um servidor HTTP (ou GitHub Pages quando habilitado), selecione a moldura, adicione foto ou vídeo, ajuste manchete e exporte PNG ou vídeo. A exportação grava MP4 somente quando o navegador oferece MP4 nativo; caso contrário salva WebM com extensão correta. A presença de áudio depende da compatibilidade do navegador. Mantenha a aba ativa durante a exportação em tempo real.

## Testes
`node scripts/check-editor.mjs` valida a sintaxe e os arquivos. Os workflows de Actions executam testes de navegador, PNG e vídeo com áudio via FFmpeg/ffprobe. Testes em Android devem ser feitos no próprio dispositivo.

## Publicação GitHub Pages
Workflow `.github/workflows/pages.yml` está pronto, mas a habilitação de Pages pode exigir a ação do proprietário. Abra [Settings → Pages](https://github.com/arlenramires/estudio-coroado-news/settings/pages) e selecione **Build and deployment → Source: GitHub Actions**.

Endereço esperado **apenas quando houver publicação confirmada**: https://arlenramires.github.io/estudio-coroado-news/
