# ============================================================
# TatoDeportes — Backend productivo con Playwright + Chromium
# Base: imagen oficial que ya trae Chromium y dependencias.
# ============================================================
FROM mcr.microsoft.com/playwright/python:v1.43.0-jammy

# Optimizaciones de Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HEADLESS=1 \
    MATCH_VISIBLE_MINUTES=200 \
    LIVE_WINDOW_SEGMENTS=4

WORKDIR /app

# 1) Instalar dependencias primero (mejor caché de capas Docker)
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# 2) Copiar el código del backend
COPY backend ./backend

# 3) Render inyecta $PORT; usamos fallback a 8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]