# Validação em aparelho real — Estúdio Coroado News 24H

Este roteiro registra **testes ainda não comprovados**. Não confundir simulação de tela móvel no CI com execução em Android físico.

## Preparação segura

1. Em **Actions → Testar Estúdio**, selecione uma execução concluída com sucesso e baixe o artefato `Estudio-Coroado-Privado-PC-Android`.
2. Verifique o ZIP antes de extrair. Não publique o pacote, as fotos ou os vídeos de teste.
3. Confirme que há 22 arquivos `molduras/original_01.webp` a `original_22.webp`, além de `index.html`, `sw.js`, `manifest.webmanifest` e `icons/`.
4. Use uma mídia de teste própria com fala ou som claramente audível e movimento contínuo; anote navegador, versão do Android e modelo do aparelho.

## PC (Chrome e Edge)

- Inicie o servidor em `127.0.0.1:8765`, abra o editor, instale o PWA quando o navegador oferecer a opção.
- Abra cada uma das 22 molduras. Verifique enquadramento, manchete, mascote original e ausência de elementos cortados.
- Exporte PNG em Feed (1080×1350) e Reels (1080×1920). Confira dimensões reais e transparência/composição.
- Exporte um vídeo com áudio. Verifique o contêiner real e extensão correta (.mp4 somente se o arquivo for MP4; senão .webm), duração, movimento e som. Faça uma segunda exportação para detectar áudio perdido.
- Desconecte a rede e recarregue o PWA já instalado: molduras e editor devem continuar disponíveis. Arquivos de mídia do usuário não devem ser enviados à rede.

## Android físico (Chrome)

- Extraia o pacote no telefone e use Termux/Python para servir em `http://127.0.0.1:8765/`; não use o IP HTTP do computador, pois não é origem segura para instalar PWA.
- Instale pelo menu do Chrome, quando disponível. Abra pelo ícone, teste as 22 molduras, selecione foto e vídeo da galeria e exporte PNG nos dois formatos.
- Com a tela **acesa e o aplicativo em primeiro plano**, exporte vídeo com áudio. Reproduza o arquivo exportado fora do Estúdio e confira se o som não ficou mudo e se o vídeo não congelou.
- Durante outra exportação, bloqueie a tela ou troque de aplicativo: a gravação deve ser cancelada sem oferecer arquivo parcial. Volte ao editor e confirme que consegue exportar novamente.
- Ative modo avião **depois do primeiro carregamento completo** e reabra o PWA para confirmar funcionamento offline.

## Registro mínimo do resultado

| Campo | Preencher após teste |
| --- | --- |
| Dispositivo / SO | Pendente |
| Navegador / versão | Pendente |
| Instalação PWA | Pendente |
| 22 molduras e mascote | Pendente |
| PNG Feed / Reels e dimensões | Pendente |
| Vídeo: contêiner, codec e duração | Pendente |
| Áudio audível na primeira e segunda exportação | Pendente |
| Cancelamento e recuperação | Pendente |
| Reabertura offline | Pendente |

**Critério de conclusão:** não declarar Android, MP4 com áudio ou PWA privado como validados até registrar resultados reais. Se o navegador só gerar WebM, isso não equivale a MP4; é necessária conversão H.264/AAC para exigir MP4 universal. Não ativar GitHub Pages.
