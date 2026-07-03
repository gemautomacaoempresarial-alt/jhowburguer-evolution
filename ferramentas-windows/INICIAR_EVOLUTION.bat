@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
set "ROOT=%~dp0.."
cd /d "%ROOT%"
title AtenderBem - Evolution API

echo.
echo ===============================================
echo   Iniciando Evolution API para testes locais
echo ===============================================
echo.

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker nao foi encontrado.
  echo Instale e abra o Docker Desktop antes de continuar.
  echo.
  pause
  exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
  echo O Docker Desktop parece estar fechado ou ainda iniciando.
  echo Abra o Docker Desktop e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)

echo Subindo PostgreSQL, Redis e Evolution API...
docker compose -f "ferramentas-locais\evolution-api\docker-compose.yml" up -d
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar a Evolution API.
  echo Veja os detalhes acima e confirme se a porta 8080 esta livre.
  pause
  exit /b 1
)

echo.
echo Aguardando a Evolution API concluir banco, migracoes e inicializacao...
set /a tentativa=0
set /a limite=48

:AGUARDAR_API
set /a tentativa+=1
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8080' -TimeoutSec 4; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto API_PRONTA

if !tentativa! GEQ !limite! goto API_FALHOU
set /a segundos=tentativa*5
echo   Ainda iniciando... !segundos! segundos

timeout /t 5 /nobreak >nul
goto AGUARDAR_API

:API_FALHOU
echo.
echo A Evolution API nao respondeu apos aproximadamente 4 minutos.
echo O diagnostico sera aberto para mostrar o estado dos containers e os logs.
echo.
call "%~dp0DIAGNOSTICO_EVOLUTION.bat" /nopause
pause
exit /b 1

:API_PRONTA
echo.
echo ===============================================
echo   Evolution API pronta para uso
echo ===============================================
echo URL:       http://localhost:8080
echo Chave:     atenderbem-local-test-key
echo Instancia: atenderbem
echo.
echo Agora execute INICIAR.bat e configure o WhatsApp no painel.
echo Na URL de retorno use: http://host.docker.internal:3000
echo.
if /I "%~1"=="/nopause" exit /b 0
pause
exit /b 0
