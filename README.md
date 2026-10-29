# Estúdio Coroado News 24H

Editor independente, exclusivo deste repositório. Nenhum arquivo do portal de notícias nem do Serviço Certo é modificado.

## Molduras
As **22 molduras aprovadas** estão publicadas em `molduras/original_01.webp` até `original_22.webp`. São versões WebP otimizadas das imagens recuperadas do acervo, mantendo composição e mascote, sem redesenho. O catálogo com nomes e dimensões está em `molduras/catalogo-22.json`.

## Usar
Abra `index.html` em um servidor HTTP (ou GitHub Pages quando habilitado), selecione a moldura, adicione foto ou vídeo, ajuste manchete e exporte PNG ou vídeo. A exportação grava MP4 somente quando o navegador oferece MP4 nativo; caso contrário salva WebM com extensão correta. A presença de áudio depende da compatibilidade do navegador. Mantenha a aba ativa durante a exportação em tempo real.

## Testes
`node scripts/check-editor.mjs` valida a sintaxe e os arquivos. Os workflows de Actions executam testes de navegador, PNG e vídeo com áudio via FFmpeg/ffprobe. Testes em Android devem ser feitos no próprio dispositivo.

## Instalação privada (sem GitHub Pages)
O fluxo de publicação pública do GitHub Pages foi **removido**. O repositório não serve como hospedagem privada: se a privacidade do código for necessária, o proprietário deve mudar a visibilidade do repositório para privado em Settings → General → Danger Zone.

### PC — Chrome/Edge
1. Baixe o ZIP do repositório e extraia **todas** as pastas (incluindo `molduras/` e `icons/`).
2. No diretório extraído, execute `python -m http.server 8765 --bind 127.0.0.1` (Windows com Python) ou `python3 -m http.server 8765 --bind 127.0.0.1` (Linux/macOS).
3. Abra `http://127.0.0.1:8765/` no Chrome/Edge. Use a opção **Instalar aplicativo** do navegador quando disponível. A primeira visita precisa carregar as 22 molduras; depois o cache permite uso offline, desde que os dados do site não sejam apagados.

### Android — modo local sem publicação pública
Um PWA exige origem segura (HTTPS ou localhost). Abrir um arquivo `index.html` diretamente ou usar o IP HTTP do PC no celular **não** instala um PWA. É possível executar um servidor local no próprio Android (por exemplo Termux, com Python e os arquivos extraídos no telefone), abrir `http://localhost:8765/` no Chrome e usar **Instalar app / Adicionar à tela inicial**. Este procedimento ainda requer teste em aparelho real e não é um APK.

### Exportação
PNG funciona com a API Canvas. MP4 só quando `MediaRecorder` oferecer gravação MP4 nativa; caso contrário, o formato exportado é WebM. A exportação com áudio e a fluidez precisam ser verificadas em cada aparelho. Mantenha a tela ligada durante a exportação.

### Testes
`node scripts/check-editor.mjs` verifica sintaxe, 22 molduras, manifesto, cache e ausência de workflow público. `scripts/smoke.mjs` testa o carregamento offline após o pré-cache. `scripts/video-smoke.mjs` testa vídeo com áudio no Chrome do runner, mas não substitui teste Android.

## Alternativa imediata: arquivo único offline (PC e celular)
Para usar sem servidor nem instalação, baixe o artefato **Estudio-Coroado-Offline-PC-Celular** da execução bem-sucedida de **Actions → Testar Estúdio**. Extraia o ZIP e abra `Estudio_Coroado_Offline.html` no navegador. As 22 molduras estão incorporadas ao próprio HTML; fotos e vídeos são selecionados localmente e não são enviados a servidores. No Android, abra pelo gerenciador de arquivos com Chrome ou navegador compatível. O HTML local não é PWA instalável, mas permite edição offline; a exportação MP4 depende do navegador.

Para gerar em um PC com Node.js: `node scripts/build-offline.mjs`. O arquivo será criado em `dist/`.
