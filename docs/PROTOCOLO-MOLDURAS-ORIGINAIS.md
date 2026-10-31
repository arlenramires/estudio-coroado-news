# Montagem fiel às molduras aprovadas — protocolo de edição

Este procedimento é obrigatório para as 22 molduras do Estúdio, especialmente **Flagras** (`original_04.webp`) e **Flagras — 3D** (`original_22.webp`).

## Regra de integridade visual

- **Nunca** usar print de tela, prévia de Instagram, captura de vídeo ou composição anterior como substituto da moldura original.
- Selecionar o arquivo `molduras/original_XX.webp` do catálogo e usar sua janela de mídia (`DATA[].box`) para posicionar o conteúdo. A área editável não deve encobrir o título da editoria, o Coroadinho, as bordas nem o rodapé.
- Se a moldura original tiver conteúdo já pintado na janela, **não** declarar que ela é transparente/editável por camadas. Uma janela opaca exige máscara ou um arquivo original de camadas para sobreposição fiel; não improvisar recortes que deixem pedaços de vídeo antigo.
- Preservar a arte original e os textos de identidade; alterar apenas o vídeo/foto e a manchete solicitados. A manchete deve permanecer legível e não invadir o mascote.
- Nunca dizer que uma edição foi concluída sem gerar e inspecionar o arquivo de saída.

## Vídeo de terceiros e tarjas

- Cortar começo/fim apenas nos pontos solicitados e conferir o áudio do resultado.
- Se a solicitação for esconder a identificação do material de origem, cobrir somente a área indicada; não alterar o conteúdo factual do vídeo.
- A tarja preta pedida deve cobrir a identificação **dentro da janela de mídia**, sem cobrir o logotipo Coroado News da moldura.
- Verificar início, meio e fim do vídeo: não pode reaparecer identificação nem artefato do editor original.
- Exportar MP4 somente se o codificador realmente produzir MP4; não renomear WebM. Confirmar duração, dimensão e presença de áudio com `ffprobe` quando disponível.

## Checklist de aceitação

1. Moldura selecionada por caminho do catálogo, sem uso de print.
2. Conteúdo limitado à janela de mídia e bordas intactas.
3. Coroadinho, título, cores e rodapé originais preservados.
4. Tarja de ocultação posicionada corretamente em todos os quadros.
5. Manchete legível em 9:16 e não cortada na área segura.
6. Prévia conferida no começo, meio e fim, com áudio.
7. Projeto reutilizável salvo separadamente do vídeo final.
8. Quando não houver camada transparente legítima, registrar a limitação em vez de declarar entrega final.

**Privacidade:** manter execução local. Não habilitar GitHub Pages público.
