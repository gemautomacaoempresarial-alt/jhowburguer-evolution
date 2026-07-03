@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title AtenderBem - Diagnostico Evolution API
set "ARQUIVO=%ROOT%\diagnostico-evolution.txt"

(
  echo ===============================================
  echo DIAGNOSTICO EVOLUTION API - %date% %time%
  echo ===============================================
  echo.
  echo [1] DOCKER
  docker version 2^>^&1
  echo.
  echo [2] CONTAINERS
  docker compose -f "ferramentas-locais\evolution-api\docker-compose.yml" ps -a 2^>^&1
  echo.
  echo [3] TESTE HTTP http://localhost:8080
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8080' -TimeoutSec 10; Write-Output ('HTTP ' + $r.StatusCode); Write-Output $r.Content } catch { Write-Output ('ERRO: ' + $_.Exception.Message); exit 1 }" 2^>^&1
  echo.
  echo [4] ULTIMOS LOGS DA EVOLUTION API
  docker compose -f "ferramentas-locais\evolution-api\docker-compose.yml" logs --no-color --tail 180 evolution 2^>^&1
  echo.
  echo [5] ULTIMOS LOGS DO POSTGRESQL
  docker compose -f "ferramentas-locais\evolution-api\docker-compose.yml" logs --no-color --tail 80 postgres 2^>^&1
  echo.
  echo [6] ULTIMOS LOGS DO REDIS
  docker compose -f "ferramentas-locais\evolution-api\docker-compose.yml" logs --no-color --tail 50 redis 2^>^&1
) > "%ARQUIVO%"

echo.
echo Diagnostico salvo em:
echo %ARQUIVO%
echo.
start "" notepad "%ARQUIVO%"
if /I "%~1"=="/nopause" exit /b 0
Pause
