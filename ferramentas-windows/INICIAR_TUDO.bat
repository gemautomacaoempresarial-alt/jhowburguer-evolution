@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title AtenderBem - Iniciar tudo

call "%~dp0INICIAR.bat"

echo Aguardando o painel iniciar na porta 3000...
set /a tentativa=0
:AGUARDAR_PAINEL
set /a tentativa+=1
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health' -TimeoutSec 3; if($r.StatusCode -eq 200){exit 0};exit 1 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto PAINEL_PRONTO
if !tentativa! GEQ 20 (
  echo O painel nao respondeu. Verifique a janela AtenderBem Servidor.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto AGUARDAR_PAINEL

:PAINEL_PRONTO
call "%~dp0INICIAR_EVOLUTION.bat"
