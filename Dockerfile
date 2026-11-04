# ============================================================
# TatoDeportes Backend — Dockerfile para Render
# ============================================================
# Base: python:3.12-slim (no la imagen de Playwright).
# Instalamos Chromium con `playwright install --with-deps` para
# garantizar que la versión del binario SIEMPRE coincide con la
# del paquete `playwright` que instala pip. Así no se desincroniza
# cuando cambias requirements.txt.
# ============================================================
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HEADLESS=1 \
    PORT=8000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# 1) Paquetes del sistema que Chromium necesita (por si --with-deps falla)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget gnupg libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
    libcairo2 libx11-6 libx11-xcb1 libxcb1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

# 2) Dependencias de Python
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 3) Chromium + deps de Playwright (versión exacta del pip)
#    Usamos `python -m playwright` en vez del script `playwright`
#    para no depender de que pip lo haya puesto en el PATH del
#    contenedor (evita el clásico "playwright: command not found").
RUN python -m playwright install --with-deps chromium

# 4) Código del backend
COPY backend ./backend

EXPOSE 8000

# Render inyecta $PORT; en local cae a 8000
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]