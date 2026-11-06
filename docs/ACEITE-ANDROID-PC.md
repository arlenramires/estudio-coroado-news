# Validação de aceite — Android físico e PC

Este roteiro é manual e **não** deve ser marcado como aprovado por simulação de navegador. Registre modelo, versão Android, versão Chrome, data e hash do pacote testado.

## Preparação
1. Baixe o artefato `Estudio-Coroado-Privado-PC-Android` de uma execução **concluída com sucesso** do workflow.
2. Extraia o ZIP inteiro. Execute `python Verificar-integridade.py` dentro da pasta e registre o resultado.
3. Não publique o pacote em GitHub Pages nem em hospedagem pública. Não use imagens ou vídeos sensíveis nos testes.

## Teste funcional (repetir no PC e no Android)
- [ ] Abrir `Estudio_Coroado_Offline.html` sem rede e navegar por **todas as 22 molduras**, conferindo mascote original, texto e proporções.
- [ ] Inserir foto local e editar manchete; verificar que o arquivo não é enviado a um serviço externo.
- [ ] Exportar PNG Feed (1080 × 1350) e Story/Reels (1080 × 1920); abrir os arquivos e conferir nitidez e dimensões.
- [ ] Inserir vídeo **com trilha de áudio conhecida**; exportar vídeo com a tela ligada e aba ativa.
- [ ] Registrar formato real do download (`.mp4` ou `.webm`), codecs e presença de áudio; **não** renomear WebM para MP4.
- [ ] Reproduzir o arquivo baixado fora do editor, com som audível e sincronização, verificando começo, meio e fim.
- [ ] Cancelar uma exportação e confirmar que nenhum arquivo parcial foi oferecido como completo.
- [ ] Reiniciar o editor e confirmar que as 22 molduras continuam disponíveis.

## PWA local
- [ ] Iniciar servidor exclusivamente em `127.0.0.1:8765` (Windows: `Iniciar-PC-Windows.cmd`; Android: `sh Iniciar-Android-Termux.sh`).
- [ ] Abrir `http://127.0.0.1:8765/index.html` no navegador do **mesmo dispositivo**.
- [ ] Aguardar o pré-cache e instalar pelo menu do Chrome/Edge, **se a opção estiver disponível**.
- [ ] Desligar a rede, manter o servidor local parado e testar reabertura e as 22 molduras.
- [ ] Se a instalação não for oferecida, registrar a mensagem do navegador; não confundir “Adicionar à tela inicial” com instalação PWA confirmada.

## Registro de resultado
| Campo | Valor |
| --- | --- |
| Commit testado | |
| SHA256 do ZIP | |
| Dispositivo / sistema / navegador | |
| 22 molduras | Pendente |
| PNG 1080 × 1350 e 1080 × 1920 | Pendente |
| Vídeo com áudio / formato e codecs | Pendente |
| PWA instalado e offline | Pendente |
| Erros e evidências (sem dados privados) | |

**Critério de conclusão:** somente declarar suporte Android físico e MP4 com áudio após preencher evidências de execução real. O navegador pode oferecer apenas WebM; nesse caso a conversão H.264/AAC deve ser feita separadamente e validada antes da publicação.
