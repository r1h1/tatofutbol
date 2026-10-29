@echo off
setlocal
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
    echo.
    echo [X] ERROR: PowerShell no encontrado en el sistema.
    echo     Este script requiere Windows PowerShell 5.1 o superior.
    echo.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
set EXITCODE=%errorlevel%

echo.
echo Presiona cualquier tecla para cerrar...
pause >nul
exit /b %EXITCODE%