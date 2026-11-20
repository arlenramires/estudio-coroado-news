# Homologação final — Estúdio Coroado News 24H

> Estado: **pendente de execução em dispositivos reais**. Este roteiro não é evidência de aprovação.

## Registro obrigatório
- Data e responsável:
- Commit SHA e nome do artefato ZIP:
- Sistema operacional, versão e navegador:
- Dispositivo (modelo) e armazenamento livre:
- Resultado por cenário: APROVADO / FALHOU / NÃO TESTADO
- Arquivo produzido (nome, tamanho e extensão):
- Erro observado e passos exatos para reproduzir:

## Matriz de aceitação

| Cenário | PC Chrome/Edge | Android Chrome |
|---|---|---|
| Pacote extraído com as 22 molduras, sem arquivos ausentes | NÃO TESTADO | NÃO TESTADO |
| Editor abre em localhost, sem GitHub Pages | NÃO TESTADO | NÃO TESTADO |
| Instalação PWA oferecida pelo navegador | NÃO TESTADO | NÃO TESTADO |
| Reabrir offline, selecionar as 22 molduras | NÃO TESTADO | NÃO TESTADO |
| Coroadinho original sem deformação, mídia por trás da moldura | NÃO TESTADO | NÃO TESTADO |
| Foto e vídeo: zoom, posição, manchete e troca de moldura | NÃO TESTADO | NÃO TESTADO |
| PNG Feed 1080 × 1350, abrir e inspecionar | NÃO TESTADO | NÃO TESTADO |
| PNG Story/Reels 1080 × 1920, abrir e inspecionar | NÃO TESTADO | NÃO TESTADO |
| Vídeo com áudio: reproduzir, ouvir e verificar sincronismo | NÃO TESTADO | NÃO TESTADO |
| MP4 real H.264/AAC (nativo ou convertido no PC) | NÃO TESTADO | NÃO TESTADO |
| Fechar e reabrir aplicativo sem perder acesso offline | NÃO TESTADO | NÃO TESTADO |

## Evidências mínimas

1. Registrar captura do editor com o catálogo completo e um exemplo em Feed e Story.
2. Conferir os arquivos PNG em resolução integral, incluindo bordas, transparência e legibilidade.
3. Registrar formato real do vídeo com `ffprobe` no PC (contêiner, codec de vídeo, codec de áudio, duração). **Renomear WebM para MP4 não converte**.
4. Conferir áudio audível e sincronizado ouvindo o arquivo exportado, não apenas olhando a extensão.
5. Confirmar que o servidor local usa apenas `127.0.0.1` e que GitHub Pages permanece desativado.
6. Não anexar fotos, vídeos pessoais ou credenciais a issues públicas.

## Critério de conclusão

Somente declarar entrega concluída após testes automatizados aprovados **e** registro de homologação real no PC e Android. Se o navegador Android não oferecer instalação PWA, documentar a limitação e validar o HTML offline como alternativa, sem declarar APK ou MP4 nativo como disponíveis.
