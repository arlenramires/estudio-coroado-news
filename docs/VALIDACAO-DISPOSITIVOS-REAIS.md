# Validação final em aparelhos reais — Estúdio Coroado News 24H

Este roteiro complementa o CI; **não** significa que um Android físico já foi testado. Não publicar o Estúdio no GitHub Pages.

## PC (Chrome ou Edge)
1. Em **Actions → Testar Estúdio**, escolha uma execução aprovada e baixe o artefato `Estudio-Coroado-Privado-PC-Android`. Extraia o ZIP inteiro.
2. Abra `Estudio_Coroado_Offline.html` sem internet e confira se as 22 molduras aparecem. Selecione cada moldura e confirme que não há imagem ausente, mascote redesenhado ou área de mídia fora da moldura.
3. Importe uma foto e exporte **Feed 1080×1350** e **Reels 1080×1920** em PNG. Abra os arquivos e confira resolução, texto, foto e transparência/bordas.
4. Importe vídeo **com som audível**, ative áudio e exporte duas vezes seguidas. Reproduza os dois arquivos no navegador e em um player independente. Registre formato real (.mp4 ou .webm), duração, imagem e áudio; **não renomeie WebM para MP4**.
5. Execute `Iniciar-PC-Windows.cmd` (Windows) ou inicie `python3 -m http.server 8765 --bind 127.0.0.1` na pasta extraída. Abra `http://127.0.0.1:8765/index.html`, instale o PWA se oferecido, visite todas as molduras, desconecte a rede e reabra o aplicativo.

## Android físico (Chrome)
1. Extraia o pacote no próprio telefone. Para uso imediato, abra o HTML offline no navegador; isso **não instala um PWA**.
2. Para instalação PWA, instale Termux e Python, autorize armazenamento quando necessário e execute `sh Iniciar-Android-Termux.sh` na pasta extraída. No Chrome do mesmo telefone, abra `http://127.0.0.1:8765/index.html`. Use **Instalar app** ou **Adicionar à tela inicial** se disponível.
3. Aguarde o carregamento das 22 molduras; desligue Wi-Fi e dados móveis e reabra o PWA. Confira molduras, editor e PNG em Feed e Reels.
4. Importe um vídeo com áudio, mantenha o Chrome em primeiro plano e a tela desbloqueada. Exporte duas vezes. Ouça ambos os arquivos **fora do Estúdio**; registre se foram MP4/H.264/AAC ou WebM e se o áudio está audível.
5. Durante outra exportação, bloqueie a tela ou troque de aplicativo: o Estúdio deve cancelar a gravação e **não** oferecer arquivo parcial. Confira se o editor permite tentar novamente.
6. Reinicie o telefone, reabra o PWA com Termux/servidor ativo e confira funcionamento offline. Sem o servidor local, o primeiro carregamento e a instalação não são garantidos.

## Registro de aceite
Preencha para cada dispositivo: **modelo / versão Android ou sistema / navegador e versão / 22 molduras / PNG Feed / PNG Reels / vídeo 1 com áudio / vídeo 2 com áudio / formato e codecs / PWA instalado / offline / cancelamento ao bloquear tela / falhas observadas**.

**Critério de conclusão:** nenhuma moldura ausente, editor responsivo, PNG nas dimensões esperadas, dois vídeos reproduzíveis com áudio, cancelamento sem arquivo parcial e PWA instalável e reutilizável no dispositivo testado. Se o navegador não oferecer MP4 nativo, registrar **WebM funcional** como alternativa, sem afirmar que MP4 foi validado. O projeto só deve ser declarado concluído depois desses resultados reais serem conferidos.
