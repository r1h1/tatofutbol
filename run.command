#!/usr/bin/env bash
# ============================================================
# TatoFutbol — Arranque para macOS
# Doble clic desde Finder o: ./run.command
# ============================================================
set -e

# Ir siempre a la carpeta del script (importante en macOS porque Finder
# arranca con CWD = /)
cd "$(dirname "$0")"

# ---------- Colores ----------
BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'
YELLOW=$'\033[33m'; CYAN=$'\033[36m'; DIM=$'\033[2m'; RESET=$'\033[0m'

echo "${BOLD}${CYAN}"
echo "═══════════════════════════════════════════════════════"
echo "  TatoFutbol · macOS Launcher"
echo "═══════════════════════════════════════════════════════"
echo "${RESET}"

# ============================================================
# 1) Detectar Python 3.10+
# ============================================================
echo "${CYAN}[*]${RESET} Detectando Python 3.10+..."

PYTHON=""
for cand in python3.12 python3.13 python3.11 python3.10 python3; do
  if command -v "$cand" >/dev/null 2>&1; then
    if "$cand" -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>/dev/null; then
      PYTHON="$cand"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  echo "${RED}[X] ERROR: No se encontró Python 3.10+${RESET}"
  echo ""
  echo "Opciones de instalación:"
  echo "  ${YELLOW}brew install python@3.12${RESET}  (recomendado)"
  echo "  https://www.python.org/downloads/"
  echo ""
  exit 1
fi

echo "${GREEN}[OK]${RESET} Usando: ${BOLD}$PYTHON${RESET} ($($PYTHON --version 2>&1))"

# Verificar que estamos en una Mac (por si alguien corre el .command en Linux)
if [ "$(uname)" != "Darwin" ]; then
  echo "${YELLOW}[!]${RESET} Este script está optimizado para macOS."
  echo "    En Linux usa ${BOLD}run.sh${RESET} en su lugar."
fi

# ============================================================
# 2) Crear / verificar venv
# ============================================================
VENV_PY="venv/bin/python"

# Si el venv existe pero fue creado con otro Python roto, lo recreamos
if [ -d "venv" ] && [ ! -x "$VENV_PY" ]; then
  echo "${YELLOW}[!]${RESET} venv corrupto detectado. Recreando..."
  rm -rf venv
fi

if [ ! -d "venv" ]; then
  echo "${CYAN}[*]${RESET} Creando entorno virtual..."
  "$PYTHON" -m venv venv

  echo "${CYAN}[*]${RESET} Actualizando pip..."
  ./venv/bin/python -m pip install --upgrade pip --quiet

  echo "${CYAN}[*]${RESET} Instalando requirements.txt..."
  ./venv/bin/python -m pip install -r requirements.txt

  echo "${CYAN}[*]${RESET} Instalando Chromium para Playwright..."
  ./venv/bin/python -m playwright install chromium
else
  echo "${GREEN}[OK]${RESET} venv existente"
fi

# ============================================================
# 3) Verificar dependencias clave
# ============================================================
echo "${CYAN}[*]${RESET} Verificando dependencias..."
if ! ./venv/bin/python -c "import fastapi, uvicorn, playwright" 2>/dev/null; then
  echo "${YELLOW}[!]${RESET} Faltan dependencias. Instalando..."
  ./venv/bin/python -m pip install -r requirements.txt
  ./venv/bin/python -m playwright install chromium
fi

# ============================================================
# 4) Limpieza al salir (Ctrl+C o cierre)
# ============================================================
BACK_PID=""
FRONT_PID=""

cleanup() {
  echo ""
  echo "${YELLOW}[*] Deteniendo servicios...${RESET}"
  [ -n "$BACK_PID" ]  && kill "$BACK_PID"  2>/dev/null || true
  [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null || true
  # Fallback: matar cualquier uvicorn o http.server residual
  pkill -f "uvicorn backend.main:app"    2>/dev/null || true
  pkill -f "http.server 5500"            2>/dev/null || true
  wait 2>/dev/null || true
  echo "${GREEN}[OK]${RESET} Listo. Hasta luego."
  exit 0
}
trap cleanup INT TERM EXIT

# ============================================================
# 5) Arrancar backend
# ============================================================
echo "${CYAN}[*]${RESET} Arrancando backend en http://localhost:8000 ..."
./venv/bin/python -m uvicorn backend.main:app \
  --host 127.0.0.1 --port 8000 \
  > backend.log 2>&1 &
BACK_PID=$!

# ============================================================
# 6) Arrancar frontend
# ============================================================
echo "${CYAN}[*]${RESET} Arrancando frontend en http://localhost:5500 ..."
./venv/bin/python -m http.server 5500 \
  --directory frontend --bind 127.0.0.1 \
  > frontend.log 2>&1 &
FRONT_PID=$!

# ============================================================
# 7) Esperar a que ambos respondan
# ============================================================
echo "${CYAN}[*]${RESET} Esperando servicios..."
READY=0
for i in {1..30}; do
  B=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs 2>/dev/null || echo "000")
  F=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5500/    2>/dev/null || echo "000")
  if [ "$B" = "200" ] && [ "$F" = "200" ]; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" = "0" ]; then
  echo "${YELLOW}[!] ADVERTENCIA: Los servicios podrían no estar listos.${RESET}"
  echo "    Revisa ${BOLD}backend.log${RESET} y ${BOLD}frontend.log${RESET}"
fi

# ============================================================
# 8) Abrir navegador con `open` (macOS nativo)
# ============================================================
URL="http://localhost:5500"
echo "${CYAN}[*]${RESET} Abriendo $URL ..."
open "$URL" 2>/dev/null || echo "${YELLOW}[!]${RESET} Abre manualmente: $URL"

# ============================================================
# 9) Banner final
# ============================================================
echo ""
echo "${GREEN}═══════════════════════════════════════════════════════${RESET}"
echo "${GREEN}  ${BOLD}TatoFutbol en marcha${RESET}"
echo "${GREEN}  Frontend: ${BOLD}http://localhost:5500${RESET}"
echo "${GREEN}  Backend:  ${BOLD}http://localhost:8000/docs${RESET}"
echo "${GREEN}  Logs:     ${BOLD}backend.log${RESET}  ·  ${BOLD}frontend.log${RESET}"
echo "${GREEN}  Detener:  ${BOLD}Ctrl+C${RESET}"
echo "${GREEN}═══════════════════════════════════════════════════════${RESET}"
echo ""

# ============================================================
# 10) Esperar Ctrl+C
# ============================================================
wait