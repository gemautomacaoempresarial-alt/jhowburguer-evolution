@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title Testar PostgreSQL da Discloud

if not exist ".env" (
  echo O arquivo .env não existe. Execute PREPARAR_DISCLOUD.bat primeiro.
  pause
  exit /b 1
)

if not exist "node_modules\pg" (
  echo Instalando dependências...
  call npm install
  if errorlevel 1 (
    echo Não foi possível instalar as dependências.
    pause
    exit /b 1
  )
)

call npm run check:postgres-connection
pause
