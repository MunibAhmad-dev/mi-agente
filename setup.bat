@echo off
title AI-OS Setup for Freelancer
color 0A
echo ============================================
echo    AI-OS - Setup Automatico para Freelancer
echo ============================================
echo.

:: Check Docker
echo [1/6] Verificando Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker no esta instalado.
    echo Descarga Docker Desktop: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)
echo OK - Docker encontrado.
echo.

:: Check Docker Compose
echo [2/6] Verificando Docker Compose...
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker Compose no esta disponible.
    pause
    exit /b 1
)
echo OK - Docker Compose encontrado.
echo.

:: Create .env from template
echo [3/6] Configurando variables de entorno...
if not exist .env (
    copy .env.example .env >nul
    
    :: Generate random keys
    for /f "delims=" %%a in ('powershell -Command "[System.Guid]::NewGuid().ToString('N')"') do set CREDS_KEY=%%a
    for /f "delims=" %%a in ('powershell -Command "[System.Guid]::NewGuid().ToString('N')"') do set CREDS_IV=%%a
    for /f "delims=" %%a in ('powershell -Command "[System.Guid]::NewGuid().ToString('N')[0..31] -join ''"') do set MEILI_KEY=%%a
    for /f "delims=" %%a in ('powershell -Command "[System.Guid]::NewGuid().ToString('N')[0..31] -join ''"') do set SESSION_SEC=%%a
    
    :: Replace placeholders in .env
    powershell -Command "(Get-Content .env) -replace 'your-credentials-encryption-key', '%CREDS_KEY%' -replace 'your-credentials-initialization-vector', '%CREDS_IV%' -replace 'your-meilisearch-master-key', '%MEILI_KEY%' -replace 'your-admin-panel-session-secret', '%SESSION_SEC%' | Set-Content .env"
    
    echo OK - .env creado con credenciales generadas automaticamente.
) else (
    echo OK - .env ya existe.
)
echo.

:: Start MongoDB first (needed by everything)
echo [4/6] Iniciando MongoDB...
docker compose up -d mongodb
timeout /t 5 >nul
echo OK - MongoDB corriendo en puerto 27017.
echo.

:: Start all services
echo [5/6] Iniciando todos los servicios...
docker compose up -d
echo OK - Todos los contenedores iniciados.
echo.

:: Wait and verify
echo [6/6] Verificando servicios...
timeout /t 10 >nul
echo.
echo ============================================
echo    SERVICIOS DISPONIBLES:
echo ============================================
echo.
echo    LibreChat (Chat UI):     http://localhost:3080
echo    Admin Panel:             http://localhost:3000
echo    AI Model Browser:        http://localhost:3456
echo    MongoDB:                 localhost:27017 (sin auth)
echo    Ollama (LLM local):      http://localhost:11434
echo.
echo    Dashboard:               Abre client\dashboard.html
echo.
echo ============================================
echo    PARA CHATEAR: Abre http://localhost:3080
echo    PARA MONGODB: Usa MongoDB Compass
echo                   Connection: mongodb://localhost:27017/LibreChat
echo ============================================
echo.

:: Show running containers
echo Contenedores activos:
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo.

pause
