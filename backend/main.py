# backend/main.py
"""
Servidor FastAPI multi-deporte para streaming deportivo.

Compatible con la version de produccion: los endpoints existentes siguen
funcionando exactamente igual para futbol (sport="football" por defecto).
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
from .m3u_sources import get_channels_for_sport
from .sports_config import is_valid_sport, list_sports
from .thumbnails import resolve_thumbnail
from .news import get_news_for_sport

# ============================================================
# Configuracion
# ============================================================
app = FastAPI(title="Tato Futbol - Multi-sport", version="2.0.0")

# CORS configurable via env (ALLOWED_ORIGINS separado por comas)
_ALLOWED_RAW = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000",
).strip()
# rstrip("/") para que "https://tatotv.netlify.app/" (con barra)
# coincida con el header Origin del navegador, que NUNCA lleva barra final.
ALLOWED_ORIGINS = [
    o.strip().rstrip("/")
    for o in _ALLOWED_RAW.split(",")
    if o.strip()
]

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
SCORES_TTL = 30         # 30 s (scores en vivo se refrescan seguido)

# Rutas de ESPN por deporte (para /api/scores)
ESPN_LIVE_PATHS = {
    "football": "soccer/all",
    "basketball": "basketball/nba",
}

# Caches en memoria, todas separadas por deporte cuando aplica.
_match_cache: Dict[str, Dict] = {}
_servers_cache: Dict[str, Dict] = {}
_stream_cache: Dict[str, Dict] = {}
_scores_cache: Dict[str, Dict] = {}


# ============================================================
# Filtro y ordenamiento de partidos
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
# Proxy HLS
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
                        f"Servidor de origen devolvio {resp.status_code}",
                    )
                last_err = f"HTTP {resp.status_code}"
        except HTTPException:
            raise
        except Exception as e:
            last_err = str(e)
        if i < attempts - 1:
            await asyncio.sleep(0.3 * (i + 1))
    raise HTTPException(502, f"Upstream fallo tras {attempts} intentos: {last_err}")


# ============================================================
# Marcadores en vivo desde ESPN
# ============================================================
async def _fetch_espn_live_score(home: str, away: str, sport: str) -> Optional[Dict]:
    """
    Consulta la API publica de ESPN y devuelve el marcador de un partido.

    Acepta cualquier estado del partido (pre / in / post).
    Si no lo encuentra, devuelve None.

    Respuesta (si lo encuentra):
        {
          "available": True,
          "state": "in" | "pre" | "post",
          "score": "2 - 1",
          "home_score": "2",
          "away_score": "1",
          "clock": "67'",
          "period": 2,
          "events": [ {team, player, minute, icon}, ... ],
        }
    """
    espn_path = ESPN_LIVE_PATHS.get(sport)
    if not espn_path:
        return None

    home_l = (home or "").strip().lower()
    away_l = (away or "").strip().lower()
    if not home_l or not away_l:
        return None

    try:
        async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": UA}) as client:
            # 1) Buscar el evento por nombre de equipos
            r = await client.get(
                "https://site.web.api.espn.com/apis/search/v2",
                params={"query": f"{home} {away}", "limit": 5, "type": "event"},
            )
            if r.status_code != 200:
                return None

            data = r.json()
            event_id = None
            for result in data.get("results", []):
                for item in result.get("contents", []):
                    name = (item.get("name") or "").lower()
                    if home_l in name and away_l in name:
                        event_id = item.get("id")
                        break
                if event_id:
                    break

            if not event_id:
                return None

            # 2) Obtener el summary del evento
            r2 = await client.get(
                f"https://site.api.espn.com/apis/site/v2/sports/{espn_path}/summary",
                params={"event": event_id},
            )
            if r2.status_code != 200:
                return None

            summary = r2.json()
            comps = summary.get("header", {}).get("competitions", [])
            if not comps:
                return None

            comp = comps[0]
            status = comp.get("status", {}) or {}
            state = ((status.get("type", {}) or {}).get("state") or "").lower()

            competitors = comp.get("competitors", [])
            if len(competitors) < 2:
                return None

            home_score = "0"
            away_score = "0"
            home_team_id = None
            away_team_id = None

            for c in competitors:
                ha = c.get("homeAway")
                score = c.get("score", "0")
                team = c.get("team", {}) or {}
                if ha == "home":
                    home_score = score
                    home_team_id = team.get("id")
                elif ha == "away":
                    away_score = score
                    away_team_id = team.get("id")

            # Clock y periodo (solo si esta en vivo)
            clock = ""
            period = ""
            if state == "in":
                clock = (
                    status.get("displayClock")
                    or (status.get("clock", {}) or {}).get("displayValue", "")
                    or ""
                )
                period = status.get("period", "") or ""

            # Eventos (solo si ya empezo)
            events: List[Dict] = []
            if state in ("in", "post"):
                for ev in summary.get("keyEvents") or []:
                    et = ((ev.get("type", {}) or {}).get("text") or "").lower()
                    if not any(k in et for k in (
                        "goal", "penalty", "card", "basket", "three",
                        "touchdown", "home run", "strikeout", "knockdown",
                    )):
                        continue

                    tid = (ev.get("team", {}) or {}).get("id")
                    is_home = (tid == home_team_id) or (tid is None and False)

                    clock_ev = ((ev.get("clock", {}) or {}).get("displayValue") or "")
                    players = ev.get("participants", []) or []
                    pname = ""
                    if players:
                        athlete = (players[0].get("athlete", {}) or {})
                        pname = athlete.get("displayName", "") or ""

                    icon = "goal"
                    if "penalty" in et:
                        icon = "penalty_goal"
                    elif "red card" in et:
                        icon = "red_card"
                    elif "yellow card" in et:
                        icon = "yellow_card"
                    elif "three" in et:
                        icon = "three_pointer"
                    elif "basket" in et:
                        icon = "basket"
                    elif "touchdown" in et:
                        icon = "touchdown"
                    elif "home run" in et:
                        icon = "home_run"
                    elif "strikeout" in et:
                        icon = "strikeout"
                    elif "knockdown" in et:
                        icon = "knockdown"

                    events.append({
                        "team": "home" if is_home else "away",
                        "player": pname,
                        "minute": clock_ev.replace("'", ""),
                        "icon": icon,
                    })

            return {
                "available": True,
                "state": state or "unknown",
                "score": f"{home_score} - {away_score}",
                "home_score": home_score,
                "away_score": away_score,
                "clock": clock,
                "period": period,
                "events": events,
            }

    except Exception:
        return None


# ============================================================
# Endpoints
# ============================================================
@app.get("/api/sports")
async def api_sports():
    """
    Lista de perfiles de deporte disponibles.
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


@app.get("/api/channels")
async def api_channels(sport: str = Query("football")):
    """
    Canales M3U en vivo (iptv-org + Free-TV + manuales).
    """
    sport = (sport or "football").strip().lower()
    if not is_valid_sport(sport):
        raise HTTPException(400, f"Deporte no soportado: {sport}")
    try:
        channels = await get_channels_for_sport(sport)
        return channels
    except Exception as e:
        raise HTTPException(500, f"Error cargando canales M3U: {e}")


@app.get("/api/news")
async def api_news(sport: str = Query("football")):
    """
    Noticias de futbol o basketball desde feeds RSS publicos.
    """
    sport = (sport or "football").strip().lower()
    if sport not in ("football", "basketball"):
        raise HTTPException(400, f"Deporte no soportado para noticias: {sport}")
    try:
        news = await get_news_for_sport(sport)
        return news
    except Exception as e:
        raise HTTPException(500, f"Error cargando noticias: {e}")


@app.get("/api/scores")
async def api_scores(
    home: str = Query(...),
    away: str = Query(...),
    sport: str = Query("football"),
):
    """
    Marcador en vivo de un partido consultado a la API publica de ESPN.

    El frontend lo llama cada 30s mientras un partido esta abierto en el
    player para actualizar el overlay de scores.

    Parametros:
      - home: nombre del equipo local ("Real Madrid").
      - away: nombre del equipo visitante ("Barcelona").
      - sport: "football" (default) o "basketball".

    Respuesta:
        {
          "available": true,
          "state": "in",
          "score": "2 - 1",
          "home_score": "2",
          "away_score": "1",
          "clock": "67'",
          "period": 2,
          "events": [...]
        }

    Si no encuentra el partido:
        {"available": false, "reason": "not_found"}
    """
    sport = (sport or "football").strip().lower()
    if sport not in ("football", "basketball"):
        raise HTTPException(400, f"Deporte no soportado para scores: {sport}")

    home = (home or "").strip()
    away = (away or "").strip()
    if not home or not away:
        raise HTTPException(400, "Se requieren 'home' y 'away'")

    cache_key = f"{sport}::{home.lower()}::{away.lower()}"
    now = time.time()
    cached = _scores_cache.get(cache_key)
    if cached and (now - cached["ts"] < SCORES_TTL):
        return cached["data"]

    data = await _fetch_espn_live_score(home, away, sport)
    if data is None:
        data = {"available": False, "reason": "not_found"}

    _scores_cache[cache_key] = {"data": data, "ts": now}
    return data


@app.get("/api/servers")
async def api_servers(
    match_url: str = Query(...),
    sport: str = Query("football"),
    source: str = Query("roja"),
    force: int = Query(0),
):
    """
    Lista de servidores resueltos para un partido.
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
async def api_thumbnail(
    title: str = Query(...),
    league: str = Query(""),
    sport: str = Query("football"),
):
    """
    Miniatura de un partido.

    Parametros:
      - title:  titulo del partido (obligatorio).
      - league: liga inferida (opcional).
      - sport:  "football" (default) o "basketball". Determina el fallback
                cuando Wikipedia no encuentra al equipo.
    """
    return await resolve_thumbnail(title, league, sport)


@app.get("/")
async def root():
    return {
        "app": "Tato Futbol",
        "status": "ok",
        "sports": [s["key"] for s in list_sports()],
        "allowed_origins": ALLOWED_ORIGINS,
    }


@app.head("/")
async def root_head():
    """
    Render hace un HEAD / como health check y FastAPI solo
    tenia GET /, asi que devolvia 405 Method Not Allowed en los logs.
    Este handler responde 200 sin body al HEAD.
    """
    return Response(status_code=200)


@app.get("/health")
async def health():
    return {"status": "healthy", "ts": time.time()}