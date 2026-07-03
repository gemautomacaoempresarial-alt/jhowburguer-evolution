@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title AtenderBem - Corrigir conexao local

echo.
echo ===============================================
echo   CORRECAO AUTOMATICA DA EVOLUTION API
echo ===============================================
echo.

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker nao foi encontrado.
  pause
  exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
  echo Abra o Docker Desktop e aguarde ele iniciar.
  pause
  exit /b 1
)

echo [1/4] Recriando o container Evolution com a chave correta...
docker compose -f "ferramentas-locais\evolution-api\docker-compose.yml" up -d --force-recreate evolution
if errorlevel 1 goto FALHOU

echo [2/4] Aguardando a API responder...
set /a tentativa=0
:ESPERAR
set /a tentativa+=1
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8080' -TimeoutSec 4; if($r.StatusCode -ge 200){exit 0};exit 1 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto TESTAR_CHAVE
if !tentativa! GEQ 48 goto FALHOU
timeout /t 5 /nobreak >nul
goto ESPERAR

:TESTAR_CHAVE
echo [3/4] Testando a chave global...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8080/instance/fetchInstances' -Headers @{apikey='atenderbem-local-test-key'} -TimeoutSec 15; Write-Host ('Autenticacao OK - HTTP ' + $r.StatusCode); exit 0 } catch { Write-Host ('Falha de autenticacao: ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 goto FALHOU

echo [4/4] Testando o webhook do Docker para o painel...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health' -TimeoutSec 5; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo.
  echo O painel ainda nao esta aberto na porta 3000.
  echo Execute INICIAR.bat, entre no sistema e depois rode este arquivo novamente.
  echo.
  pause
  exit /b 2
)

docker exec atenderbem-evolution node -e "fetch('http://host.docker.internal:3000/api/health').then(async r=>{console.log('Webhook HTTP '+r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})"
if errorlevel 1 (
  echo.
  echo A chave esta correta, mas o Docker nao consegue acessar o painel.
  echo Execute LIBERAR_PORTA_3000_FIREWALL.bat como administrador.
  echo Depois execute CORRIGIR_CONEXAO_LOCAL.bat novamente.
  echo.
  pause
  exit /b 3
)

echo.
echo ===============================================
echo   CONEXAO LOCAL CORRIGIDA
echo ===============================================
echo No painel, abra Configuracoes - Evolution API.
echo Clique em "Aplicar configuracao local" e depois em "Gerar QR Code".
echo.
pause
exit /b 0

:FALHOU
echo.
echo Nao foi possivel concluir a correcao.
echo Execute DIAGNOSTICO_EVOLUTION.bat e confira os logs.
echo.
pause
exit /b 1
