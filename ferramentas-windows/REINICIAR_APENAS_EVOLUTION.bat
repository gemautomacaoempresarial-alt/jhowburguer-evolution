@echo off
setlocal
set "ROOT=%~dp0.."
cd /d "%ROOT%"
echo.
echo ========================================================
echo  REINICIANDO APENAS A EVOLUTION API
echo ========================================================
echo.
echo Este procedimento NAO apaga a instancia, o QR Code,
echo a sessao do WhatsApp nem o banco do painel.
echo Ele apenas encerra tentativas antigas de webhook e reinicia o container.
echo.
docker restart atenderbem-evolution
if errorlevel 1 (
  echo.
  echo Nao foi possivel reiniciar o container.
  echo Confirme se o Docker Desktop esta aberto.
  pause
  exit /b 1
)
echo.
echo Evolution API reiniciada. Aguarde ela ficar pronta antes de testar.
for /l %%i in (1,1,60) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:8080; if ($r.StatusCode -ge 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
  if not errorlevel 1 goto :ready
  timeout /t 2 /nobreak >nul
)
echo A API ainda nao respondeu. Execute DIAGNOSTICO_EVOLUTION.bat.
pause
exit /b 1
:ready
echo Evolution API pronta.
echo Agora abra o painel e clique em Corrigir webhook.
pause
