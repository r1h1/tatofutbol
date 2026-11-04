# backend/main.py
"""
Servidor FastAPI multi-deporte para streaming deportivo.

Compatible con la versión de producción: los endpoints existentes siguen
funcionando exactamente igual para fútbol (sport="football" por defecto).
"""
from __future__ import annotations

import asyncio
import os
import re as _re
import time
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import quote, urljoin, urlparse

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .scraper import (
    get_match_list,
    get_matches_with_servers,
    resolve_servers,
)
from .sports_config import is_valid_sport, list_sports
from .thumbnails import resolve_thumbnail

# ============================================================
# Configuración
# ============================================================
app = FastAPI(title="Tato Futbol — Multi-sport", version="2.0.0")

# CORS configurable vía env (ALLOWED_ORIGINS separado por comas)
_ALLOWED_RAW = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000",
).strip()
ALLOWED_ORIGINS = [o.strip() for o in _ALLOWED_RAW.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

MATCH_VISIBLE_MINUTES = int(os.environ.get("MATCH_VISIBLE_MINUTES", "200"))
LIVE_WINDOW_MINUTES = 120
LIVE_WINDOW_SEGMENTS = int(os.environ.get("LIVE_WINDOW_SEGMENTS", "4"))

MATCHES_TTL = 300       # 5 min
SERVERS_TTL = 600       # 10 min
STREAM_TTL = 1800       # 30 min

# Cachés en memoria, todas separadas por deporte cuando aplica.
# _match_cache:     {"football": {"data": [...], "ts": 123}, "basketball": {...}}
# _servers_cache:   {"football::https://...": {"data": [...], "ts": 123}}
# _stream_cache:    {"https://...m3u8": {"url": "...", "ts": 123}}
_match_cache: Dict[str, Dict] = {}
_servers_cache: Dict[str, Dict] = {}
_stream_cache: Dict[str, Dict] = {}


# ============================================================
# Filtro y ordenamiento de partidos (idéntico a producción)
# ============================================================
def _parse_match_minutes(
    time_str: Optional[str], now: Optional[datetime] = None
) -> Optional[float]:
    if not time_str:
        return None
    try:
        h, m = time_str.strip().split(":")
        now = now or datetime.now()
        match_dt = now.replace(hour=int(h), minute=int(m), second=0, microsecond=0)
        delta_min = (now - match_dt).total_seconds() / 60.0
        if delta_min < -18 * 60:
            delta_min += 24 * 60
        return delta_min
    except Exception:
        return None


def _status_for(delta_min: Optional[float]) -> str:
    if delta_min is None:
        return "unknown"
    if -5 <= delta_min <= LIVE_WINDOW_MINUTES:
        return "live"
    if delta_min < -5:
        return "upcoming"
    return "recent"


def _match_sort_key(m: Dict):
    delta = m.get("_delta_min")
    if delta is None:
        return (3, 0)
    status = _status_for(delta)
    if status == "live":
        return (0, delta)
    if status == "upcoming":
        return (1, -delta)
    return (2, delta)


def _filter_and_sort_matches(matches: List[Dict]) -> List[Dict]:
    now = datetime.now()
    visible: List[Dict] = []

    for m in matches:
        delta = _parse_match_minutes(m.get("time"), now)
        if delta is None or delta < MATCH_VISIBLE_MINUTES:
            m2 = dict(m)
            m2["_delta_min"] = delta
            m2["status"] = _status_for(delta)
            visible.append(m2)

    visible.sort(key=_match_sort_key)

    out: List[Dict] = []
    for m in visible:
        clean = {k: v for k, v in m.items() if k != "_delta_min"}
        out.append(clean)
    return out


# ============================================================
# Proxy HLS (idéntico a producción)
# ============================================================
def _headers_for(url: str) -> Dict[str, str]:
    host = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    return {
        "User-Agent": UA,
        "Referer": host + "/",
        "Origin": host,
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        "Connection": "keep-alive",
    }


def _proxy_url(raw_url: str) -> str:
    return f"/api/proxy?url={quote(raw_url, safe='')}"


def _trim_live_media_playlist(
    lines: List[str], max_segments: int = LIVE_WINDOW_SEGMENTS
) -> List[str]:
    is_vod = any(l.strip() == "#EXT-X-ENDLIST" for l in lines)
    is_master = any(l.strip().startswith("#EXT-X-STREAM-INF") for l in lines)
    if is_vod or is_master:
        return lines

    seg_indices = [i for i, l in enumerate(lines) if l.strip() and not l.strip().startswith("#")]
    if len(seg_indices) <= max_segments:
        return lines

    to_drop = len(seg_indices) - max_segments
    first_kept_seg = seg_indices[to_drop]

    keep_start = first_kept_seg
    while keep_start > 0 and not lines[keep_start - 1].strip().startswith("#EXTINF"):
        keep_start -= 1
    keep_start -= 1

    first_seg_block = seg_indices[0]
    while first_seg_block > 0 and not lines[first_seg_block - 1].strip().startswith("#EXTINF"):
        first_seg_block -= 1
    first_seg_block -= 1

    header = lines[:first_seg_block]
    kept = lines[keep_start:]

    new_header: List[str] = []
    for line in header:
        s = line.strip()
        if s.startswith("#EXT-X-MEDIA-SEQUENCE:"):
            try:
                new_header.append(f"#EXT-X-MEDIA-SEQUENCE:{int(s.split(':', 1)[1]) + to_drop}")
            except ValueError:
                new_header.append(line)
        elif s.startswith("#EXT-X-DISCONTINUITY-SEQUENCE:"):
            try:
                new_header.append(f"#EXT-X-DISCONTINUITY-SEQUENCE:{int(s.split(':', 1)[1]) + to_drop}")
            except ValueError:
                new_header.append(line)
        else:
            new_header.append(line)

    return new_header + kept


def _rewrite_playlist(content: str, base_url: str) -> str:
    lines = content.splitlines()
    lines = _trim_live_media_playlist(lines)

    out: List[str] = []
    for line in lines:
        raw = line.strip()
        if not raw:
            out.append(raw)
            continue
        if raw.startswith("#EXT-X-KEY") or raw.startswith("#EXT-X-MAP"):
            out.append(_re.sub(
                r'URI="([^"]+)"',
                lambda m: f'URI="{_proxy_url(urljoin(base_url, m.group(1)))}"',
                raw,
            ))
        elif raw.startswith("#"):
            out.append(raw)
        else:
            out.append(_proxy_url(urljoin(base_url, raw)))
    return "\n".join(out)


async def _fetch_with_retries(
    url: str, attempts: int = 3, timeout: float = 20.0
) -> httpx.Response:
    last_err = None
    for i in range(attempts):
        try:
            async with httpx.AsyncClient(
                timeout=timeout, follow_redirects=True, http2=False
            ) as client:
                req = client.build_request("GET", url, headers=_headers_for(url))
                resp = await client.send(req, stream=False)
                if resp.status_code == 200:
                    return resp
                if resp.status_code in (403, 404):
                    raise HTTPException(
                        resp.status_code,
                        f"Servidor de origen devolvió {resp.status_code}",
                    )
                last_err = f"HTTP {resp.status_code}"
        except HTTPException:
            raise
        except Exception as e:
            last_err = str(e)
        if i < attempts - 1:
            await asyncio.sleep(0.3 * (i + 1))
    raise HTTPException(502, f"Upstream falló tras {attempts} intentos: {last_err}")


# ============================================================
# Endpoints
# ============================================================
@app.get("/api/sports")
async def api_sports():
    """
    Lista de perfiles de deporte disponibles.
    El frontend usa esta lista para construir el selector de perfiles.

    Respuesta:
        [
          {"key": "football",   "display_name": "Fútbol",     "icon": "football",   "accent": "#b7f35a"},
          {"key": "basketball", "display_name": "Basketball", "icon": "basketball", "accent": "#f4a261"},
          ...
        ]
    """
    return list_sports()


@app.get("/api/matches")
async def api_matches(
    sport: str = Query("football"),
    all: int = 0,
    force: int = 0,
):
    """
    Agenda filtrada de un deporte.

    Parámetros:
      - sport: clave de deporte. Default "football" (compat con producción).
      - all=1: devuelve todos los partidos sin filtrar (debug).
      - force=1: ignora la caché y vuelve a scrapear.
    """
    sport = (sport or "football").strip().lower()
    if not is_valid_sport(sport):
        raise HTTPException(400, f"Deporte no soportado: {sport}")

    now = time.time()
    cache = _match_cache.get(sport) or {"data": [], "ts": 0}
    needs_refresh = bool(force) or not cache["data"] or (now - cache["ts"] >= MATCHES_TTL)

    if not needs_refresh:
        data = cache["data"]
    else:
        data = await get_match_list(sport)
        _match_cache[sport] = {"data": data, "ts": now}

    if all:
        return data
    return _filter_and_sort_matches(data)


@app.get("/api/servers")
async def api_servers(
    match_url: str = Query(...),
    sport: str = Query("football"),
    source: str = Query("roja"),
    force: int = Query(0),
):
    """
    Lista de servidores resueltos para un partido.

    Parámetros:
      - match_url: URL del embed del partido.
      - sport: clave de deporte (para buscar en la caché correcta).
      - force=1: ignora la caché de servidores.
    """
    sport = (sport or "football").strip().lower()
    if not is_valid_sport(sport):
        raise HTTPException(400, f"Deporte no soportado: {sport}")

    now = time.time()
    cache_key = f"{sport}::{match_url}"

    if not force:
        cached = _servers_cache.get(cache_key)
        if cached and now - cached["ts"] < SERVERS_TTL:
            return cached["data"]

    sport_cache = _match_cache.get(sport) or {"data": [], "ts": 0}
    matches: List[Dict] = sport_cache["data"] or []
    if not matches or now - sport_cache["ts"] >= MATCHES_TTL:
        matches = await get_match_list(sport)
        _match_cache[sport] = {"data": matches, "ts": now}

    target = next((m for m in matches if m.get("match_url") == match_url), None)
    if not target:
        # Fallback: usar match_url como único embed.
        target = {"servers": [{"name": "Servidor principal", "embed_url": match_url}]}

    servers_in = target.get("servers") or []
    try:
        resolved = await get_matches_with_servers(match_url, servers_in)
    except Exception as e:
        raise HTTPException(500, f"Error resolviendo servidores: {e}")

    resolved.sort(key=lambda s: (
        0 if (s.get("working") and s.get("language") == "es") else
        1 if s.get("working") else
        2
    ))

    _servers_cache[cache_key] = {"data": resolved, "ts": now}
    return resolved


@app.get("/api/resolve")
async def api_resolve(match_url: str = Query(...)):
    """
    Resuelve un match_url a un stream_url HLS. Universal (no depende del deporte).
    """
    now = time.time()
    cached = _stream_cache.get(match_url)
    if cached and now - cached["ts"] < STREAM_TTL:
        return {"stream_url": cached["url"]}

    try:
        results = await resolve_servers(
            [{"name": "Servidor principal", "embed_url": match_url}]
        )
    except Exception as e:
        raise HTTPException(500, f"Error resolviendo stream: {e}")

    for r in results:
        if r.get("working") and r.get("stream_url"):
            _stream_cache[match_url] = {"url": r["stream_url"], "ts": now}
            return {
                "stream_url": r["stream_url"],
                "language": r.get("language", "unknown"),
            }

    raise HTTPException(404, "No se pudo resolver el stream de este partido.")


@app.get("/api/proxy")
async def api_proxy(url: str = Query(...)):
    """
    Proxy HLS universal (playlists, segmentos, keys). Sin cambios.
    """
    resp = await _fetch_with_retries(url)
    content_type = (resp.headers.get("content-type") or "").lower()

    is_playlist = (
        ".m3u8" in url
        or "mpegurl" in content_type
        or url.lower().endswith(".m3u")
    )

    if is_playlist:
        text = resp.content.decode("utf-8", errors="ignore")
        new_text = _rewrite_playlist(text, str(resp.url))
        return Response(
            content=new_text,
            media_type="application/vnd.apple.mpegurl",
            headers={"Cache-Control": "no-store"},
        )

    if ".key" in url or "key" in content_type:
        media_type = "application/octet-stream"
    elif ".m4s" in url or ".mp4" in url:
        media_type = "video/mp4"
    elif ".aac" in url:
        media_type = "audio/aac"
    else:
        media_type = "video/mp2t"

    return Response(
        content=resp.content,
        media_type=media_type,
        headers={
            "Content-Length": str(len(resp.content)),
            "Cache-Control": "public, max-age=30",
        },
    )


@app.get("/api/thumbnail")
async def api_thumbnail(title: str = Query(...), league: str = Query("")):
    return await resolve_thumbnail(title, league)


@app.get("/")
async def root():
    return {
        "app": "Tato Futbol",
        "status": "ok",
        "sports": [s["key"] for s in list_sports()],
        "allowed_origins": ALLOWED_ORIGINS,
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "ts": time.time()}