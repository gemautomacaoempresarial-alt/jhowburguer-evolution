@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
echo Isso apagara os dados de teste e recriara o banco inicial.
choice /C SN /M "Deseja continuar"
if errorlevel 2 exit /b 0
call npm run reset-db
pause
