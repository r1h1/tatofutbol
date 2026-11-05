# backend/scraper.py
from __future__ import annotations
import asyncio, os, re, time
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin
import httpx
from playwright.async_api import async_playwright, Browser, BrowserContext
from .sports_config import get_sources, get_sport_config, CROSS_KEYWORDS

HEADLESS = os.environ.get("HEADLESS", "1") == "1"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

SPANISH_HINTS = ("español","espanol","spanish","dsports","espn","tnt","fox sports","tyc","movistar","ligamax","win sports","tudn","telemundo","goltv","directv","star+","star plus","latino","sudamerica","argentina","mexico","peru","colombia","chile","uruguay","paraguay","bolivia","ecuador","venezuela")
ENGLISH_HINTS = ("english","ingles","inglés","sky sports","bt sport","nbc","cbs","us only","usa","uk only")
USER_AGENT_HEADERS = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "es-ES,es;q=0.9", "Accept-Encoding": "identity"}
DEFAULT_LINK_PATTERN = r"(partido|evento|en-?vivo|en-vivo|online|live|canal|channel|stream|ver|watch|match|futbol|deporte|game|fight|pelea|combate|boxeo|boxing|ufc|mma|nba|nfl|mlb|nhl|tennis|motogp|formula|schedule|game|games)"
ESPN_PATHS = {"football":"soccer/all","basketball":"basketball/nba","american_football":"football/nfl","baseball":"baseball/mlb","hockey":"hockey/nhl","mma":"mma/ufc"}

NAVIGATION_BLACKLIST = ("last week","current week","next week","this week","hours from now","minutes from now","days from now","follow @","join the","join our","telegram","discord","subscribe","newsletter","standings","advertise","advertising","publicidad","privacy policy","privacidad","terms of service","dmca","aviso legal","disclaimer","websites go down","our links stay live","best free similar alternatives","streaming guide","shut down, what happened","shut down in 202","reddit nba streams","reddit nfl streams","reddit nhl streams","reddit mlb streams","reddit mma streams","reddit ufc streams")

NBA_TEAMS = {"hawks","celtics","nets","hornets","bulls","cavaliers","mavericks","nuggets","pistons","warriors","rockets","pacers","clippers","lakers","grizzlies","heat","bucks","timberwolves","pelicans","knicks","thunder","magic","76ers","suns","trail blazers","kings","spurs","raptors","jazz","wizards"}
NHL_TEAMS = {"bruins","sabres","flames","hurricanes","blackhawks","avalanche","blue jackets","stars","red wings","oilers","panthers","kings","wild","canadiens","predators","devils","islanders","rangers","senators","flyers","penguins","sharks","kraken","blues","lightning","maple leafs","canucks","golden knights","capitals","jets","ducks","mammoth"}
NFL_TEAMS = {"cardinals","falcons","ravens","bills","bears","bengals","browns","cowboys","broncos","lions","packers","texans","colts","jaguars","chiefs","raiders","chargers","rams","dolphins","vikings","patriots","saints","giants","jets","eagles","steelers","49ers","seahawks","buccaneers","titans","commanders"}
MLB_TEAMS = {"diamondbacks","braves","orioles","red sox","cubs","white sox","reds","guardians","rockies","tigers","astros","royals","angels","dodgers","marlins","brewers","twins","mets","yankees","athletics","phillies","pirates","padres","giants","mariners","rays","blue jays","nationals"}

MATCH_SEPARATOR_RE = re.compile(r"\s+(?:vs\.?|v\.?|@|-|–|—|x)\s+", re.IGNORECASE)
TIME_RE = re.compile(r"^\s*\d{1,2}:\d{2}\s*$")

# ── Palabras que identifican basketball ──
# CAMBIO: añadido "ncaa football" a pedido del usuario. Los partidos
# universitarios que no sean soccer se clasifican como basketball
# (el usuario lo pidió así para los femeninos de NCAA).
BASKETBALL_KEYWORDS = (
    "nba", "wnba",
    "euroleague", "eurobasket",
    "march madness",
    "basketball", "baloncesto",
    "ncaa women's", "ncaa men's",
    "ncaa womens", "ncaa mens",
    "ncaa basketball",
    "ncaa football",
)

# ── Palabras que identifican NHL (hockey) ──
NHL_KEYWORDS = (
    "nhl",
    "stanley cup",
    "nhl network",
)

# ── Cachés de resultados crudos por deporte ──
_FOOTBALL_CACHE: Dict = {"data": [], "ts": 0.0}
_BASKETBALL_CACHE: Dict = {"data": [], "ts": 0.0}
_SOURCE_CACHE_TTL = 120


def _classify_sport(title: str) -> str:
    """
    Clasifica un partido por su título.

    Orden de comprobación:
      1. Si contiene "soccer" -> football (excepción explícita,
         para que "NCAA Women's Soccer" no acabe en basketball).
      2. Si contiene NHL_KEYWORDS -> nhl.
      3. Si contiene BASKETBALL_KEYWORDS -> basketball.
      4. Caso contrario -> football.
    """
    text = (title or "").lower()

    if "soccer" in text:
        return "football"

    for kw in NHL_KEYWORDS:
        if re.search(r"\b" + re.escape(kw) + r"\b", text):
            return "nhl"

    for kw in BASKETBALL_KEYWORDS:
        if any(c in kw for c in (" ", "'", "-")):
            if kw in text:
                return "basketball"
        else:
            if re.search(r"\b" + re.escape(kw) + r"\b", text):
                return "basketball"

    return "football"


async def _scrape_sport_sources(sport_key: str) -> List[Dict]:
    sources = get_sources(sport_key)
    if not sources:
        print(f"[SCRAPER:{sport_key}] Sin fuentes configuradas.")
        return []

    tasks = []
    for src in sources:
        name = src["name"]
        if src.get("source_type") == "custom":
            tasks.append(_roja_get_matches(sport_key, src))
        else:
            tasks.append(_generic_site_scraper(
                agenda_url=src["agenda_url"],
                base_url=src["base_url"],
                source_name=name,
                min_title_len=src.get("min_title_len", 5),
                sport_key=sport_key,
            ))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    matches = []
    for i, r in enumerate(results):
        if isinstance(r, list):
            matches.extend(r)
        else:
            src_name = sources[i]["name"] if i < len(sources) else f"fuente_{i}"
            print(f"[SCRAPER:{sport_key}:{src_name}] FALLÓ: {r!r}")

    return matches


async def _get_football_raw() -> List[Dict]:
    now = time.time()
    if _FOOTBALL_CACHE["data"] and (now - _FOOTBALL_CACHE["ts"] < _SOURCE_CACHE_TTL):
        print(f"[SCRAPER:football] Cache HIT ({len(_FOOTBALL_CACHE['data'])} crudos)")
        return _FOOTBALL_CACHE["data"]
    data = await _scrape_sport_sources("football")
    if data:
        _FOOTBALL_CACHE["data"] = data
        _FOOTBALL_CACHE["ts"] = now
    return data


async def _get_basketball_raw() -> List[Dict]:
    now = time.time()
    if _BASKETBALL_CACHE["data"] and (now - _BASKETBALL_CACHE["ts"] < _SOURCE_CACHE_TTL):
        print(f"[SCRAPER:basketball] Cache HIT ({len(_BASKETBALL_CACHE['data'])} crudos)")
        return _BASKETBALL_CACHE["data"]
    data = await _scrape_sport_sources("basketball")
    if data:
        _BASKETBALL_CACHE["data"] = data
        _BASKETBALL_CACHE["ts"] = now
    return data


async def get_match_list(sport_key: str = "football") -> List[Dict]:
    """
    Lista de partidos YA clasificada para el deporte solicitado.

    - football:    fuentes de fútbol, solo los que clasifican como football.
    - basketball:  fuentes de basketball + fútbol, solo basketball.
    - nhl:         fuentes de fútbol, solo los que clasifican como nhl.
    - otros:       solo sus propias fuentes.
    """
    sport_key = (sport_key or "football").strip().lower()

    if sport_key == "nhl":
        # NHL aparece mezclado en fuentes de fútbol
        raw = await _get_football_raw()
    elif sport_key == "basketball":
        fb_raw, bb_raw = await asyncio.gather(
            _get_football_raw(),
            _get_basketball_raw(),
        )
        raw = list(bb_raw) + list(fb_raw)
        print(f"[SCRAPER:basketball] Fuentes crudas: {len(bb_raw)} (basketball) + {len(fb_raw)} (football)")
    elif sport_key == "football":
        raw = await _get_football_raw()
    else:
        raw = await _scrape_sport_sources(sport_key)

    seen = set()
    unique = []
    for m in raw:
        key = (m.get("title", "").lower(), m.get("time", ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(m)

    matches: List[Dict] = []
    excluded = 0
    for m in unique:
        classified = _classify_sport(m.get("title", ""))
        if sport_key == "basketball":
            if classified == "basketball":
                matches.append(m)
            else:
                excluded += 1
        elif sport_key == "nhl":
            if classified == "nhl":
                matches.append(m)
            else:
                excluded += 1
        else:
            # football (y cualquier otro): solo lo que sea football
            if classified == "football":
                matches.append(m)
            else:
                excluded += 1

    await _add_scores_and_events_to_matches(matches, sport_key)
    for m in matches:
        m.setdefault("sport", sport_key)

    print(f"[SCRAPER:{sport_key}] Total: {len(matches)} partidos (excluidos {excluded} por clasificación).")
    return matches


def _is_navigation_junk(text: str) -> bool:
    if not text: return True
    t = text.lower().strip()
    if len(t) <= 3: return True
    for junk in NAVIGATION_BLACKLIST:
        if junk in t: return True
    if len(t) > 80 and not MATCH_SEPARATOR_RE.search(t): return True
    return False


def _has_cross_domain_keyword(text: str, league: str, sport_key: str) -> bool:
    if sport_key == "football": return False
    combined = f"{text} {league}".lower()
    for kw in CROSS_KEYWORDS.get(sport_key, ()):
        if re.search(r"\b" + re.escape(kw) + r"\b", combined):
            return True
    return False


def _has_team_separator(text: str) -> bool:
    return bool(MATCH_SEPARATOR_RE.search(text))


def _looks_like_teams(text: str) -> bool:
    words = text.strip().split()
    if len(words) < 2 or len(text.strip()) < 6: return False
    stopwords = {"the","vs","at","in","on","for","of","tv","live","hd","en","por"}
    capitalized = [w for w in words if w and w[0].isupper() and w.lower() not in stopwords]
    return len(capitalized) >= 2


def _is_valid_match_title(text: str, league: str, sport_key: str, time_str: str) -> bool:
    if not text or _is_navigation_junk(text): return False
    if sport_key == "football": return True
    if _has_cross_domain_keyword(text, league, sport_key): return False
    if _has_team_separator(text): return True
    generic = ("nba","nhl","mlb","nfl","ufc","mma","basketball","hockey","baseball","boxing","f1","formula 1")
    if _looks_like_teams(text):
        if text.strip().lower() in generic: return False
        return True
    if time_str and TIME_RE.match(time_str) and len(text.strip()) >= 6:
        if text.strip().lower() in generic: return False
        return True
    return False


async def _add_scores_and_events_to_matches(matches: List[Dict], sport_key: str = "football") -> None:
    espn_path = ESPN_PATHS.get(sport_key)
    if not espn_path: return
    sem = asyncio.Semaphore(5)
    async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": UA}) as client:
        async def process(match):
            if match.get("status") != "recent": return
            home, away = _split_title(match.get("title",""))
            if not home or not away: return
            async with sem:
                data = await _fetch_espn_match_data(client, home, away, espn_path)
                if data: match["score"] = data["score"]; match["events"] = data["events"]
        await asyncio.gather(*(process(m) for m in matches), return_exceptions=True)


async def _fetch_espn_match_data(client, home, away, espn_path) -> Optional[Dict]:
    try:
        r = await client.get("https://site.web.api.espn.com/apis/search/v2", params={"query": f"{home} {away}", "limit": 5, "type": "event"})
        if r.status_code != 200: return None
        data = r.json(); event_id = None
        for result in data.get("results", []):
            for item in result.get("contents", []):
                name = item.get("name","").lower()
                if home.lower() in name and away.lower() in name: event_id = item.get("id"); break
            if event_id: break
        if not event_id: return None
        r2 = await client.get(f"https://site.api.espn.com/apis/site/v2/sports/{espn_path}/summary", params={"event": event_id})
        if r2.status_code != 200: return None
        summary = r2.json(); comps = summary.get("header",{}).get("competitions",[])
        if not comps: return None
        comp = comps[0]
        if comp.get("status",{}).get("type",{}).get("state") != "post": return None
        competitors = comp.get("competitors",[])
        if len(competitors) < 2: return None
        sh, sa = "?", "?"
        for c in competitors:
            if c.get("homeAway") == "home": sh = c.get("score","?")
            elif c.get("homeAway") == "away": sa = c.get("score","?")
        if sh == "?" or sa == "?": sh, sa = competitors[0].get("score","?"), competitors[1].get("score","?")
        events = []
        for ev in summary.get("keyEvents") or []:
            et = (ev.get("type",{}).get("text","") or "").lower()
            if not any(k in et for k in ("goal","penalty","card","basket","three","touchdown","home run","strikeout","knockdown")): continue
            tid = ev.get("team",{}).get("id"); is_home = True
            for c in competitors:
                if c.get("team",{}).get("id") == tid: is_home = c.get("homeAway") == "home"; break
            clock = ev.get("clock",{}).get("displayValue","") or ""
            players = ev.get("participants",[]) or []
            pname = players[0].get("athlete",{}).get("displayName","") if players else ""
            icon = "goal"
            if "penalty" in et: icon = "penalty_goal"
            elif "red card" in et: icon = "red_card"
            elif "yellow card" in et: icon = "yellow_card"
            elif "three" in et: icon = "three_pointer"
            elif "basket" in et: icon = "basket"
            elif "touchdown" in et: icon = "touchdown"
            elif "home run" in et: icon = "home_run"
            elif "strikeout" in et: icon = "strikeout"
            elif "knockdown" in et: icon = "knockdown"
            events.append({"team": "home" if is_home else "away", "player": pname, "minute": clock.replace("'",""), "icon": icon})
        return {"score": f"{sh} - {sa}", "events": events}
    except: return None


def _split_title(title: str) -> Tuple[str, str]:
    t = (title or "").strip()
    if ":" in t and len(t.split(":",1)[0]) < 40: t = t.split(":",1)[1].strip()
    for sep in (" vs. ", " vs ", " v ", " @ ", " - ", " – ", " x "):
        if sep.lower() in t.lower():
            parts = re.split(re.escape(sep), t, maxsplit=1, flags=re.I)
            if len(parts) == 2:
                a, b = parts[0].strip(), parts[1].strip()
                if a and b: return a, b
    return t, ""


async def _roja_get_matches(sport_key: str = "football", src_cfg: Optional[Dict] = None) -> List[Dict]:
    if not src_cfg: return []
    base_url = src_cfg["base_url"]; agenda_url = src_cfg["agenda_url"]
    matches = []
    async with async_playwright() as p:
        browser = await _launch_browser(p); context = await _new_context(browser); page = await context.new_page()
        try:
            await page.goto(agenda_url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(4000)
        except Exception as e:
            print(f"[SCRAPER:{sport_key}:roja] goto FALLÓ: {str(e)[:150]}")
            await browser.close(); return []
        items = await page.query_selector_all("#menu li.toggle-submenu")
        if not items:
            await browser.close()
            return await _generic_site_scraper(agenda_url, base_url, "roja_fallback", 4, sport_key=sport_key)
        for li in items:
            try:
                tel = await li.query_selector("span"); title = (await tel.inner_text()).strip() if tel else ""
                if not title or _is_navigation_junk(title): continue
                time_el = await li.query_selector("time"); time_str = (await time_el.inner_text()).strip() if time_el else ""
                league = _infer_league(title)
                if not _is_valid_match_title(title, league, sport_key, time_str): continue
                links = await li.query_selector_all("a.submenu-item"); servers = []
                for i, link in enumerate(links):
                    href = await link.get_attribute("href")
                    if not href: continue
                    label = (await link.inner_text()).strip() or f"Opción {i+1}"
                    servers.append({"name": label, "embed_url": urljoin(base_url, href)})
                if not servers: continue
                matches.append({"title": title, "league": league, "time": time_str, "source": "roja", "match_url": servers[0]["embed_url"], "servers": servers})
            except: continue
        await browser.close()
    return matches


async def _generic_site_scraper(agenda_url, base_url, source_name, min_title_len=5, link_pattern=None, sport_key="football") -> List[Dict]:
    if link_pattern is None: link_pattern = DEFAULT_LINK_PATTERN
    matches = []; total_anchors = rejected_junk = rejected_cross = 0
    async with async_playwright() as p:
        browser = await _launch_browser(p); context = await _new_context(browser); page = await context.new_page()
        try:
            await page.goto(agenda_url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(5000)
        except Exception as e:
            print(f"[SCRAPER:{sport_key}:{source_name}] ERROR: {str(e)[:80]}")
            await browser.close(); return []
        anchors = await page.query_selector_all("a"); total_anchors = len(anchors)
        for a in anchors:
            try:
                href = await a.get_attribute("href") or ""
                if not href or href.startswith(("javascript:","#","mailto:")): continue
                if not re.search(link_pattern, href, re.I): continue
                text = (await a.inner_text()).strip()
                if len(text) < min_title_len: continue
                league = _infer_league(text)
                time_str = ""
                try:
                    ph = await a.evaluate_handle("el => el.closest('li, article, .event, .match, .item, tr, .card, .evento, .partido')")
                    pel = ph.as_element() if ph else None
                    if pel:
                        te = await pel.query_selector("time, .time, .hora, .hour")
                        if te: time_str = (await te.inner_text()).strip()
                except: pass
                if _is_navigation_junk(text): rejected_junk += 1; continue
                if not _is_valid_match_title(text, league, sport_key, time_str): rejected_cross += 1; continue
                full_url = urljoin(base_url, href)
                matches.append({"title": text, "league": league, "time": time_str, "source": source_name, "match_url": full_url, "servers": [{"name": "Servidor principal", "embed_url": full_url}]})
            except: continue
        await browser.close()
    seen = set(); unique = []
    for m in matches:
        key = (m["title"].lower(), m["match_url"])
        if key in seen: continue
        seen.add(key); unique.append(m)
    print(f"[SCRAPER:{sport_key}:{source_name}] anchors={total_anchors} aceptados={len(unique)} junk={rejected_junk} cross={rejected_cross}")
    return unique


async def resolve_servers(servers: List[Dict]) -> List[Dict]:
    if not servers: return []
    results = []
    async with async_playwright() as p:
        browser = await _launch_browser(p); context = await _new_context(browser)
        for i, srv in enumerate(servers):
            name = srv.get("name", f"Servidor {i+1}"); embed_url = srv.get("embed_url","")
            print(f"[RESOLVE] {i+1}/{len(servers)}: {name}")
            results.append(await _resolve_one_server(context, name, embed_url))
        await browser.close()
    return results


async def _resolve_one_server(context, name, embed_url) -> Dict:
    base = {"name": name, "embed_url": embed_url, "stream_url": None, "working": False, "language": "unknown", "reason": ""}
    if not embed_url: base["reason"] = "sin url"; return base
    captured = []; page = None
    try:
        page = await context.new_page()
        async def on_response(response):
            url = response.url
            if ".m3u8" in url and response.status == 200 and url not in captured: captured.append(url)
        page.on("response", on_response)
        try: await page.goto(embed_url, wait_until="domcontentloaded", timeout=20000)
        except: pass
        for _ in range(15):
            if captured: break
            try:
                for frame in page.frames:
                    for sel in (".vjs-big-play-button",".jw-icon-playback",".play-button","button[aria-label*='lay']","button[aria-label*='Reproducir']","button:has-text('Play')","button:has-text('Ver')","video"):
                        try:
                            el = await frame.query_selector(sel)
                            if el: await el.click(timeout=800, force=True); break
                        except: continue
            except: pass
            await page.wait_for_timeout(1000)
    except Exception as e:
        base["reason"] = f"error abriendo embed: {e}"
        if page: await page.close()
        return base
    if not captured:
        base["reason"] = "no se capturó .m3u8"
        if page: await page.close()
        return base
    base["stream_url"] = captured[0]
    verify = await verify_stream(captured[0], name_hint=name)
    base.update(verify)
    if page: await page.close()
    return base


async def verify_stream(m3u8_url, name_hint="") -> Dict:
    result = {"working": False, "language": "unknown", "reason": ""}
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers=USER_AGENT_HEADERS) as client:
            r = await client.get(m3u8_url)
            if r.status_code != 200: result["reason"] = f"HTTP {r.status_code}"; return result
            manifest = r.text; lang = _detect_lang(manifest)
            vurl = _first_variant(manifest, m3u8_url)
            if vurl:
                r2 = await client.get(vurl)
                if r2.status_code == 200: manifest = r2.text
            fseg = _first_segment(manifest, m3u8_url)
            if fseg:
                r3 = await client.get(fseg)
                if r3.status_code != 200: result["reason"] = f"seg HTTP {r3.status_code}"; return result
                if len(r3.content) < 1000: result["reason"] = "seg pequeño"; return result
            result["working"] = True
    except Exception as e: result["reason"] = f"httpx: {e}"; return result
    result["language"] = lang or _detect_lang_hint(name_hint, m3u8_url)
    return result


def _detect_lang(manifest):
    for line in re.findall(r'#EXT-X-MEDIA:[^\n]*', manifest):
        if re.search(r'LANGUAGE="(spa|es|es-ES|es-MX|es-AR|es-CO|es-PE|es-CL)"', line, re.I): return "es"
        if re.search(r'NAME="(Español|Espanol|Spanish|Latino)"', line, re.I): return "es"
        if re.search(r'LANGUAGE="(eng|en|en-US|en-GB)"', line, re.I): return "en"
    return None


def _detect_lang_hint(name, url):
    text = f"{name} {url}".lower()
    for h in ENGLISH_HINTS:
        if h in text: return "en"
    for h in SPANISH_HINTS:
        if h in text: return "es"
    return "es"


def _first_variant(manifest, base_url):
    if "#EXT-X-STREAM-INF" not in manifest: return None
    lines = manifest.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF"):
            for j in range(i+1, len(lines)):
                nxt = lines[j].strip()
                if nxt and not nxt.startswith("#"): return urljoin(base_url, nxt)
    return None


def _first_segment(manifest, base_url):
    lines = manifest.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("#EXTINF"):
            for j in range(i+1, len(lines)):
                nxt = lines[j].strip()
                if nxt and not nxt.startswith("#"): return urljoin(base_url, nxt)
    return None


async def get_matches_with_servers(match_url, servers):
    resolved = await resolve_servers(servers)
    resolved.sort(key=lambda s: (0 if s["working"] and s["language"] == "es" else 1 if s["working"] else 2))
    return resolved


async def _launch_browser(p):
    return await p.chromium.launch(headless=HEADLESS, args=["--disable-blink-features=AutomationControlled","--no-sandbox","--disable-dev-shm-usage","--mute-audio"])


async def _new_context(browser):
    ctx = await browser.new_context(user_agent=UA, viewport={"width":1366,"height":768}, locale="es-ES", ignore_https_errors=True)
    await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
    return ctx


def _infer_league(title):
    UPPER = title.upper()
    for kw in ["LALIGA","PREMIER","SERIE A","BUNDESLIGA","LIGUE 1","CHAMPIONS","EUROPA","CONFERENCE","LIGA MX","MLS","BRASILEIRÃO","BRASILEIRAO","LIGA 1","COPA","LIBERTADORES","SUDAMERICANA","EFL CUP","FA CUP","COPA DEL REY","SUPERCOPA","MUNDIAL","EUROCOPA","AMISTOSO","NBA","WNBA","EUROLEAGUE","EUROLIGA","NCAA","MARCH MADNESS","UFC","BELLATOR","PFL","BOXEO","BOXING","WBC","WBA","IBF","WBO","ATP","WTA","ROLAND GARROS","WIMBLEDON","US OPEN","AUSTRALIAN OPEN","F1","MOTOGP","NASCAR","INDYCAR","FORMULA 1","NFL","NCAAF","SUPER BOWL","MLB","WORLD SERIES","NHL","STANLEY CUP"]:
        if kw in UPPER: return kw
    return ""