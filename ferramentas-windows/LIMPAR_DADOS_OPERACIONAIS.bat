@echo off
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
echo ==============================================
echo   LIMPAR DADOS OPERACIONAIS - G&M AUTOMACAO
echo ==============================================
echo.
echo Esta acao remove clientes, conversas, mensagens,
echo pedidos, comandas abertas, notificacoes e sessoes.
echo Usuarios, configuracoes, produtos e cadastros administrativos serao preservados.
echo.
set /p CONFIRMA=Digite LIMPAR para confirmar: 
if /I not "%CONFIRMA%"=="LIMPAR" (
  echo Operacao cancelada.
  pause
  exit /b 0
)
node --no-warnings scripts\clean-operational-data.js
if errorlevel 1 (
  echo.
  echo Nao foi possivel limpar os dados.
  pause
  exit /b 1
)
echo.
echo Dados operacionais removidos com sucesso.
pause
