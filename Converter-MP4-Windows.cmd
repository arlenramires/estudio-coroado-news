@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Estudio Coroado News 24H - Converter WebM para MP4
cd /d "%~dp0"
if "%~1"=="" (
  echo Arraste um arquivo .webm sobre este .cmd para converter com audio.
  echo O original sera preservado.
  pause
  exit /b 2
)
if not "%~2"=="" (
  echo ERRO: arraste somente um arquivo WebM por vez.
  pause
  exit /b 2
)
if not exist "%~1" (
  echo ERRO: arquivo nao encontrado.
  pause
  exit /b 2
)
if exist "%~f1\\" (
  echo ERRO: o caminho informado e uma pasta, nao um arquivo WebM.
  pause
  exit /b 2
)
where node >nul 2>&1
if errorlevel 1 goto missingNode
where ffmpeg >nul 2>&1
if errorlevel 1 goto missingFFmpeg
where ffprobe >nul 2>&1
if errorlevel 1 goto missingFFmpeg
if /i not "%~x1"==".webm" (
  echo ERRO: selecione um arquivo com extensao .webm.
  pause
  exit /b 2
)
if exist "%~dpn1_convertido.mp4" (
  echo ERRO: o arquivo de destino ja existe e nao sera sobrescrito.
  echo Renomeie o arquivo existente antes de tentar novamente.
  pause
  exit /b 2
)
echo Convertendo localmente, sem enviar o video para a internet...
node "%~dp0scripts\converter-mp4.mjs" "%~f1" "%~dpn1_convertido.mp4"
if errorlevel 1 (
  echo.
  echo Falha na conversao. O arquivo WebM original foi preservado.
  echo Verifique se o WebM possui imagem e audio.
  pause
  exit /b 1
)
if not exist "%~dpn1_convertido.mp4" (
  echo ERRO: o conversor terminou sem criar o arquivo MP4 esperado.
  pause
  exit /b 1
)
for %%F in ("%~dpn1_convertido.mp4") do if %%~zF EQU 0 (
  echo ERRO: o arquivo MP4 gerado esta vazio.
  pause
  exit /b 1
)
echo.
echo Pronto: "%~dpn1_convertido.mp4"
echo Abra o arquivo para conferir imagem, som e sincronizacao.
pause
exit /b 0
:missingNode
echo ERRO: instale Node.js e abra novamente este conversor.
pause
exit /b 2
:missingFFmpeg
echo ERRO: instale FFmpeg com ffmpeg e ffprobe no PATH.
pause
exit /b 2
