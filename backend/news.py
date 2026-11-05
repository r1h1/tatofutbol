# backend/news.py
"""Noticias de fútbol y basketball desde feeds RSS públicos en español."""
from __future__ import annotations
import asyncio
import re
import time
from datetime import datetime
from typing import Dict, List, Optional
import xml.etree.ElementTree as ET

import httpx

# ── Fuentes RSS por deporte (TODAS EN ESPAÑOL) ──
# CAMBIO: basketball usa fuentes españolas de baloncesto/NBA,
# no la de ESPN en inglés. El usuario pidió específicamente noticias
# de NBA en español.
NEWS_FEEDS = {
    "football": [
        {"name": "Marca", "url": "https://e00-marca.uecdn.es/rss/futbol.xml"},
        {"name": "AS", "url": "https://as.com/rss/futbol.xml"},
        {"name": "Mundo Deportivo", "url": "https://www.mundodeportivo.com/rss/futbol"},
    ],
    "basketball": [
        # Fuentes españolas de baloncesto y NBA (NO ESPN en inglés)
        {"name": "Marca Baloncesto", "url": "https://e00-marca.uecdn.es/rss/baloncesto.xml"},
        {"name": "AS Baloncesto", "url": "https://as.com/rss/baloncesto.xml"},
        {"name": "Mundo Deportivo NBA", "url": "https://www.mundodeportivo.com/rss/baloncesto"},
    ],
}

CACHE_TTL = 600  # 10 minutos
_cache: Dict[str, Dict] = {}


async def _fetch_feed(client: httpx.AsyncClient, feed_url: str) -> Optional[str]:
    """Descarga un feed RSS/Atom. Devuelve None si falla."""
    try:
        r = await client.get(feed_url, timeout=15.0, follow_redirects=True)
        if r.status_code == 200 and r.text:
            return r.text
    except Exception:
        pass
    return None


def _clean_html(text: str) -> str:
    """
    Limpia un texto que viene de RSS:
      - Quita CDATA (<![CDATA[ ... ]]>)
      - Quita tags HTML (<a>, <p>, <img>, etc.)
      - Decodifica entidades (&amp;, &quot;, &nbsp;...)
      - Normaliza espacios múltiples
    """
    if not text:
        return ""
    # Quitar CDATA
    text = re.sub(r"<!\[CDATA\[", "", text)
    text = re.sub(r"\]\]>", "", text)
    # Quitar tags HTML
    text = re.sub(r"<[^>]+>", " ", text)
    # Decodificar entidades comunes
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&quot;", '"').replace("&#39;", "'").replace("&apos;", "'")
    text = text.replace("&nbsp;", " ").replace("&#8217;", "'").replace("&#8211;", "–")
    text = text.replace("&#8220;", '"').replace("&#8221;", '"')
    # Normalizar espacios
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _extract_image(item) -> Optional[str]:
    """
    Extrae la imagen del <item>:
      - <media:content url="...">
      - <media:thumbnail url="...">
      - <enclosure url="..." type="image/*">
      - <img src="..."> dentro de <description>
    Devuelve None si no encuentra nada.
    """
    ns = {
        "media": "http://search.yahoo.com/mrss/",
        "atom": "http://www.w3.org/2005/Atom",
    }
    # media:content y media:thumbnail
    for el in item.findall("media:content", ns) + item.findall("media:thumbnail", ns):
        url = el.get("url")
        if url:
            return url
    # enclosure con type="image/*"
    for el in item.findall("enclosure"):
        url = el.get("url")
        if url and el.get("type", "").startswith("image"):
            return url
    # <img> dentro de la descripción
    desc_el = item.find("description")
    if desc_el is not None and desc_el.text:
        m = re.search(r'<img[^>]+src="([^"]+)"', desc_el.text)
        if m:
            return m.group(1)
    return None


def _parse_rss(xml_text: str, source_name: str) -> List[Dict]:
    """
    Parsea un feed RSS 2.0 o Atom.

    RSS 2.0:  <rss><channel><item>...
    Atom:     <feed><entry>...
    """
    items: List[Dict] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return items

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    raw_items = root.findall(".//item") or root.findall(".//atom:entry", ns)

    for item in raw_items[:15]:  # máximo 15 por fuente
        title = _clean_html(item.findtext("title") or "")
        link = (item.findtext("link") or "").strip()

        # Atom: el link está en atributo href
        if not link:
            link_el = item.find("atom:link", ns)
            if link_el is not None:
                link = link_el.get("href", "")

        # Descripción (RSS usa <description>, Atom usa <summary> o <content>)
        desc_raw = (
            item.findtext("description")
            or item.findtext("summary")
            or item.findtext("content")
            or ""
        )
        desc = _clean_html(desc_raw)

        # Fecha (RSS usa <pubDate>, Atom usa <published> o <updated>)
        pub_date = (
            item.findtext("pubDate")
            or item.findtext("published")
            or item.findtext("updated")
            or ""
        ).strip()

        image = _extract_image(item)

        if title and link:
            items.append({
                "title": title,
                "link": link,
                "description": desc[:250],  # truncar a 250 chars
                "image": image or "",
                "source": source_name,
                "pub_date": pub_date,
            })
    return items


def _sort_key(n: Dict) -> float:
    """
    Convierte pub_date a timestamp para ordenar.
    Soporta 5 formatos distintos porque cada feed usa el suyo.
    """
    date_str = n.get("pub_date", "")
    if not date_str:
        return 0.0

    formats = [
        "%a, %d %b %Y %H:%M:%S %z",       # RFC 822 con timezone
        "%a, %d %b %Y %H:%M:%S %Z",       # RFC 822 con nombre timezone
        "%Y-%m-%dT%H:%M:%S%z",            # ISO 8601 con timezone
        "%Y-%m-%dT%H:%M:%SZ",             # ISO 8601 UTC
        "%Y-%m-%d %H:%M:%S",              # Simple
    ]
    normalized = date_str.replace("GMT", "+0000").replace("UTC", "+0000")
    for fmt in formats:
        try:
            return datetime.strptime(normalized, fmt).timestamp()
        except (ValueError, AttributeError):
            continue
    return 0.0


async def get_news_for_sport(sport: str, force: bool = False) -> List[Dict]:
    """
    Devuelve hasta 20 noticias del deporte solicitado, ordenadas por
    fecha descendente (más reciente primero).

    - sport: "football" o "basketball".
    - force: ignora la caché y vuelve a descargar.

    Caché de 10 minutos por deporte.
    """
    sport = (sport or "football").strip().lower()
    now = time.time()

    if not force and sport in _cache and (now - _cache[sport]["ts"] < CACHE_TTL):
        return _cache[sport]["data"]

    feeds = NEWS_FEEDS.get(sport, [])
    if not feeds:
        return []

    async with httpx.AsyncClient(
        timeout=20.0,
        headers={"User-Agent": "Mozilla/5.0 (compatible; TatoTV/1.0)"},
        follow_redirects=True,
    ) as client:
        tasks = [_fetch_feed(client, f["url"]) for f in feeds]
        xml_texts = await asyncio.gather(*tasks, return_exceptions=True)

        all_news: List[Dict] = []
        for feed_info, xml in zip(feeds, xml_texts):
            if isinstance(xml, str) and xml:
                parsed = _parse_rss(xml, feed_info["name"])
                print(f"[NEWS:{sport}] {feed_info['name']}: {len(parsed)} noticias")
                all_news.extend(parsed)
            else:
                print(f"[NEWS:{sport}] {feed_info['name']}: FALLÓ")

    # Ordenar por fecha (más reciente primero)
    all_news.sort(key=_sort_key, reverse=True)
    all_news = all_news[:20]  # límite global

    _cache[sport] = {"data": all_news, "ts": now}
    return all_news