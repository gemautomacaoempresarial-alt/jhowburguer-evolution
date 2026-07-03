@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title AtenderBem - Recriar Evolution API

echo.
echo ATENCAO: este procedimento apaga a instancia, sessao, banco e volumes
ECHO locais da Evolution API. Use somente se o QR ficou preso em Conectando.
echo O banco data\atenderbem.sqlite do painel NAO sera apagado.
echo.
choice /C SN /M "Deseja realmente recriar a Evolution API do zero"
if errorlevel 2 exit /b 0

docker compose -f "ferramentas-locais\evolution-api\docker-compose.yml" down -v --remove-orphans
if errorlevel 1 (
  echo Nao foi possivel remover os containers e volumes.
  pause
  exit /b 1
)

echo.
echo Ambiente antigo removido. Iniciando novamente...
call "%~dp0INICIAR_EVOLUTION.bat"
