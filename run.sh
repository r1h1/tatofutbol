#!/usr/bin/env bash
# ============================================================
# TatoDeportes — Launcher local (Linux y macOS)
# Multi-deporte · listo para desarrollo y pruebas locales.
#
# Uso:
#   chmod +x run.sh   (solo la primera vez)
#   ./run.sh
#
# Detener: Ctrl+C
# ============================================================
set -e

# Ir siempre a la raíz del proyecto, sin importar desde dónde se invoque
cd "$(dirname "$(readlink -f "$0")")"

# ---------- Colores ----------
BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'
YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'

echo "${BOLD}${CYAN}"
echo "═══════════════════════════════════════════════════════"
echo "  TatoDeportes · Launcher multi-deporte"
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
  echo "  Ubuntu/Debian:"
  echo "    ${YELLOW}sudo apt install python3 python3-venv python3-pip${RESET}"
  echo "  macOS:"
  echo "    ${YELLOW}brew install python@3.12${RESET}"
  echo "  Otros: https://www.python.org/downloads/"
  echo ""
  exit 1
fi

echo "${GREEN}[OK]${RESET} Usando: ${BOLD}$PYTHON${RESET} ($($PYTHON --version 2>&1))"

# Verificar que el módulo venv esté disponible
if ! "$PYTHON" -c "import venv" 2>/dev/null; then
  echo "${RED}[X] ERROR: El módulo 'venv' no está disponible.${RESET}"
  echo "  Ubuntu/Debian: ${YELLOW}sudo apt install python3-venv${RESET}"
  exit 1
fi

# ============================================================
# 2) Crear / verificar venv
# ============================================================
VENV_PY="venv/bin/python"

if [ -d "venv" ] && [ ! -x "$VENV_PY" ]; then
  echo "${YELLOW}[!]${RESET} venv corrupto detectado. Recreando..."
  rm -rf venv
fi

if [ ! -d "venv" ]; then
  echo "${CYAN}[*]${RESET} Creando entorno virtual con $PYTHON..."
  "$PYTHON" -m venv venv

  echo "${CYAN}[*]${RESET} Actualizando pip..."
  ./venv/bin/python -m pip install --upgrade pip --quiet

  echo "${CYAN}[*]${RESET} Instalando requirements.txt..."
  ./venv/bin/python -m pip install -r requirements.txt

  echo "${CYAN}[*]${RESET} Instalando Chromium para Playwright (puede tardar 1-2 min la primera vez)..."
  ./venv/bin/python -m playwright install chromium
else
  echo "${GREEN}[OK]${RESET} venv existente"
fi

# ============================================================
# 3) Verificar archivos críticos del backend
# ============================================================
echo "${CYAN}[*]${RESET} Verificando archivos del backend..."
for f in backend/main.py backend/scraper.py backend/sports_config.py backend/m3u_sources.py backend/thumbnails.py; do
  if [ ! -f "$f" ]; then
    echo "${RED}[X] ERROR: Falta $f${RESET}"
    echo "  Restaura el archivo antes de volver a ejecutar ./run.sh"
    exit 1
  fi
done
echo "${GREEN}[OK]${RESET} Archivos del backend presentes"

# ============================================================
# 4) Verificar dependencias clave
# ============================================================
echo "${CYAN}[*]${RESET} Verificando dependencias..."
if ! ./venv/bin/python -c "import fastapi, uvicorn, playwright, httpx" 2>/dev/null; then
  echo "${YELLOW}[!]${RESET} Faltan dependencias. Instalando..."
  ./venv/bin/python -m pip install -r requirements.txt
  ./venv/bin/python -m playwright install chromium
fi

# Verificar que el backend se importa sin errores de sintaxis o imports rotos
echo "${CYAN}[*]${RESET} Verificando módulos del backend..."
if ! ./venv/bin/python -c "from backend.main import app" >/dev/null 2>&1; then
  echo "${RED}[X] ERROR: El backend no importa correctamente.${RESET}"
  echo ""
  echo "  Detalle del error:"
  ./venv/bin/python -c "from backend.main import app" || true
  echo ""
  echo "  Corrige el error y vuelve a ejecutar ./run.sh"
  exit 1
fi
echo "${GREEN}[OK]${RESET} Backend importable"

# ============================================================
# 5) Variables de entorno y limpieza
# ============================================================
export HEADLESS=1
export MATCH_VISIBLE_MINUTES=200
export LIVE_WINDOW_SEGMENTS=4
export ALLOWED_ORIGINS="http://localhost:5500,http://127.0.0.1:5500"

BACK_PID=""
FRONT_PID=""

cleanup() {
  local exit_code=$?
  echo ""
  echo "${YELLOW}[*] Deteniendo servicios...${RESET}"
  [ -n "$BACK_PID" ]  && kill "$BACK_PID"  2>/dev/null || true
  [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null || true
  pkill -f "uvicorn backend.main:app" 2>/dev/null || true
  pkill -f "http.server 5500"         2>/dev/null || true
  wait 2>/dev/null || true
  echo "${GREEN}[OK]${RESET} Listo. Hasta luego."
  exit "$exit_code"
}
trap cleanup INT TERM EXIT

# ============================================================
# 6) Arrancar backend
# ============================================================
echo "${CYAN}[*]${RESET} Arrancando backend en http://localhost:8000 ..."
./venv/bin/python -m uvicorn backend.main:app \
  --host 127.0.0.1 --port 8000 \
  > backend.log 2>&1 &
BACK_PID=$!

# ============================================================
# 7) Arrancar frontend
# ============================================================
echo "${CYAN}[*]${RESET} Arrancando frontend en http://localhost:5500 ..."
./venv/bin/python -m http.server 5500 \
  --directory frontend --bind 127.0.0.1 \
  > frontend.log 2>&1 &
FRONT_PID=$!

# ============================================================
# 8) Esperar a que ambos respondan (con detección de crash)
# ============================================================
echo "${CYAN}[*]${RESET} Esperando servicios (la primera vez puede tardar ~30s)..."
READY=0
for i in {1..60}; do
  if ! kill -0 "$BACK_PID" 2>/dev/null; then
    echo ""
    echo "${RED}[X] El backend se cerró inesperadamente.${RESET}"
    echo "    Últimas líneas de ${BOLD}backend.log${RESET}:"
    tail -n 25 backend.log 2>/dev/null || true
    exit 1
  fi
  if ! kill -0 "$FRONT_PID" 2>/dev/null; then
    echo ""
    echo "${RED}[X] El frontend se cerró inesperadamente.${RESET}"
    echo "    Últimas líneas de ${BOLD}frontend.log${RESET}:"
    tail -n 25 frontend.log 2>/dev/null || true
    exit 1
  fi

  B=$(curl -s -m 2 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/health 2>/dev/null || echo "000")
  F=$(curl -s -m 2 -o /dev/null -w "%{http_code}" http://127.0.0.1:5500/        2>/dev/null || echo "000")
  if [ "$B" = "200" ] && [ "$F" = "200" ]; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" = "0" ]; then
  echo "${YELLOW}[!] ADVERTENCIA: Los servicios podrían no estar listos aún.${RESET}"
  echo "    Revisa ${BOLD}backend.log${RESET} y ${BOLD}frontend.log${RESET}"
fi

# ============================================================
# 9) Abrir navegador
# ============================================================
URL="http://localhost:5500"
echo "${CYAN}[*]${RESET} Abriendo $URL ..."

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v sensible-browser >/dev/null 2>&1; then
  sensible-browser "$URL" >/dev/null 2>&1 &
elif command -v firefox >/dev/null 2>&1; then
  firefox "$URL" >/dev/null 2>&1 &
elif command -v google-chrome >/dev/null 2>&1; then
  google-chrome "$URL" >/dev/null 2>&1 &
elif command -v chromium >/dev/null 2>&1; then
  chromium "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 &
else
  echo "${YELLOW}[!]${RESET} Abre manualmente: $URL"
fi

# ============================================================
# 10) Banner final
# ============================================================
echo ""
echo "${GREEN}═══════════════════════════════════════════════════════${RESET}"
echo "${GREEN}  ${BOLD}TatoDeportes en marcha (multi-deporte)${RESET}"
echo "${GREEN}  Frontend: ${BOLD}http://localhost:5500${RESET}"
echo "${GREEN}  Backend:  ${BOLD}http://localhost:8000/docs${RESET}"
echo "${GREEN}  Health:   ${BOLD}http://localhost:8000/health${RESET}"
echo "${GREEN}  Deportes: ${BOLD}http://localhost:8000/api/sports${RESET}"
echo "${GREEN}  Canales:  ${BOLD}http://localhost:8000/api/channels?sport=football${RESET}"
echo "${GREEN}  Logs:     ${BOLD}backend.log${RESET}  ·  ${BOLD}frontend.log${RESET}"
echo "${GREEN}  Detener:  ${BOLD}Ctrl+C${RESET}"
echo "${GREEN}═══════════════════════════════════════════════════════${RESET}"
echo "${YELLOW}  Nota: la primera carga de canales M3U puede tardar ~10s.${RESET}"
echo "${YELLOW}  La siguiente vez serán instantáneos (caché de 1h).${RESET}"
echo ""

# ============================================================
# 11) Monitorear y esperar Ctrl+C
# ============================================================
while true; do
  if ! kill -0 "$BACK_PID" 2>/dev/null; then
    echo ""
    echo "${RED}[X] El backend se cerró inesperadamente.${RESET}"
    tail -n 25 backend.log 2>/dev/null || true
    exit 1
  fi
  if ! kill -0 "$FRONT_PID" 2>/dev/null; then
    echo ""
    echo "${RED}[X] El frontend se cerró inesperadamente.${RESET}"
    tail -n 25 frontend.log 2>/dev/null || true
    exit 1
  fi
  sleep 2
done