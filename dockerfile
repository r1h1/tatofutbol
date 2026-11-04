# Usa la imagen oficial de Playwright que ya incluye Chromium y sus dependencias
FROM mcr.microsoft.com/playwright/python:v1.43.0-jammy

# Configuraciones de Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HEADLESS=1 \
    PORT=8000

WORKDIR /app

# Copia e instala las dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia el código del backend
COPY backend ./backend

# Expone el puerto (Render inyecta la variable $PORT)
EXPOSE 8000

# Comando de arranque: Uvicorn escuchando en 0.0.0.0 y usando el puerto de Render
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]