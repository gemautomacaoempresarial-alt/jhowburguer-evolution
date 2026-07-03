@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title Preparar G&M Automação para Discloud

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo Arquivo .env criado.
) else (
  echo O arquivo .env já existe e não foi substituído.
)

echo.
echo Edite os dados do PostgreSQL, o endereço do site e as chaves de segurança.
echo O ID do discloud.config também precisa ser um subdomínio disponível.
echo.
start "" notepad "%ROOT%\.env"
start "" notepad "%ROOT%\discloud.config"
start "" notepad "%ROOT%\docs\guias\DEPLOY_DISCLOUD.md"
exit
