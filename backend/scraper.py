# backend/scraper.py
"""
Scraper multi-fuente y multi-servidor para plataformas de streaming deportivo.
"""
from __future__ import annotations

import asyncio
import os
import re
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import httpx
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

# ============================================================
# Configuración
# ============================================================
BASE_URL_ROJA = "https://rojadirectatvplay.com"
AGENDA_URL_ROJA = f"{BASE_URL_ROJA}/agenda"

BASE_URL_FUTBOLLIBRE = "https://futbollibretvplus.com"
AGENDA_URL_FUTBOLLIBRE = f"{BASE_URL_FUTBOLLIBRE}/"

BASE_URL_TARJETAROJA = "https://tarjetarojatv.eu"
AGENDA_URL_TARJETAROJA = f"{BASE_URL_TARJETAROJA}/"

BASE_URL_FUTBOLVIVO = "https://futbolvivo.tv"
AGENDA_URL_FUTBOLVIVO = f"{BASE_URL_FUTBOLVIVO}/"

# --------- NUEVAS FUENTES ---------
BASE_URL_PIRLOTV = "https://pirlotv.la"
AGENDA_URL_PIRLOTV = f"{BASE_URL_PIRLOTV}/home.php"

BASE_URL_PIRLOTVONLINE = "https://pirlotvonline.club"
AGENDA_URL_PIRLOTVONLINE = f"{BASE_URL_PIRLOTVONLINE}/"

BASE_URL_PIRLOTVV = "https://pirlotvv.org"
AGENDA_URL_PIRLOTVV = f"{BASE_URL_PIRLOTVV}/"

BASE_URL_LIBREFUTBOL = "https://librefutbol.vip"
AGENDA_URL_LIBREFUTBOL = f"{BASE_URL_LIBREFUTBOL}/"

HEADLESS = os.environ.get("HEADLESS", "1") == "1"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

SPANISH_HINTS = (
    "español", "espanol", "spanish", " dsports", "dsports", "espn", "tnt",
    "fox sports", "tyc", "movistar", "ligamax", "win sports", "tudn",
    "telemundo", "goltv", "directv", "star+", "star plus", "premium",
    "latino", "sudamerica", "argentina", "mexico", "peru", "colombia",
    "chile", "uruguay", "paraguay", "bolivia", "ecuador", "venezuela",
)
ENGLISH_HINTS = (
    "english", "ingles", "inglés", " sky sports", "bt sport", "nbc", "cbs",
    "us only", "usa", "uk only",
)

USER_AGENT_HEADERS = {
    "User-Agent": UA,
    "Accept": "*/*",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.5",
    "Accept-Encoding": "identity",
    "Connection": "keep-alive",
}

# Patrón genérico de URLs de eventos / canales / partidos
DEFAULT_LINK_PATTERN = (
    r"(partido|evento|en-?vivo|en-vivo|online|live|canal|channel|"
    r"stream|ver|watch|match|futbol|deporte|game)"
)

# ============================================================
# 1) Agenda
# ============================================================
async def get_match_list() -> List[Dict]:
    tasks = [
        _roja_get_matches(),
        _futbollibre_get_matches(),
        _tarjetaroja_get_matches(),
        _futbolvivo_get_matches(),
        _pirlotv_get_matches(),
        _pirlotvonline_get_matches(),
        _pirlotvv_get_matches(),
        _librefutbol_get_matches(),
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    matches: List[Dict] = []
    for r in results:
        if isinstance(r, list):
            matches.extend(r)

    seen = set()
    unique: List[Dict] = []
    for m in matches:
        key = (m.get("title", "").lower(), m.get("time", ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(m)

    # Añadir marcadores y eventos a los partidos finalizados
    await _add_scores_and_events_to_matches(unique)

    print(f"[SCRAPER] Agenda total: {len(unique)} partidos.")
    return unique


async def _add_scores_and_events_to_matches(matches: List[Dict]) -> None:
    """
    Recorre los partidos, extrae los equipos y consulta ESPN para obtener
    el marcador final y los eventos (goles, tarjetas).
    """
    sem = asyncio.Semaphore(5)
    async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": UA}) as client:
        async def process(match):
            if match.get("status") != "recent":
                return
            title = match.get("title", "")
            home, away = _split_title(title)
            if not home or not away:
                return
            async with sem:
                data = await _fetch_espn_match_data(client, home, away)
                if data:
                    match["score"] = data["score"]
                    match["events"] = data["events"]

        await asyncio.gather(*(process(m) for m in matches), return_exceptions=True)


async def _fetch_espn_match_data(client: httpx.AsyncClient, home: str, away: str) -> Optional[Dict]:
    try:
        query = f"{home} {away}"
        r = await client.get(
            "https://site.web.api.espn.com/apis/search/v2",
            params={"query": query, "limit": 5, "type": "event"},
        )
        if r.status_code != 200:
            return None

        data = r.json()
        event_id = None
        for result in data.get("results", []):
            for item in result.get("contents", []):
                name = item.get("name", "").lower()
                if home.lower() in name and away.lower() in name:
                    event_id = item.get("id")
                    break
            if event_id:
                break

        if not event_id:
            return None

        r2 = await client.get(
            "https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary",
            params={"event": event_id},
        )
        if r2.status_code != 200:
            return None

        summary = r2.json()
        header = summary.get("header", {})
        comps = header.get("competitions", [])
        if not comps:
            return None

        comp = comps[0]
        if comp.get("status", {}).get("type", {}).get("state") != "post":
            return None

        competitors = comp.get("competitors", [])
        if len(competitors) < 2:
            return None

        score_home = "?"
        score_away = "?"

        for c in competitors:
            if c.get("homeAway") == "home":
                score_home = c.get("score", "?")
            elif c.get("homeAway") == "away":
                score_away = c.get("score", "?")

        if score_home == "?" or score_away == "?":
            score_home = competitors[0].get("score", "?")
            score_away = competitors[1].get("score", "?")

        score_str = f"{score_home} - {score_away}"

        events = []
        key_events = summary.get("keyEvents") or []
        for ev in key_events:
            ev_type = (ev.get("type", {}).get("text") or "").lower()
            if "goal" in ev_type or "penalty" in ev_type or "card" in ev_type:
                team_id = ev.get("team", {}).get("id")
                is_home = True
                for c in competitors:
                    if c.get("team", {}).get("id") == team_id:
                        is_home = c.get("homeAway") == "home"
                        break

                clock = ev.get("clock", {}).get("displayValue") or ""
                players = ev.get("participants") or []
                player_name = players[0].get("athlete", {}).get("displayName", "") if players else ""

                icon = "⚽"
                if "penalty" in ev_type: icon = "⚽ (P)"
                elif "red card" in ev_type: icon = "🟥"
                elif "yellow card" in ev_type: icon = "🟨"

                events.append({
                    "team": "home" if is_home else "away",
                    "player": player_name,
                    "minute": clock.replace("'", ""),
                    "icon": icon,
                })

        return {"score": score_str, "events": events}
    except Exception as e:
        print(f"[ESPN] Error fetching data for {home} vs {away}: {e}")
        return None


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


# ---------- Fuente A: rojadirectatvplay.com ----------
async def _roja_get_matches() -> List[Dict]:
    matches: List[Dict] = []
    async with async_playwright() as p:
        browser = await _launch_browser(p)
        context = await _new_context(browser)
        page = await context.new_page()
        try:
            await page.goto(AGENDA_URL_ROJA, wait_until="networkidle", timeout=60000)
            await page.wait_for_selector("#menu li.toggle-submenu", timeout=20000)
        except Exception:
            await browser.close()
            return []

        items = await page.query_selector_all("#menu li.toggle-submenu")
        for li in items:
            try:
                title_el = await li.query_selector("span")
                title = (await title_el.inner_text()).strip() if title_el else ""
                if not title: continue
                time_el = await li.query_selector("time")
                time_str = (await time_el.inner_text()).strip() if time_el else ""
                league = _infer_league(title)

                links = await li.query_selector_all("a.submenu-item")
                servers = []
                for i, link in enumerate(links):
                    href = await link.get_attribute("href")
                    if not href: continue
                    label = (await link.inner_text()).strip() or f"Opción {i+1}"
                    servers.append({"name": label, "embed_url": urljoin(BASE_URL_ROJA, href)})

                if not servers: continue
                matches.append({
                    "title": title, "league": league, "time": time_str,
                    "source": "roja", "match_url": servers[0]["embed_url"], "servers": servers,
                })
            except Exception:
                continue
        await browser.close()
    return matches


# ---------- Fuente B: futbollibretvplus.com ----------
async def _futbollibre_get_matches() -> List[Dict]:
    return await _generic_site_scraper(
        agenda_url=AGENDA_URL_FUTBOLLIBRE,
        base_url=BASE_URL_FUTBOLLIBRE,
        source_name="futbollibre",
        min_title_len=6,
    )


# ---------- Fuente C: tarjetarojatv.eu ----------
async def _tarjetaroja_get_matches() -> List[Dict]:
    return await _generic_site_scraper(
        agenda_url=AGENDA_URL_TARJETAROJA,
        base_url=BASE_URL_TARJETAROJA,
        source_name="tarjetaroja",
        min_title_len=6,
    )


# ---------- Fuente D: futbolvivo.tv ----------
async def _futbolvivo_get_matches() -> List[Dict]:
    return await _generic_site_scraper(
        agenda_url=AGENDA_URL_FUTBOLVIVO,
        base_url=BASE_URL_FUTBOLVIVO,
        source_name="futbolvivo",
        min_title_len=6,
    )


# ---------- Fuente E: pirlotv.la ----------
async def _pirlotv_get_matches() -> List[Dict]:
    return await _generic_site_scraper(
        agenda_url=AGENDA_URL_PIRLOTV,
        base_url=BASE_URL_PIRLOTV,
        source_name="pirlotv",
        min_title_len=4,
    )


# ---------- Fuente F: pirlotvonline.club ----------
async def _pirlotvonline_get_matches() -> List[Dict]:
    return await _generic_site_scraper(
        agenda_url=AGENDA_URL_PIRLOTVONLINE,
        base_url=BASE_URL_PIRLOTVONLINE,
        source_name="pirlotvonline",
        min_title_len=4,
    )


# ---------- Fuente G: pirlotvv.org ----------
async def _pirlotvv_get_matches() -> List[Dict]:
    return await _generic_site_scraper(
        agenda_url=AGENDA_URL_PIRLOTVV,
        base_url=BASE_URL_PIRLOTVV,
        source_name="pirlotvv",
        min_title_len=4,
    )


# ---------- Fuente H: librefutbol.vip ----------
async def _librefutbol_get_matches() -> List[Dict]:
    return await _generic_site_scraper(
        agenda_url=AGENDA_URL_LIBREFUTBOL,
        base_url=BASE_URL_LIBREFUTBOL,
        source_name="librefutbol",
        min_title_len=4,
    )


# ============================================================
# Scraper genérico reutilizable
# ============================================================
async def _generic_site_scraper(
    agenda_url: str,
    base_url: str,
    source_name: str,
    min_title_len: int = 5,
    link_pattern: Optional[str] = None,
) -> List[Dict]:
    """
    Scraper genérico que recorre la home/agenda del sitio y extrae
    anclas que parezcan partidos/eventos/canales, junto con su título
    y, si existe, un <time> hermano cercano.
    """
    if link_pattern is None:
        link_pattern = DEFAULT_LINK_PATTERN

    matches: List[Dict] = []

    async with async_playwright() as p:
        browser = await _launch_browser(p)
        context = await _new_context(browser)
        page = await context.new_page()
        try:
            await page.goto(agenda_url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(3500)
        except Exception:
            await browser.close()
            return []

        anchors = await page.query_selector_all("a")
        for a in anchors:
            try:
                href = await a.get_attribute("href") or ""
                if not href or href.startswith(("javascript:", "#", "mailto:")):
                    continue
                if not re.search(link_pattern, href, re.I):
                    continue

                text = (await a.inner_text()).strip()
                if len(text) < min_title_len:
                    continue
                # Evitar enlaces de navegación típicos
                if text.lower() in ("inicio", "home", "menu", "contacto", "acerca", "privacidad", "dmca", "aviso legal"):
                    continue

                # Intentar encontrar el <time> o clase .time/.hora cercana
                time_str = ""
                try:
                    parent_handle = await a.evaluate_handle(
                        "el => el.closest('li, article, .event, .match, .item, tr, .card, .evento, .partido')"
                    )
                    parent_el = parent_handle.as_element() if parent_handle else None
                    if parent_el:
                        time_el = await parent_el.query_selector("time, .time, .hora, .hour")
                        if time_el:
                            time_str = (await time_el.inner_text()).strip()
                except Exception:
                    pass

                league = _infer_league(text)
                full_url = urljoin(base_url, href)

                matches.append({
                    "title": text,
                    "league": league,
                    "time": time_str,
                    "source": source_name,
                    "match_url": full_url,
                    "servers": [{"name": "Servidor principal", "embed_url": full_url}],
                })
            except Exception:
                continue

        await browser.close()

    # Deduplicar por (título, url)
    seen = set()
    unique: List[Dict] = []
    for m in matches:
        key = (m["title"].lower(), m["match_url"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(m)
    return unique


# ============================================================
# 2) Resolución de servidores
# ============================================================
async def resolve_servers(servers: List[Dict]) -> List[Dict]:
    if not servers: return []
    results = []
    async with async_playwright() as p:
        browser = await _launch_browser(p)
        context = await _new_context(browser)
        for i, srv in enumerate(servers):
            name = srv.get("name", f"Servidor {i+1}")
            embed_url = srv.get("embed_url", "")
            print(f"[RESOLVE] Probando servidor {i+1}/{len(servers)}: {name}")
            result = await _resolve_one_server(context, name, embed_url)
            results.append(result)
        await browser.close()
    return results


async def _resolve_one_server(context: BrowserContext, name: str, embed_url: str) -> Dict:
    base = {"name": name, "embed_url": embed_url, "stream_url": None, "working": False, "language": "unknown", "reason": ""}
    if not embed_url:
        base["reason"] = "sin url de embed"
        return base

    captured = []
    page = None
    try:
        page = await context.new_page()
        async def on_response(response):
            url = response.url
            if ".m3u8" in url and response.status == 200 and url not in captured:
                captured.append(url)
        page.on("response", on_response)
        try:
            await page.goto(embed_url, wait_until="domcontentloaded", timeout=20000)
        except Exception:
            pass

        for attempt in range(15):
            if captured: break
            try:
                for frame in page.frames:
                    for sel in (".vjs-big-play-button", ".jw-icon-playback", ".play-button", "button[aria-label*='lay']", "button[aria-label*='Reproducir']", "button:has-text('Play')", "button:has-text('Ver')", "video"):
                        try:
                            el = await frame.query_selector(sel)
                            if el:
                                await el.click(timeout=800, force=True)
                                break
                        except Exception:
                            continue
            except Exception:
                pass
            await page.wait_for_timeout(1000)
    except Exception as e:
        base["reason"] = f"error abriendo embed: {e}"
        if page: await page.close()
        return base

    if not captured:
        base["reason"] = "no se capturó ningún .m3u8"
        if page: await page.close()
        return base

    m3u8_url = captured[0]
    base["stream_url"] = m3u8_url
    verify = await verify_stream(m3u8_url, name_hint=name)
    base.update(verify)
    if page: await page.close()
    return base


# ============================================================
# 3) Verificación de stream + idioma
# ============================================================
async def verify_stream(m3u8_url: str, name_hint: str = "") -> Dict:
    result = {"working": False, "language": "unknown", "reason": ""}
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers=USER_AGENT_HEADERS) as client:
            r = await client.get(m3u8_url)
            if r.status_code != 200:
                result["reason"] = f"manifiesto HTTP {r.status_code}"
                return result
            manifest = r.text
            lang = _detect_language_in_manifest(manifest)
            variant_url = _first_variant(manifest, m3u8_url)
            if variant_url:
                r2 = await client.get(variant_url)
                if r2.status_code == 200:
                    manifest = r2.text
            first_seg = _first_segment(manifest, m3u8_url)
            if first_seg:
                r3 = await client.get(first_seg)
                if r3.status_code != 200:
                    result["reason"] = f"segmento HTTP {r3.status_code}"
                    return result
                if len(r3.content) < 1000:
                    result["reason"] = "segmento demasiado pequeño"
                    return result
            result["working"] = True
    except Exception as e:
        result["reason"] = f"error httpx: {e}"
        return result
    if lang: result["language"] = lang
    else: result["language"] = _detect_language_from_hint(name_hint, m3u8_url)
    return result

def _detect_language_in_manifest(manifest: str) -> Optional[str]:
    matches = re.findall(r'#EXT-X-MEDIA:[^\n]*', manifest)
    for line in matches:
        if re.search(r'LANGUAGE="(spa|es|es-ES|es-MX|es-AR|es-CO|es-PE|es-CL)"', line, re.I): return "es"
        if re.search(r'NAME="(Español|Espanol|Spanish|Latino)"', line, re.I): return "es"
        if re.search(r'LANGUAGE="(eng|en|en-US|en-GB)"', line, re.I): return "en"
    return None

def _detect_language_from_hint(name: str, url: str) -> str:
    text = f"{name} {url}".lower()
    for hint in ENGLISH_HINTS:
        if hint in text: return "en"
    for hint in SPANISH_HINTS:
        if hint in text: return "es"
    return "es"

def _first_variant(manifest: str, base_url: str) -> Optional[str]:
    if "#EXT-X-STREAM-INF" not in manifest: return None
    lines = manifest.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF"):
            for j in range(i + 1, len(lines)):
                nxt = lines[j].strip()
                if nxt and not nxt.startswith("#"):
                    return urljoin(base_url, nxt)
    return None

def _first_segment(manifest: str, base_url: str) -> Optional[str]:
    lines = manifest.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("#EXTINF"):
            for j in range(i + 1, len(lines)):
                nxt = lines[j].strip()
                if nxt and not nxt.startswith("#"):
                    return urljoin(base_url, nxt)
    return None


async def get_matches_with_servers(match_url: str, servers: List[Dict]) -> List[Dict]:
    resolved = await resolve_servers(servers)
    resolved.sort(key=lambda s: (0 if s["working"] and s["language"] == "es" else 1 if s["working"] else 2))
    return resolved


# ============================================================
# Helpers internos
# ============================================================
async def _launch_browser(p) -> Browser:
    return await p.chromium.launch(headless=HEADLESS, args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"])

async def _new_context(browser: Browser) -> BrowserContext:
    ctx = await browser.new_context(user_agent=UA, viewport={"width": 1366, "height": 768}, locale="es-ES", ignore_https_errors=True)
    await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
    return ctx

def _infer_league(title: str) -> str:
    UPPER = title.upper()
    for kw in ["LALIGA", "PREMIER", "SERIE A", "BUNDESLIGA", "LIGUE 1", "CHAMPIONS", "EUROPA", "CONFERENCE", "LIGA MX", "MLS", "BRASILEIRÃO", "BRASILEIRAO", "LIGA 1", "COPA", "LIBERTADORES", "SUDAMERICANA", "EFL CUP", "FA CUP", "COPA DEL REY", "SUPERCOPA", "MUNDIAL", "EUROCOPA", "AMISTOSO", "NBA", "MLB"]:
        if kw in UPPER: return kw
    return ""