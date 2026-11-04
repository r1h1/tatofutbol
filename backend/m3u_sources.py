# backend/m3u_sources.py
"""Canales M3U8 en vivo desde listas públicas + canales manuales garantizados."""
from __future__ import annotations
import re, time
from typing import Dict, List, Optional
import httpx

IPTV_ORG_SPORTS_URL = "https://iptv-org.github.io/iptv/categories/sports.m3u"
FREE_TV_URL = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8"

CACHE_TTL = 3600
_cache: Dict = {"data": [], "ts": 0, "error": None}

SPORT_KEYWORDS: Dict[str, List[str]] = {
    "football": ["fox deportes", "tyc sports", "espn deportes", "tudn", "movistar deportes", "dazn", "laliga", "premier league", "gol tv", "goltv", "beinsports", "bein sports", "sky sports", "fox sports", "dsports", "directv sports", "win sports", "telefe", "espn", "espn2", "espn3", "espn4", "espn5", "espn extra", "fox sports 1", "fox sports 2", "tnt sports", "eurosport", "dazn 1", "dazn 2", "dazn 3", "tyc", "rcn", "caracol", "ligamax", "espn premium", "star+", "star plus", "paramount+", "movistar plus", "sportv", "sportv2", "sportv3", "band sports", "espn brasil", "fox sports brasil", "tnt sports brasil", "champions", "europa league", "libertadores", "sudamericana", "copa america", "mundial", "world cup", "fifa"],
    "basketball": ["nba tv", "nba", "euroleague", "eurobasket", "ncaa", "march madness", "espn", "espn2", "espn3", "tnt", "abc", "movistar deportes", "fox deportes", "dsports", "directv sports", "tudn", "dazn nba", "tnt sports", "space", "combate", "nba league pass", "basketball", "basket", "baloncesto"],
    "hockey": ["nhl", "nhl network", "sportsnet", "tsn", "tsn 1", "tsn 2", "tsn 3", "tsn 4", "tsn 5", "rds", "viaplay", "hockey"],
    "baseball": ["mlb", "mlb network", "espn", "fox sports", "tbs", "dazn mlb", "tyc sports", "dsports", "directv sports", "baseball", "beisbol", "mlb tv"],
    "mma": ["ufc", "ufc fight pass", "fight pass", "fite", "combate", "dazn ufc", "espn+", "tnt sports ufc", "bellator", "pfl", "one championship", "ufc latinoamerica", "ufc mexico", "ufc brasil", "mma", "pelea", "boxing", "boxeo", "wwe", "aew"],
}

# Canales manuales garantizados (funcionan independientemente de iptv-org)
MANUAL_CHANNELS: Dict[str, List[Dict]] = {
    "football": [
        {"name": "ESPN", "logo": "", "url": "https://101.mipsplayer.net:8688/adfree/espn2hdd/playlist.m3u8?id=269635&pk=bfc7fe314d587e6431467746542de5799b3bc0ea3227b29788b2fb09c723c34d", "sport": "football", "source": "manual"},
        {"name": "FOX Action", "logo": "", "url": "http://live.lcdn.claro.net.co/Content/hls/Live/Channel(FOXACTION_HD)/Stream(01)/index.m3u8", "sport": "football", "source": "manual"},
        {"name": "ESPN Deportes", "logo": "", "url": "http://style.kastream.biz:8081/edge/verdc23b65caee503b9e3c9096c1f3cbbcc/chunks.m3u8?nimblesessionid=799898&wmsAuthSign=c2VydmVyX3Rva2VuaF92YWx1ZT1HajdDVUwvMHRMZWhxNWNNSNGp1SGt3PT0mdmFsaW5dGVzPTEyMA==", "sport": "football", "source": "manual"},
    ],
    "basketball": [
        {"name": "ESPN", "logo": "", "url": "https://101.mipsplayer.net:8688/adfree/espn2hdd/playlist.m3u8?id=269635&pk=bfc7fe314d587e6431467746542de5799b3bc0ea3227b29788b2fb09c723c34d", "sport": "basketball", "source": "manual"},
    ],
    "hockey": [], "baseball": [], "mma": [],
}


async def _download_m3u(url: str, timeout: float = 20.0) -> str:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.text


def _parse_m3u(text: str) -> List[Dict]:
    channels, current = [], {}
    for line in text.splitlines():
        line = line.strip()
        if not line: continue
        if line.startswith("#EXTINF:"):
            current = {"name": "", "logo": "", "group": "", "url": "", "id": ""}
            if "," in line:
                attrs, name = line.rsplit(",", 1)
                current["name"] = name.strip()
                m = re.search(r'tvg-logo="([^"]*)"', attrs)
                if m: current["logo"] = m.group(1)
                m = re.search(r'group-title="([^"]*)"', attrs)
                if m: current["group"] = m.group(1)
                m = re.search(r'tvg-id="([^"]*)"', attrs)
                if m: current["id"] = m.group(1)
        elif line.startswith("#"): continue
        elif current:
            current["url"] = line
            if current.get("name") and current.get("url"):
                channels.append(current)
            current = {}
    return channels


def _classify(channel: Dict) -> Optional[str]:
    text = f"{channel.get('name','')} {channel.get('group','')} {channel.get('id','')}".lower()
    for sport, kws in SPORT_KEYWORDS.items():
        for kw in kws:
            if kw in text: return sport
    return None


async def get_channels_for_sport(sport: str, force: bool = False) -> List[Dict]:
    now = time.time()
    if not force and _cache["data"] and (now - _cache["ts"]) < CACHE_TTL:
        all_ch = _cache["data"]
    else:
        all_ch = []
        for url in (IPTV_ORG_SPORTS_URL, FREE_TV_URL):
            try:
                text = await _download_m3u(url)
                parsed = _parse_m3u(text)
                if parsed:
                    all_ch.extend(parsed)
                    print(f"[M3U] {url}: {len(parsed)} canales")
            except Exception as e:
                print(f"[M3U] Error {url}: {e}")
        if all_ch:
            _cache["data"] = all_ch
            _cache["ts"] = now
            _cache["error"] = None
        else:
            _cache["error"] = "No se pudo descargar ninguna lista M3U"
            all_ch = _cache["data"] or []

    result, seen = [], set()
    # Canales de iptv-org
    for ch in all_ch:
        if _classify(ch) == sport and ch["url"] not in seen:
            seen.add(ch["url"])
            result.append({"name": ch["name"], "logo": ch.get("logo",""), "url": ch["url"], "sport": sport, "source": "iptv-org"})
    # Canales manuales garantizados
    for ch in MANUAL_CHANNELS.get(sport, []):
        if ch["url"] not in seen:
            seen.add(ch["url"]); result.append(ch)
    result.sort(key=lambda c: (0 if c.get("logo") else 1, c.get("name","").lower()))
    return result