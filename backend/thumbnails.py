# backend/thumbnails.py
"""Thumbnails desde Wikipedia (es → en → limpio) con fallback al Camp Nou."""
import asyncio
import re
import time
from typing import Dict, Optional, Tuple

import httpx

_http_client: Optional[httpx.AsyncClient] = None

def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=10.0,
            follow_redirects=True,
            headers={
                "User-Agent": "TatoDeportes/1.0 (proyecto educativo; contacto@tatodeportes.example)"
            },
        )
    return _http_client

_thumb_cache: Dict[str, Dict] = {}
THUMB_TTL = 6 * 3600

_team_cache: Dict[str, Optional[str]] = {}
TEAM_TTL = 6 * 3600
_team_ts: Dict[str, float] = {}

# ── IMAGEN POR DEFECTO (SPOTIFY CAMP NOU) ──
FALLBACK_URL = "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/89/Camp_Nou_%28Joan_Gamper_2019%29.jpg/1280px-Camp_Nou_%28Joan_Gamper_2019%29.jpg"

_CLUB_SUFFIXES = re.compile(
    r"\s+(FC|CF|SC|AC|CD|UD|RC|RCD|SAD|SD|CA|AFC|BK|IF|FF|SS|US|AS|SSC|CFC|"
    r"F\.C\.|C\.F\.|S\.C\.|A\.C\.|C\.D\.|U\.D\.|R\.C\.|S\.A\.D\.|"
    r"Club|Football Club|Futbol Club|Atlético|Atletico)$",
    re.IGNORECASE,
)

def _split_title(title: str) -> Tuple[str, str]:
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

def _clean_team_name(name: str) -> str:
    cleaned = _CLUB_SUFFIXES.sub("", name).strip()
    return cleaned if cleaned else name

async def _wikipedia_image(team_name: str, lang: str) -> Optional[str]:
    if not team_name or len(team_name) < 2:
        return None

    cache_key = f"{team_name.lower()}||{lang}"
    now = time.time()

    if cache_key in _team_cache:
        cached_at = _team_ts.get(cache_key, 0)
        if _team_cache[cache_key] is not None and (now - cached_at) < TEAM_TTL:
            return _team_cache[cache_key]

    candidates = [team_name]
    cleaned = _clean_team_name(team_name)
    if cleaned != team_name:
        candidates.append(cleaned)

    client = _get_client()

    for candidate in candidates:
        try:
            params = {
                "action": "query",
                "titles": candidate,
                "prop": "pageimages",
                "format": "json",
                "pithumbsize": 600,
                "redirects": 1,
            }
            url = f"https://{lang}.wikipedia.org/w/api.php"
            r = await client.get(url, params=params)
            if r.status_code != 200:
                continue
            data = r.json()
            pages = data.get("query", {}).get("pages", {})
            for page_id, page in pages.items():
                if page_id == "-1":
                    continue
                thumb = page.get("thumbnail", {}).get("source")
                if thumb:
                    _team_cache[cache_key] = thumb
                    _team_ts[cache_key] = now
                    return thumb
        except Exception:
            pass

    _team_cache[cache_key] = None
    _team_ts[cache_key] = now
    return None

async def resolve_thumbnail(title: str, league: str = "") -> Dict:
    key = f"{title}||{league}"
    now = time.time()

    if key in _thumb_cache and now - _thumb_cache[key]["ts"] < THUMB_TTL:
        return _thumb_cache[key]["data"]

    clean_title = re.sub(r"^.*?:\s*", "", title).strip()
    home, away = _split_title(clean_title)

    img_url = None
    source = "fallback"

    attempts = []
    if home:
        attempts.append((home, "es"))
        attempts.append((home, "en"))
    if away:
        attempts.append((away, "es"))
        attempts.append((away, "en"))

    for team, lang in attempts:
        img_url = await _wikipedia_image(team, lang)
        if img_url:
            source = f"wikipedia-{lang}"
            break

    if not img_url:
        img_url = FALLBACK_URL
        print(f"[THUMB] Usando Camp Nou para '{title}'")

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