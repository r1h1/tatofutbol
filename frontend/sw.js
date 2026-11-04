/**
 * TatoDeportes · Service Worker
 * ---------------------------------------------------------
 * Estrategias de caché por tipo de recurso:
 *   - Shell (HTML, manifest, offline): precargados al instalar.
 *   - Navegación: network-first → cache → offline.html.
 *   - /api/matches: network-first (datos cambian cada 5 min) → cache fallback.
 *   - /api/sports: cache-first (casi nunca cambia) → revalidate in background.
 *   - /api/thumbnail: cache-first → revalidate in background.
 *   - /api/proxy, /api/resolve: NUNCA cachear (video en vivo).
 *   - Estáticos locales (CSS/JS): cache-first → revalidate in background.
 *   - Fuentes y CDN (hls.js): stale-while-revalidate.
 *
 * IMPORTANTE: sube VERSION cuando publiques cambios importantes en
 * index.html o en este archivo, para forzar la actualización de la caché.
 */
const VERSION = "v1";
const CACHE_SHELL = `TatoDeportes-shell-${VERSION}`;
const CACHE_API = `TatoDeportes-api-${VERSION}`;
const CACHE_THUMBS = `TatoDeportes-thumbs-${VERSION}`;
const CACHE_RUNTIME = `TatoDeportes-runtime-${VERSION}`;

const SHELL_ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "offline.html"
];

// Rutas de API que NUNCA se cachean (streams de video, tokens efímeros).
const NEVER_CACHE = [
  "/api/proxy",
  "/api/resolve"
];

// ============================================================
// INSTALL: precargar shell
// ============================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      await Promise.all(
        SHELL_ASSETS.map(url =>
          fetch(url, { cache: "reload" })
            .then(res => (res && res.ok ? cache.put(url, res) : null))
            .catch(() => null)
        )
      );
      // No llamar skipWaiting() automáticamente: el usuario debe pulsar
      // "Actualizar" para aplicar una nueva versión. Ver index.html.
    })()
  );
});

// ============================================================
// ACTIVATE: limpiar cachés antiguas
// ============================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [CACHE_SHELL, CACHE_API, CACHE_THUMBS, CACHE_RUNTIME];
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(n => n.startsWith("TatoDeportes-") && !keep.includes(n))
          .map(n => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// ============================================================
// HELPERS
// ============================================================
async function networkFirst(req, cacheName, fallbackFn) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(cacheName).then(c => c.put(req, clone)).catch(() => {});
    }
    return res;
  } catch (_) {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (fallbackFn) return fallbackFn();
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) {
    // Revalidar en background sin bloquear
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(cacheName).then(c => c.put(req, clone)).catch(() => {});
        }
      })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(cacheName).then(c => c.put(req, clone)).catch(() => {});
    }
    return res;
  } catch (_) {
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cached = await caches.match(req);
  const network = fetch(req)
    .then(res => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(cacheName).then(c => c.put(req, clone)).catch(() => {});
      }
      return res;
    })
    .catch(() => null);
  return cached || (await network) || new Response("", { status: 503 });
}

// ============================================================
// FETCH: estrategia según tipo de recurso
// ============================================================
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1. NUNCA cachear video/proxy
  if (NEVER_CACHE.some(p => url.pathname.startsWith(p))) {
    return; // dejar que el navegador lo maneje normalmente
  }

  // 2. Navegación (HTML): network-first → caché → offline.html
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_SHELL).then(c => c.put(req, clone)).catch(() => {});
          return res;
        }
        if (res && res.status >= 500) {
          const e500 = await caches.match("offline.html");
          if (e500) return e500;
        }
        return res;
      } catch (_) {
        const cached = (await caches.match(req)) || (await caches.match("index.html")) || (await caches.match("offline.html"));
        return cached || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // 3. API /api/matches: network-first con fallback a caché (permite ver la agenda offline)
  if (url.pathname === "/api/matches") {
    event.respondWith(
      networkFirst(req, CACHE_API, () =>
        new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })
      )
    );
    return;
  }

  // 4. API /api/sports: cache-first (casi nunca cambia)
  if (url.pathname === "/api/sports") {
    event.respondWith(cacheFirst(req, CACHE_API));
    return;
  }

  // 5. API /api/thumbnail: cache-first con revalidación en background
  if (url.pathname === "/api/thumbnail") {
    event.respondWith(cacheFirst(req, CACHE_THUMBS));
    return;
  }

  // 6. Otras rutas /api/*: network-first (no cacheamos servidores por seguridad)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req, CACHE_API));
    return;
  }

  // 7. Mismo origen (CSS, JS, imágenes locales): cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, CACHE_RUNTIME));
    return;
  }

  // 8. Google Fonts y CDN (hls.js): stale-while-revalidate
  if (
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("cdn.jsdelivr.net")
  ) {
    event.respondWith(staleWhileRevalidate(req, CACHE_RUNTIME));
    return;
  }

  // 9. Imágenes externas (Unsplash, Wikipedia): cache-first con revalidación
  if (
    url.hostname.includes("unsplash.com") ||
    url.hostname.includes("wikipedia.org")
  ) {
    event.respondWith(cacheFirst(req, CACHE_THUMBS));
    return;
  }

  // 10. Todo lo demás: dejar pasar sin interceptar
});

// ============================================================
// MENSAJES desde la página (por si el frontend quiere forzar update)
// ============================================================
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (data.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys()
        .then(names => Promise.all(names.filter(n => n.startsWith("TatoDeportes-")).map(n => caches.delete(n))))
        .then(() => {
          if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok: true });
        })
    );
  }
});