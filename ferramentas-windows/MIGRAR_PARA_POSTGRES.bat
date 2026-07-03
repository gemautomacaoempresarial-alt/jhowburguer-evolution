@echo off
setlocal
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title Migrar SQLite para PostgreSQL

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js não foi encontrado.
  pause
  exit /b 1
)

if not exist ".env" (
  echo O arquivo .env não existe. Execute PREPARAR_DISCLOUD.bat primeiro.
  pause
  exit /b 1
)

if not exist "node_modules\pg" (
  echo Instalando dependências, incluindo o driver PostgreSQL...
  call npm install
  if errorlevel 1 (
    echo Não foi possível instalar as dependências.
    pause
    exit /b 1
  )
)

echo.
echo ATENÇÃO: o conteúdo atual do PostgreSQL configurado no .env será substituído.
set /p CONFIRMA=Digite SIM para copiar o banco SQLite atual: 
if /I not "%CONFIRMA%"=="SIM" (
  echo Migração cancelada.
  pause
  exit /b 0
)

set MIGRATE_CONFIRM=SIM
set SOURCE_SQLITE_PATH=%ROOT%\data\atenderbem.sqlite
call npm run migrate:sqlite-to-postgres
if errorlevel 1 (
  echo.
  echo A migração falhou. Confira os dados do PostgreSQL no .env.
  pause
  exit /b 1
)

echo.
echo Migração concluída com sucesso.
pause
