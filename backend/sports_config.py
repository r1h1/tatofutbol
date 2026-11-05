# backend/sports_config.py
from __future__ import annotations
from typing import Dict, List, Optional

SPORTS: Dict[str, Dict] = {
    "football": {
        "display_name": "Fútbol", 
        "icon": "football", 
        "accent": "#b7f35a", 
        "use_m3u": True,
        "available": True,
        "sources": [
            {"name": "roja_org", "base_url": "https://rojadirectatvplay.org", "agenda_url": "https://rojadirectatvplay.org/", "source_type": "custom", "min_title_len": 4},
            {"name": "futbollibre_org", "base_url": "https://futbollibretvplus.org", "agenda_url": "https://futbollibretvplus.org/", "source_type": "generic", "min_title_len": 6},
            {"name": "pelotalibre", "base_url": "https://pelotalibrenvivo.com", "agenda_url": "https://pelotalibrenvivo.com/", "source_type": "generic", "min_title_len": 5},
            {"name": "pirlotv_la", "base_url": "https://pirlotv.la", "agenda_url": "https://pirlotv.la/home.php", "source_type": "generic", "min_title_len": 4},
            {"name": "pirlo_club", "base_url": "https://pirlo-tv.club", "agenda_url": "https://pirlo-tv.club/", "source_type": "generic", "min_title_len": 4},
        ],
    },
    "basketball": {
        "display_name": "Basketball", 
        "icon": "basketball", 
        "accent": "#f4a261", 
        "use_m3u": True,
        "available": True,
        "sources": [
            {"name": "streameast_cool", "base_url": "https://streameast.cool", "agenda_url": "https://streameast.cool/nbastreams4", "source_type": "generic", "min_title_len": 5},
        ],
    },
    "nhl": {
        "display_name": "NHL",
        "icon": "hockey",
        "accent": "#60a5fa",
        "use_m3u": True,
        "available": True,
        # No tiene fuentes propias: sus partidos se extraen de las
        # fuentes de fútbol y se clasifican por título (ver scraper.py).
        "sources": [],
    },
}

CROSS_KEYWORDS = {
    "basketball": ["nhl", "mlb", "nfl", "soccer", "tennis", "motogp", "formula 1", "f1", "ufc", "boxing", "cricket", "darts", "rugby", "golf", "football", "nascar", "indycar"],
    "nhl": ["nba", "wnba", "soccer", "mlb", "nfl", "tennis", "motogp", "formula 1", "f1", "ufc", "boxing", "football", "basketball"],
}

def list_sports() -> List[Dict]:
    return [
        {
            "key": k, 
            "display_name": c["display_name"], 
            "icon": c["icon"],
            "accent": c["accent"], 
            "use_m3u": c.get("use_m3u", False),
            "available": c.get("available", True)
        }
        for k, c in SPORTS.items()
    ]

def get_sport_config(sport_key: str) -> Optional[Dict]:
    return SPORTS.get((sport_key or "").strip().lower())

def get_sources(sport_key: str) -> List[Dict]:
    cfg = get_sport_config(sport_key)
    return list(cfg["sources"]) if cfg else []

def is_valid_sport(sport_key: str) -> bool:
    return get_sport_config(sport_key) is not None