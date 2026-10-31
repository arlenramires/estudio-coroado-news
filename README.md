# Estúdio Coroado News 24H

Editor independente, exclusivo deste repositório. Nenhum arquivo do portal de notícias nem do Serviço Certo é modificado.

## Molduras
As **22 molduras aprovadas** estão publicadas em `molduras/original_01.webp` até `original_22.webp`. São versões WebP otimizadas das imagens recuperadas do acervo, mantendo composição e mascote, sem redesenho. O catálogo com nomes e dimensões está em `molduras/catalogo-22.json`.

## Usar
Abra `index.html` em um servidor HTTP **local** (`127.0.0.1`, sem GitHub Pages), selecione a moldura, adicione foto ou vídeo, ajuste manchete e exporte PNG ou vídeo. Após exportar um vídeo, use a prévia com controles dentro do editor para conferir o resultado antes de publicar; o botão de download permanece disponível. A exportação grava MP4 somente quando o navegador oferece MP4 nativo; caso contrário salva WebM com extensão correta. A presença de áudio depende da compatibilidade do navegador. Mantenha a aba ativa durante a exportação em tempo real. Se o navegador for para segundo plano ou a tela bloquear, a exportação é cancelada e nenhum arquivo parcial é entregue; volte ao Estúdio e exporte novamente. O editor solicita Wake Lock para evitar que a tela apague durante a gravação quando o navegador oferece essa API; a solicitação pode ser negada, portanto mantenha o aparelho desbloqueado e a tela ligada até terminar.

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

## Pacote privado para PC e Android (sem GitHub Pages)
Na execução bem-sucedida de **Actions → Testar Estúdio**, baixe o artefato **Estudio-Coroado-Privado-PC-Android**. O ZIP contém:
- `Estudio_Coroado_Offline.html`: arquivo único para usar imediatamente, offline, sem servidor e sem instalação, com as 22 molduras incorporadas.
- `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` e `molduras/`: PWA completo para instalar no navegador a partir de `localhost`.
- `Iniciar-PC-Windows.cmd` e `Iniciar-Android-Termux.sh`: auxiliares para iniciar servidor local sem publicação pública.
- `LEIA-ME-PRIMEIRO.txt`: instruções passo a passo, incluindo limitações reais de MP4 e Android.

**Uso imediato:** extraia o ZIP e abra `Estudio_Coroado_Offline.html` no Chrome/Edge do PC ou no navegador do Android via gerenciador de arquivos. As fotos e os vídeos selecionados ficam no dispositivo. Esse HTML **não** é um PWA instalável.

**Instalação PWA privada no PC:** extraia tudo, instale Python se necessário, execute `Iniciar-PC-Windows.cmd` e mantenha a janela do servidor aberta. O navegador abre **após** o servidor iniciar, evitando erro de conexão na primeira abertura. Acesse `http://127.0.0.1:8765/index.html` no Chrome/Edge e escolha **Instalar aplicativo** quando disponível.

**Instalação PWA privada no Android:** use Termux com Python, execute `termux-setup-storage` e autorize acesso se usar Downloads, extraia o ZIP em uma pasta acessível ao Termux (por exemplo `~/storage/downloads/`), execute `sh Iniciar-Android-Termux.sh`, abra `http://127.0.0.1:8765/index.html` no Chrome do próprio telefone e use **Instalar app** quando disponível. A instalação e exportação com áudio **ainda precisam de validação em Android físico**; testes automatizados simulam uma tela móvel, mas não são um aparelho real.

O código-fonte no GitHub **continua público** enquanto o proprietário não alterar a visibilidade do repositório. A entrega não ativa GitHub Pages, não fornece APK e não hospeda dados pessoais. MP4 depende de suporte nativo do navegador; WebM é a alternativa quando não houver MP4.

Para gerar localmente com Node.js: `node scripts/build-offline.mjs && node scripts/package-private.mjs`. O pacote será criado em `dist/Estudio-Coroado-Privado/`.

## Qualidade da imagem: PNG e vídeo
O botão **Salvar PNG** gera uma imagem estática, não um vídeo. A opção **Feed** usa 1080 × 1350; **Reels/Story** usa 1080 × 1920. Para evitar texto tremido ou imagem esticada, selecione o formato final **antes** de exportar, use foto/vídeo de origem com resolução suficiente e confira o arquivo baixado em tamanho real (100%), não apenas a miniatura do aplicativo de mensagens. Enviar uma imagem como foto por mensageiros pode recomprimir o arquivo; prefira enviar o PNG como documento/arquivo.

Se o nome aparecer como **PNG4**, verifique a extensão real do arquivo: o formato correto de imagem é **.png**. Para publicação com movimento e áudio, use **Exportar vídeo**; o editor não transforma um PNG em vídeo. Se o navegador só disponibilizar WebM, não renomeie o arquivo para MP4: isso não converte o codec. Para obter MP4 universal, converta o WebM com um codificador H.264/AAC externo e confira o áudio antes da publicação.
