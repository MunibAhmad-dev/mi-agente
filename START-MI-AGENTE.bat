@echo off
title MI-AGENTE - Iniciando...
color 0A
cls

echo ============================================================
echo          MI-AGENTE - Iniciando el sistema...
echo ============================================================
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado.
    echo Descarga Node.js desde https://nodejs.org
    pause
    exit /b 1
)

:: Check if packages are built
if not exist "packages\data-schemas\dist" (
    echo [1/3] Compilando paquetes por primera vez, espera 2-3 minutos...
    call npm run build:packages
    if errorlevel 1 (
        echo [ERROR] Fallo al compilar paquetes.
        pause
        exit /b 1
    )
)

:: Check if frontend is built
if not exist "client\dist\index.html" (
    echo [2/3] Compilando interfaz por primera vez, espera 3-5 minutos...
    call npm run build:client
    if errorlevel 1 (
        echo [ERROR] Fallo al compilar la interfaz.
        pause
        exit /b 1
    )
)

:: Start Ollama in background if available
echo [3/3] Verificando Ollama...
ollama --version >nul 2>&1
if not errorlevel 1 (
    echo       Ollama detectado. Iniciando en segundo plano...
    start /min "" ollama serve
    timeout /t 2 /nobreak >nul
) else (
    echo       Ollama no encontrado - usando otros proveedores.
)

echo.
echo ============================================================
echo  Iniciando servidor... esto toma 15-30 segundos
echo ============================================================
echo.

:: Open browser after delay (background)
start /b cmd /c "timeout /t 20 /nobreak >nul && start http://localhost:3080"

:: Start backend (foreground - keeps window open)
echo  Servidor corriendo en http://localhost:3080
echo  NO cierres esta ventana mientras uses la aplicacion.
echo.
call npm run backend

echo.
echo  El servidor se detuvo. Presiona cualquier tecla para cerrar.
pause >nul
