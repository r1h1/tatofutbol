# backend/thumbnails.py
import asyncio
import hashlib
import re
import time
from typing import Dict, Optional, Tuple

import httpx

# Cliente HTTP reutilizable
_http_client: Optional[httpx.AsyncClient] = None

def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=8.0,
            follow_redirects=True,
            headers={"User-Agent": "TatoFut/1.0 (tesis educativa; contacto@ejemplo.com)"},
        )
    return _http_client

# Caché en memoria
_thumb_cache: Dict[str, Dict] = {}
THUMB_TTL = 6 * 3600  # 6 horas

# ============================================================
# Lista de imágenes de fútbol que SIEMPRE funcionan (Unsplash CDN directo)
# ============================================================
FALLBACK_IMAGES = [
    "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=600&h=400&fit=crop",
    "https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=600&h=400&fit=crop",
    "https://images.unsplash.com/photo-1574629810360-7efbb4a04728?w=600&h=400&fit=crop",
    "https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=600&h=400&fit=crop",
    "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=600&h=400&fit=crop",
    "https://images.unsplash.com/photo-1551958219-acbc608c6377?w=600&h=400&fit=crop",
    "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=600&h=400&fit=crop",
    "https://images.unsplash.com/photo-1493146980562-b9c6b21fcae2?w=600&h=400&fit=crop",
    "https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=600&h=400&fit=crop",
    "https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=600&h=400&fit=crop",
]

def _split_title(title: str) -> Tuple[str, str]:
    """'Serie A: Milan vs Bologna' → ('Milan', 'Bologna')"""
    t = (title or "").strip()
    if ":" in t and len(t.split(":", 1)[0]) < 40:
        t = t.split(":", 1)[1].strip()
    for sep in (" vs. ", " vs ", " v ", " @ ", " - ", " – ", " x "):
        if sep.lower() in t.lower():
            parts = re.split(re.escape(sep), t, maxsplit=1, flags=re.I)
            if len(parts) == 2:
                a, b = parts[0].strip(), parts[1].strip()
                if a and b:
                    return a, b
    return t, ""

def _pick_fallback(title: str) -> str:
    """Selecciona una imagen de la lista basada en un hash del título (determinista)."""
    h = int(hashlib.md5(title.encode()).hexdigest()[:8], 16)
    return FALLBACK_IMAGES[h % len(FALLBACK_IMAGES)]

async def _wikipedia_image(team_name: str) -> Optional[str]:
    """Busca la imagen principal del equipo en Wikipedia (API pública)."""
    if not team_name:
        return None
    try:
        client = _get_client()
        # Usar la API de Wikipedia en español
        params = {
            "action": "query",
            "titles": team_name,
            "prop": "pageimages",
            "format": "json",
            "pithumbsize": 600,
            "redirects": 1,
        }
        r = await client.get("https://es.wikipedia.org/w/api.php", params=params)
        if r.status_code != 200:
            return None
        data = r.json()
        pages = data.get("query", {}).get("pages", {})
        for page_id, page in pages.items():
            if page_id == "-1":
                continue  # No existe la página
            thumb = page.get("thumbnail", {}).get("source")
            if thumb:
                return thumb
        return None
    except Exception as e:
        print(f"[THUMB] Wikipedia error '{team_name}': {e}")
        return None

async def resolve_thumbnail(title: str, league: str = "") -> Dict:
    """
    Devuelve un dict con:
      - type: "photo"
      - thumbnail_url: URL de la imagen (siempre válida)
    """
    key = f"{title}||{league}"
    now = time.time()

    # 1. Caché
    if key in _thumb_cache and now - _thumb_cache[key]["ts"] < THUMB_TTL:
        return _thumb_cache[key]["data"]

    # 2. Parsear título
    clean_title = re.sub(r"^.*?:\s*", "", title).strip()
    home, away = _split_title(clean_title)

    # 3. Intentar Wikipedia para el equipo local
    img_url = None
    source = "fallback"
    
    if home:
        img_url = await _wikipedia_image(home)
        if img_url:
            source = "wikipedia"
    
    # 4. Si falló, intentar con el visitante
    if not img_url and away:
        img_url = await _wikipedia_image(away)
        if img_url:
            source = "wikipedia"
    
    # 5. Si aún falla, usar la imagen de fútbol predefinida
    if not img_url:
        img_url = _pick_fallback(title)

    # 6. Devolver resultado
    result = {
        "type": "photo",
        "thumbnail_url": img_url,
        "source": source,
        "title": title,
        "home_name": home,
        "away_name": away,
    }
    _thumb_cache[key] = {"data": result, "ts": now}
    return result