# Estúdio Coroado News 24H

Editor independente do portal. **Não altera outros repositórios.**

## Estado verificado
- Editor com **11 molduras originais disponíveis no GitHub**: 9 editorias e 2 molduras verticais.
- Ajustes de enquadramento, manchetes e prévia implementados.
- Exportação PNG testada em Chromium pela automação GitHub Actions.
- Exportação de vídeo tenta MP4 nativo e usa WebM quando MP4 não é suportado, sem trocar falsamente a extensão.
- Teste de vídeo e áudio disponível no workflow `Testar Estúdio`.
- As **22 artes originais completas** foram localizadas na Biblioteca e compiladas também em uma versão HTML offline entregue na conversa, com as 22 imagens embutidas. O HTML offline ainda não está hospedado neste repositório.

## Ativar GitHub Pages (necessita proprietário)
O GitHub Actions não conseguiu criar o site por falta de permissão: `Resource not accessible by integration`.
Abra [Settings → Pages](https://github.com/arlenramires/estudio-coroado-news/settings/pages), selecione **Build and deployment → Source: GitHub Actions** e salve. O workflow `Publicar Estúdio no GitHub Pages` então poderá publicar o site.

Endereço esperado **somente após publicação confirmada**:
`https://arlenramires.github.io/estudio-coroado-news/`

## Testes
`node scripts/check-editor.mjs` valida sintaxe e assets. O workflow `Testar Estúdio` também executa testes reais no Chrome para foto, PNG e vídeo com áudio.

As artes não devem ser redesenhadas; são usados arquivos recuperados do acervo do proprietário.
