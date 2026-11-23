/* TatoTV · Service Worker (ES2015 con Promesas: sin async/await, para que también registre en Chromium 53 — LG webOS 4 de 2019 — y Tizen 5)
   - Shell (HTML, CSS, JS, arte e iconos): se guarda al instalar; funciona sin conexión desde la primera visita.
     index.html: sale de la caché al instante y se actualiza detrás. CSS/JS llevan ?v=<hash> y son inmutables: caché primero.
   - Toda respuesta que se entrega a una navegación pasa por clean(): Safari (y la especificación) rechazan una respuesta «redirected» servida por un
     Service Worker («response served by service worker has redirections»); además se quitan las cabeceras de compresión (el cuerpo ya viene descomprimido).
   - La versión nueva se activa sola (skipWaiting + claim) y borra las cachés anteriores; la página lo detecta (controllerchange y build.json) y muestra el aviso «Actualizar».
   - /api/schedule de HOY: red primero (marcadores en vivo, nunca una copia vieja con conexión); otros días y noticias/canales: caché con frescura por tipo; sin red se usa la última copia. Lista M3U: 6 h. Imágenes (escudos, miniaturas): caché primero, sin caducidad (tope 1500).
   - NUNCA intercepta /api/hls, /api/resolve, vídeo ni iframes de terceros. */
var VERSION = "__BUILD__";
var SHELL = "ttv-shell-" + VERSION, API = "ttv-api-v1", IMG = "ttv-img-v1";
var CORE = ["data/channels.json", "offline.html", "legal.html", "404.html", "manifest.webmanifest", "favicon.ico", "icons/icon-48.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-192.png", "icons/maskable-512.png",
  "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/favicon-16.png", "img/logo-96.png", "img/logo-192.png", "img/logo-512.png", "img/og.png", "js/vendor/hls.min.js", "img/bg-football.jpg", "img/bg-basketball.jpg", "img/bg-nhl.jpg"];
var MAX_IMG = 1500;
var SPORTS = ["football", "basketball", "nhl", "f1", "tennis", "nfl", "mlb", "mma", "golf", "rugby", "motor", "other"];

function assetsFromHtml(html) {
  var out = ["js/legal-page.js"], re = /(?:href|src)="((?:css|js)\/[^"]+)"/g, m, i, v;
  while ((m = re.exec(html))) out.push(m[1]);
  for (i = 0; i < SPORTS.length; i++) for (v = 1; v <= 3; v++) out.push("img/t-" + SPORTS[i] + "-" + v + ".svg");
  return out;
}

/** Respuesta apta para servirse a una navegación: sin la marca «redirected» y sin cabeceras de compresión. Se reconstruye con el mismo cuerpo. */
function clean(res) {
  if (!res || !res.ok || (!res.redirected && !res.headers.has("content-encoding"))) return Promise.resolve(res);
  var h = new Headers(res.headers);
  h.delete("content-encoding"); h.delete("content-length");
  return res.blob().then(function (b) { return new Response(b, { status: 200, statusText: "OK", headers: h }); });
}
/** Pide una URL siguiendo redirecciones y entrega siempre una respuesta limpia. */
function get(url, opts) { return fetch(url, Object.assign({ redirect: "follow", cache: "no-cache" }, opts || {})).then(clean); }

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(SHELL).then(function (cache) {
    return get("./").then(function (r) {
      if (!r.ok) return "";
      return r.clone().text().then(function (html) { return cache.put("index.html", r).then(function () { return html; }); });
    }).catch(function () { return ""; }).then(function (html) {
      var list = CORE.concat(assetsFromHtml(html)).filter(function (u, i, a) { return a.indexOf(u) === i; });
      return Promise.all(list.map(function (u) { return get(u).then(function (r) { return r.ok ? cache.put(u, r) : null; }).catch(function () { return null; }); }));
    });
  }).then(function () {
    // Se activa sola (y toma el control): así ninguna versión queda «esperando» y atascada si la página abierta es antigua. La página avisa con el aviso «Actualizar».
    return self.skipWaiting();
  }));
});

self.addEventListener("message", function (e) { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) { return /^ttv-/.test(n) && n !== SHELL && n !== API && n !== IMG; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

function trim(name, max) {
  return caches.open(name).then(function (c) {
    return c.keys().then(function (keys) { var p = [], i; for (i = 0; i < keys.length - max; i++) p.push(c.delete(keys[i])); return Promise.all(p); });
  });
}

/** Copia con marca de hora para conocer su edad. */
function stamp(res) {
  var h = new Headers(res.headers); h.set("x-ttv-at", String(Date.now())); h.delete("content-encoding"); h.delete("content-length");
  return res.clone().blob().then(function (b) { return new Response(b, { status: res.status, statusText: res.statusText, headers: h }); });
}

function pad(n) { return (n < 10 ? "0" : "") + n; }
function tier(url) {
  if (/\/api\/news$/.test(url.pathname)) return { fresh: 15 * 60e3, max: 6 * 3600e3 };
  if (/\/api\/channels$/.test(url.pathname)) return { fresh: 30 * 60e3, max: 12 * 3600e3 };
  var d = url.searchParams.get("date") || "", t = new Date(), today = t.getFullYear() + pad(t.getMonth() + 1) + pad(t.getDate());
  // hoy (en vivo): red primero (5 s de plazo) y la caché solo si no hay red; nunca se sirve un marcador viejo teniendo conexión
  return d === today ? { net: true, max: 3 * 86400e3 } : { fresh: 30 * 60e3, max: 3 * 86400e3 };
}

function apiSWR(req, url, tierOverride) {
  return caches.open(API).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var t = tierOverride || tier(url), age = hit ? Date.now() - Number(hit.headers.get("x-ttv-at") || 0) : Infinity;
      function net() { return fetch(req).then(function (r) { return r.ok ? stamp(r).then(function (c) { return cache.put(req, c); }).then(function () { trim(API, 120); return r; }) : r; }); }
      if (t.net) { // red primero con plazo; la copia solo como respaldo sin conexión
        return Promise.race([net(), new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, 5000); })]).catch(function (err) { if (hit && age < t.max) return hit; throw err; });
      }
      if (hit && age < t.fresh) return hit;
      if (hit && age < t.max) { net().catch(function () { return null; }); return hit; }
      return net().catch(function (err) { if (hit) return hit; throw err; });
    });
  });
}

/** Página principal: caché al instante y actualización detrás; sin caché ni red, página sin conexión. */
function home(e) {
  return caches.open(SHELL).then(function (cache) {
    return cache.match("index.html").then(function (hit) {
      var net = get("./").then(function (r) { if (r.ok) cache.put("index.html", r.clone()); return r; });
      if (hit) { e.waitUntil(net.catch(function () { return null; })); return clean(hit); }
      return net.catch(function () { return cache.match("offline.html").then(function (o) { return o || Response.error(); }); });
    });
  });
}

function offlineOr(cache, key) {
  return cache.match(key).then(function (r) { return r || cache.match("offline.html"); }).then(function (r) { return r || Response.error(); });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  var url = new URL(req.url);

  // lista M3U de iptv-org: 6 h fresca, válida 3 días
  if (url.hostname === "iptv-org.github.io") { e.respondWith(apiSWR(req, url, { fresh: 6 * 3600e3, max: 3 * 86400e3 })); return; }

  if (url.origin === self.location.origin) {
    if (url.pathname === "/build.json" || /\/api\/(hls|resolve|schedule)/.test(url.pathname)) return;   // la agenda es siempre en vivo: va directo a la red (sin caché ni plazo del Service Worker)   // build.json: siempre de la red (es la «señal» de versión nueva)
    if (/\/api\/(news|channels)/.test(url.pathname)) { e.respondWith(apiSWR(req, url)); return; }
    if (url.pathname.indexOf("/api/") >= 0) return;

    if (req.mode === "navigate") {
      if (url.pathname === "/" || /\/index\.html$/.test(url.pathname)) { e.respondWith(home(e)); return; }
      // otras páginas (legal.html, 404…): red primero, caché como respaldo
      e.respondWith(get(req.url).catch(function () { return caches.open(SHELL).then(function (c) { return offlineOr(c, url.pathname.slice(1)); }); }));
      return;
    }
    // resto del shell: caché primero (los CSS/JS llevan ?v=hash)
    e.respondWith(caches.open(SHELL).then(function (cache) {
      return cache.match(req).then(function (a) { return a || cache.match(url.pathname.slice(1) || "index.html"); }).then(function (hit) {
        if (hit) return clean(hit);
        return get(req.url, { cache: "default" }).then(function (r) { if (r.ok) cache.put(req, r.clone()); return r; }).catch(function () { return offlineOr(cache, "offline.html"); });
      });
    }));
    return;
  }

  if (req.destination === "image") { // escudos y logos: la URL de cada imagen no cambia nunca
    e.respondWith(caches.open(IMG).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (r) {
          if (r.ok || r.type === "opaque") { cache.put(req, r.clone()); e.waitUntil(trim(IMG, MAX_IMG)); }
          return r;
        }).catch(function () { return Response.error(); });
      });
    }));
  }
});
