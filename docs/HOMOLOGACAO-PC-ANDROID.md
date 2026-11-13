# Homologação em aparelhos reais — Estúdio Coroado News 24H

Este roteiro complementa os testes automatizados. **Não** considerar o PWA Android homologado apenas por emulação de tela ou GitHub Actions.

## Pré-condições
- Baixar o artefato `Estudio-Coroado-Privado-PC-Android` de uma execução bem-sucedida do workflow **Testar Estúdio**; extrair integralmente.
- Executar `python Verificar-integridade.py` na pasta extraída; exigir saída de sucesso.
- Manter mídia de teste **local**, sem informações pessoais: foto horizontal e vertical, vídeo de 5–10 s com fala/música autorizada e vídeo sem áudio.
- Registrar modelo do aparelho, versão do Android, versão do Chrome, memória disponível, data, tipo de exportação e eventuais mensagens de erro.

## PC — Chrome e Edge
1. Abrir `Estudio_Coroado_Offline.html` sem rede; conferir que **22 molduras** aparecem e que nenhuma mídia é enviada a terceiros.
2. Selecionar cada uma das 22 molduras, inserir foto, alterar manchete, mover/ajustar mídia e conferir que texto, mascote e composição não são deformados.
3. Em **Feed**, exportar PNG e verificar **1080 × 1350**, nitidez e leitura da manchete; repetir em **Story/Reels** e verificar **1080 × 1920**.
4. Importar vídeo com áudio; testar corte, enquadramento, zoom e tarja; exportar vídeo com áudio. Abrir o arquivo gerado e verificar reprodução, duração, sincronia e som audível. **WebM não é MP4**.
5. Se sair WebM, converter no PC usando `node scripts/converter-mp4.mjs entrada.webm saida.mp4` com FFmpeg/FFprobe instalados. Conferir MP4 H.264/AAC, vídeo e áudio reproduzíveis.
6. Iniciar `Iniciar-PC-Windows.cmd`, abrir `http://127.0.0.1:8765/index.html`, instalar o PWA se o navegador oferecer. Confirmar carregamento das 22 molduras, fechar a janela e testar reabertura offline após a primeira visita.

## Android físico — Chrome + Termux
1. Extrair o pacote no telefone; executar `sh Iniciar-Android-Termux.sh` na pasta extraída, com Python instalado. Conferir que o servidor atende **somente** `127.0.0.1:8765`.
2. No Chrome do **mesmo aparelho**, abrir `http://127.0.0.1:8765/index.html`; aguardar aviso de cache preparado com 22 molduras. Instalar pelo menu do Chrome quando disponível. Registrar quando aparecer apenas “Adicionar à tela inicial”.
3. Abrir o ícone instalado, conferir 22 molduras, editar foto e manchete e exportar PNG Feed/Story. Abrir os PNGs na galeria e verificar dimensões, nitidez e enquadramento.
4. Importar vídeo com som, aplicar corte/zoom/tarja, exportar com a tela **ligada e desbloqueada**. Conferir se a extensão corresponde ao contêiner real, se o arquivo reproduz, se tem som audível e se áudio/vídeo estão sincronizados.
5. Repetir exportação após cancelar uma tentativa. Verificar que nenhum arquivo parcial é entregue e que os controles voltam a funcionar.
6. Desligar Wi-Fi/dados e reabrir o PWA **depois de pré-carregar**; conferir editor e 22 molduras. Não apagar dados do site. O servidor Termux pode precisar continuar ativo para atualização, mas o conteúdo já armazenado deve abrir offline.
7. Testar também `Estudio_Coroado_Offline.html` pelo gerenciador de arquivos, sem confundi-lo com o PWA instalável.

## Critério de aprovação
Marcar cada etapa como **aprovada**, **reprovada** ou **não executada**; anexar nome do dispositivo, versões, arquivos exportados e descrição reproduzível da falha. A instalação Android e o MP4 H.264/AAC **não estão aprovados** até teste em aparelho real e inspeção dos arquivos. Não publicar GitHub Pages nem substituir testes reais por simulação.
