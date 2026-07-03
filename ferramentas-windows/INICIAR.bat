@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title AtenderBem AI - Inicializador

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao foi encontrado.
  echo Instale uma versao atual do Node.js e execute este arquivo novamente.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias.
    pause
    exit /b 1
  )
)

start "AtenderBem Servidor" cmd /k "cd /d ""%ROOT%"" && npm start"
timeout /t 3 /nobreak >nul
start "" http://localhost:3000
exit
