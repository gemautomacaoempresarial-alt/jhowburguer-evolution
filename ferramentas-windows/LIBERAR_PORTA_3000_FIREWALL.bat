@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title AtenderBem - Liberar porta 3000

net session >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo Liberando a porta TCP 3000 para o painel local...
netsh advfirewall firewall delete rule name="AtenderBem Painel Porta 3000" >nul 2>nul
netsh advfirewall firewall add rule name="AtenderBem Painel Porta 3000" dir=in action=allow protocol=TCP localport=3000 profile=private
if errorlevel 1 (
  echo Nao foi possivel criar a regra do Firewall.
  pause
  exit /b 1
)

echo.
echo Porta 3000 liberada para redes privadas.
echo Agora execute CORRIGIR_CONEXAO_LOCAL.bat novamente.
pause
