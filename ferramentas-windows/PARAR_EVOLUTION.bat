@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title AtenderBem - Parar Evolution API

docker compose -f "ferramentas-locais\evolution-api\docker-compose.yml" down
if errorlevel 1 (
  echo Nao foi possivel parar os containers.
  pause
  exit /b 1
)

echo.
echo Evolution API parada. Os dados e a sessao foram preservados.
pause
