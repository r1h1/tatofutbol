#!/usr/bin/env bash
set -e

# Ir siempre a la carpeta del script, sin importar desde dónde se invoque
cd "$(dirname "$(readlink -f "$0")")"

# ---------- 1) Asegurar venv ----------
if [ ! -d "venv" ]; then
  echo "No existe venv. Creándolo con python3.12…"
  python3.12 -m venv venv
  source venv/bin/activate
  pip install --upgrade pip
  pip install -r requirements.txt
  python -m playwright install chromium
else
  source venv/bin/activate
fi

# ---------- 2) Verificar dependencias clave ----------
if ! python -c "import fastapi, uvicorn, playwright" 2>/dev/null; then
  echo "Faltan dependencias. Instalando…"
  pip install -r requirements.txt
  python -m playwright install chromium
fi

# ---------- 3) Limpieza al salir ----------
BACK_PID=""
FRONT_PID=""
cleanup() {
  echo ""
  echo "Deteniendo servicios…"
  [ -n "$BACK_PID" ]  && kill "$BACK_PID"  2>/dev/null || true
  [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Listo. Hasta luego."
  exit 0
}
trap cleanup INT TERM

# ---------- 4) Arrancar backend ----------
echo "Arrancando backend en http://localhost:8000 …"
uvicorn backend.main:app --host 127.0.0.1 --port 8000 > backend.log 2>&1 &
BACK_PID=$!

# ---------- 5) Arrancar frontend ----------
echo "Arrancando frontend en http://localhost:5500 …"
python -m http.server 5500 --directory frontend --bind 127.0.0.1 > frontend.log 2>&1 &
FRONT_PID=$!

# ---------- 6) Esperar a que ambos respondan ----------
echo "Esperando servicios…"
for i in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs 2>/dev/null | grep -q "200" \
  && curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5500/ 2>/dev/null | grep -q "200"; then
    break
  fi
  sleep 0.5
done

# ---------- 7) Abrir navegador ----------
URL="http://localhost:5500"
echo "Abriendo $URL en el navegador…"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v sensible-browser >/dev/null 2>&1; then
  sensible-browser "$URL" >/dev/null 2>&1 &
elif command -v firefox >/dev/null 2>&1; then
  firefox "$URL" >/dev/null 2>&1 &
elif command -v google-chrome >/dev/null 2>&1; then
  google-chrome "$URL" >/dev/null 2>&1 &
else
  echo "No detecté navegador. Abre manualmente: $URL"
fi

# ---------- 8) Info final ----------
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  TatoFutbol en marcha"
echo "  Frontend: http://localhost:5500"
echo "  Backend:  http://localhost:8000/docs"
echo "  Logs:     backend.log  ·  frontend.log"
echo "  Ctrl+C para detener todo"
echo "═══════════════════════════════════════════════════════"
echo ""

# ---------- 9) Esperar a que el usuario pulse Ctrl+C ----------
wait