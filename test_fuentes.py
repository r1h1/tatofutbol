# test_fuentes.py — Diagnóstico rápido de fuentes de Basketball
import asyncio
from playwright.async_api import async_playwright

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

FUENTES = [
    ("nbabite",   "https://nbabite.to/"),
    ("nbabox",    "https://nbabox.tv/"),
    ("thetvapp",  "https://thetvapp.to/nba"),
    ("sportsurge","https://sportsurge.net/#/nba"),
    ("streameast","https://streameast.vg/"),
    ("nbabox_alt","https://nbabox.live/"),
    ("nbabite_rs","https://nbabite.rs/"),
    ("weakspell", "https://weakspell.to/"),
    ("viprow",    "https://viprow.nu/"),
]

async def test_one(p, name, url):
    browser = await p.chromium.launch(
        headless=True,
        args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--mute-audio"]
    )
    ctx = await browser.new_context(user_agent=UA, viewport={"width":1366,"height":768}, locale="es-ES", ignore_https_errors=True)
    await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
    page = await ctx.new_page()
    try:
        t0 = asyncio.get_event_loop().time()
        resp = await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(4000)
        elapsed = asyncio.get_event_loop().time() - t0
        status = resp.status if resp else 0
        title = await page.title()
        anchors = await page.query_selector_all("a")
        n_anchors = len(anchors)
        # Buscar anchors con "vs", "vs." o "-" en el texto
        candidates = 0
        for a in anchors[:200]:
            try:
                text = (await a.inner_text()).strip()
                if text and (" vs " in text.lower() or " - " in text or " @ " in text):
                    candidates += 1
            except: pass
        await browser.close()
        print(f"  [{name:12}] HTTP {status} · {elapsed:5.1f}s · {n_anchors:3d} anchors · {candidates:2d} con 'vs/-' · {title[:60]}")
        return {"name": name, "ok": True, "status": status, "anchors": n_anchors, "candidates": candidates}
    except Exception as e:
        await browser.close()
        print(f"  [{name:12}] ERROR: {str(e)[:100]}")
        return {"name": name, "ok": False, "error": str(e)[:100]}

async def main():
    print("Diagnóstico de fuentes de Basketball")
    print("=" * 80)
    async with async_playwright() as p:
        results = []
        for name, url in FUENTES:
            print(f"Probando {name} -> {url}")
            r = await test_one(p, name, url)
            results.append(r)
        print("=" * 80)
        ok = [r for r in results if r.get("ok") and r.get("status") == 200]
        with_candidates = [r for r in ok if r.get("candidates", 0) > 0]
        print(f"RESUMEN: {len(ok)}/{len(results)} responden 200 · {len(with_candidates)} con candidatos de partidos")
        if with_candidates:
            print("\nFuentes que SÍ traen partidos:")
            for r in with_candidates:
                print(f"  ✓ {r['name']} ({r['candidates']} candidatos)")
        if ok:
            print(f"\nFuentes que responden 200 pero sin partidos:")
            for r in ok:
                if r.get("candidates", 0) == 0:
                    print(f"  ⚠ {r['name']} ({r['anchors']} anchors, 0 con 'vs/-')")

if __name__ == "__main__":
    asyncio.run(main())