@echo off
:: Asegurar que estamos en la raíz del proyecto
cd /d "%~dp0.."

:: --- CONFIGURACIÓN ---
:: Basado en el modelo de deploy_coolify_bak.bat
set DOCKER_USER=cfanton
set IMAGE_NAME=reservas-inta
set TAG=latest
:: ---------------------

:: Obtener rama actual
for /f "tokens=*" %%i in ('git branch --show-current') do set BRANCH=%%i

:: Advertencia Visual
color 1F
cls
echo.
echo ==============================================================================
echo.
echo      CONSTRUYENDO IMAGEN DOCKER PARA RESERVAS INTA    (Rama: %BRANCH%)
echo      NOMBRE: %DOCKER_USER%/%IMAGE_NAME%:%TAG%
echo.
echo ==============================================================================
echo.

echo 🐳 Iniciando sesión en Docker Hub...
docker login

echo.
echo 🏗️  Construyendo Imagen (Linux/AMD64)...
:: Construimos la imagen utilizando el Dockerfile unificado de la raíz
docker build --platform linux/amd64 -t %DOCKER_USER%/%IMAGE_NAME%:%TAG% .

if %errorlevel% neq 0 (
    echo [ERROR] La construcción falló.
    pause
    exit /b %errorlevel%
)

echo.
echo ⬆️  Subiendo Imagen a Docker Hub...
docker push %DOCKER_USER%/%IMAGE_NAME%:%TAG%

if %errorlevel% neq 0 (
    echo [ERROR] La subida falló.
    pause
    exit /b %errorlevel%
)

echo.
echo ======================================================
echo  ✅ CONSTRUCCIÓN Y SUBIDA COMPLETADA (TAG: %TAG%)
echo ======================================================
echo.
echo  Próximos pasos:
echo   1. Imagen en Docker Hub: %DOCKER_USER%/%IMAGE_NAME%:%TAG%
echo   2. Desplegar usando docker-compose.yml
echo.
pause
