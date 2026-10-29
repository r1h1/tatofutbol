#Requires -Version 5.1
<#
.SYNOPSIS
    TatoFutbol — Arranque en Windows
.DESCRIPTION
    Equivalente a run.sh para Windows. Crea venv, instala dependencias,
    arranca backend (FastAPI) y frontend (http.server), abre el navegador
    y gestiona el Ctrl+C para limpiar procesos.
#>

$ErrorActionPreference = "Stop"

# Ir siempre a la carpeta del script
Set-Location $PSScriptRoot

# ============================================================
# 1) Detectar Python 3.10+
# ============================================================
function Test-PythonVersion {
    param($exe, $baseArgs)
    try {
        $output = & $exe @baseArgs --version 2>&1
        if ($LASTEXITCODE -eq 0 -and "$output" -match "Python 3\.(\d+)") {
            return [int]$Matches[1]
        }
    } catch { }
    return -1
}

$PythonExe = $null
$PythonBaseArgs = @()

$candidates = @(
    @("py", "-3.12"),
    @("py", "-3.11"),
    @("py", "-3.10"),
    @("py", "-3"),
    @("python"),
    @("python3")
)

foreach ($cand in $candidates) {
    $exe = $cand[0]
    $extra = if ($cand.Length -gt 1) { $cand[1..($cand.Length-1)] } else { @() }
    $minor = Test-PythonVersion $exe $extra
    if ($minor -ge 10) {
        $PythonExe = $exe
        $PythonBaseArgs = $extra
        Write-Host "[OK] Python detectado: $exe $($extra -join ' ')" -ForegroundColor Green
        break
    }
}

if (-not $PythonExe) {
    Write-Host "[X] ERROR: No se encontro Python 3.10+ en el sistema." -ForegroundColor Red
    Write-Host "    Instala Python desde https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "    IMPORTANTE: marca 'Add Python to PATH' durante la instalacion." -ForegroundColor Yellow
    exit 1
}

# ============================================================
# 2) Crear / verificar venv
# ============================================================
$VenvDir = "venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[*] No existe venv. Creandolo..." -ForegroundColor Cyan
    & $PythonExe @PythonBaseArgs -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] ERROR: Fallo al crear venv" -ForegroundColor Red
        exit 1
    }
    Write-Host "[*] Actualizando pip..." -ForegroundColor Cyan
    & $VenvPython -m pip install --upgrade pip
    Write-Host "[*] Instalando requirements.txt..." -ForegroundColor Cyan
    & $VenvPython -m pip install -r requirements.txt
    Write-Host "[*] Instalando Chromium para Playwright..." -ForegroundColor Cyan
    & $VenvPython -m playwright install chromium
} else {
    Write-Host "[OK] venv existente" -ForegroundColor Green
}

# ============================================================
# 3) Verificar dependencias clave
# ============================================================
Write-Host "[*] Verificando dependencias..." -ForegroundColor Cyan
& $VenvPython -c "import fastapi, uvicorn, playwright" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Faltan dependencias. Instalando..." -ForegroundColor Yellow
    & $VenvPython -m pip install -r requirements.txt
    & $VenvPython -m playwright install chromium
}

# ============================================================
# 4) Variables globales y cleanup
# ============================================================
$script:BackendProcess = $null
$script:FrontendProcess = $null

function Stop-Services {
    Write-Host ""
    Write-Host "[*] Deteniendo servicios..." -ForegroundColor Yellow

    # 1. Matar wrapper cmd.exe por PID
    foreach ($p in @($script:BackendProcess, $script:FrontendProcess)) {
        if ($p -and -not $p.HasExited) {
            try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
        }
    }

    # 2. Fallback: matar python.exe hijos que coincidan
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue
        foreach ($proc in $procs) {
            $cmdLine = $proc.CommandLine
            if ($cmdLine -and ($cmdLine -like "*uvicorn backend.main*" -or $cmdLine -like "*http.server 5500*")) {
                try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
            }
        }
    } catch { }

    Write-Host "[OK] Listo. Hasta luego." -ForegroundColor Green
}

# ============================================================
# 5) Bucle principal con manejo de Ctrl+C
# ============================================================
try {
    # --- Backend ---
    Write-Host "[*] Arrancando backend en http://localhost:8000 ..." -ForegroundColor Cyan
    $script:BackendProcess = Start-Process -FilePath "cmd.exe" `
        -ArgumentList @("/c", "$VenvPython -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 > backend.log 2>&1") `
        -PassThru -WindowStyle Hidden

    # --- Frontend ---
    Write-Host "[*] Arrancando frontend en http://localhost:5500 ..." -ForegroundColor Cyan
    $script:FrontendProcess = Start-Process -FilePath "cmd.exe" `
        -ArgumentList @("/c", "$VenvPython -m http.server 5500 --directory frontend --bind 127.0.0.1 > frontend.log 2>&1") `
        -PassThru -WindowStyle Hidden

    # --- Esperar a que ambos respondan ---
    Write-Host "[*] Esperando servicios..." -ForegroundColor Cyan
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $b = (Invoke-WebRequest -Uri "http://127.0.0.1:8000/docs" -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue).StatusCode
            $f = (Invoke-WebRequest -Uri "http://127.0.0.1:5500/" -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue).StatusCode
            if ($b -eq 200 -and $f -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }

    if (-not $ready) {
        Write-Host "[!] ADVERTENCIA: Los servicios podrian no estar listos." -ForegroundColor Yellow
        Write-Host "    Revisa backend.log y frontend.log" -ForegroundColor Yellow
    }

    # --- Abrir navegador ---
    $URL = "http://localhost:5500"
    Write-Host "[*] Abriendo $URL ..." -ForegroundColor Cyan
    try { Start-Process $URL } catch {
        Write-Host "    [!] Abre manualmente: $URL" -ForegroundColor Yellow
    }

    # --- Banner de info ---
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Green
    Write-Host "  Sistema en marcha" -ForegroundColor Green
    Write-Host "  Frontend: http://localhost:5500" -ForegroundColor Green
    Write-Host "  Backend:  http://localhost:8000/docs" -ForegroundColor Green
    Write-Host "  Logs:     backend.log  -  frontend.log" -ForegroundColor Green
    Write-Host "  Ctrl+C para detener todo" -ForegroundColor Green
    Write-Host "=======================================================" -ForegroundColor Green
    Write-Host ""

    # --- Esperar Ctrl+C ---
    while ($true) {
        if ($script:BackendProcess.HasExited) {
            Write-Host "[X] El backend termino inesperadamente. Revisa backend.log" -ForegroundColor Red
            break
        }
        if ($script:FrontendProcess.HasExited) {
            Write-Host "[X] El frontend termino inesperadamente. Revisa frontend.log" -ForegroundColor Red
            break
        }
        Start-Sleep -Seconds 1
    }
} finally {
    Stop-Services
}