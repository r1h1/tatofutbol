/* TatoTV · data.js — acceso a datos con caché en tres capas:
   1) memoria + deduplicación de peticiones iguales, 2) localStorage con «stale-while-revalidate» (pinta al instante lo guardado y actualiza detrás),
   3) Service Worker y CDN de Vercel (las funciones /api responden con s-maxage, así que el servidor casi nunca se ejecuta). */
(function (w) {
  "use strict";
  var D = (w.D = {});
  var mem = {}, inflight = {};
  var MIN = 60 * 1000;

  /** getJSON(url, { ttl, force, onFresh }) → Promise<datos>. Con copia guardada vieja devuelve esa y, si hay onFresh, lo llama con la nueva. */
  D.getJSON = function (url, opts) {
    opts = opts || {};
    var ttl = opts.ttl == null ? 5 * MIN : opts.ttl, now = Date.now(), key = "c:" + url;
    // capas de lectura: memoria → sessionStorage (esta pestaña) → localStorage (persistente); gana la copia más reciente
    var hit = mem[url], s2, l2;
    if (!hit) {
      s2 = U.session.get(key); l2 = U.store.get(key);
      hit = s2 && l2 ? (s2.t >= l2.t ? s2 : l2) : s2 || l2;
      if (hit) mem[url] = hit;
    }
    if (opts.maxAge && hit && now - hit.t > opts.maxAge && !opts.force) { hit = null; delete mem[url]; } // demasiado vieja para mostrarla (p. ej. noticias)
    if (hit && !opts.force && now - hit.t < ttl) return Promise.resolve(hit.d);
    // force = «actualizar ya»: se salta la caché del navegador, del Service Worker y del CDN (parámetro único + no-store)
    var furl = opts.force ? url + (url.indexOf("?") < 0 ? "?" : "&") + "_=" + now : url, ik = opts.force ? furl : url;
    var req = inflight[ik] || (inflight[ik] = fetch(furl, { headers: { accept: "application/json" }, cache: opts.force || opts.live ? "no-store" : "default" }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(function (d) {
      var e = { t: Date.now(), d: d }; mem[url] = e; U.session.set(key, e); U.store.set(key, e); U.store.trim("c:", 16);
      delete inflight[ik]; return d;
    }, function (err) { delete inflight[ik]; throw err; }));
    if (hit && !opts.force && opts.wait) { // «wait»: una copia vencida NO se enseña; se espera la red (máx. 4 s) y solo entonces se cae a la copia (al entrar a la app y al cambiar de deporte)
      return new Promise(function (res) {
        var done = false, t = setTimeout(function () { if (!done) { done = true; res(hit.d); } }, 4000);
        req.then(function (d) { if (!done) { done = true; clearTimeout(t); res(d); } else if (opts.onFresh) opts.onFresh(d); }, function () { if (!done) { done = true; clearTimeout(t); res(hit.d); } });
      });
    }
    if (hit && !opts.force) { // stale-while-revalidate
      req.then(function (d) { if (opts.onFresh) opts.onFresh(d); }, function () { /* sin red: se queda lo guardado */ });
      return Promise.resolve(hit.d);
    }
    return req.catch(function (err) { if (hit) return hit.d; throw err; });
  };

  /** Agenda de un deporte para un día local (YYYYMMDD). Hoy: fresca 15 s y una copia de más de 3 min NO se enseña (estados y marcadores en vivo no pueden estar viejos) ·
   *  otros días: 30 min. */
  D.schedule = function (sport, ymd, opts) {
    opts = opts || {};
    var live = ymd === U.ymd(new Date());
    return D.getJSON("api/schedule?sport=" + sport + "&date=" + ymd, { ttl: live ? 15 * 1000 : 30 * MIN, maxAge: live ? 3 * MIN : 12 * 60 * MIN, force: opts.force, wait: opts.wait, live: live, onFresh: opts.onFresh });
  };
  /** Noticias: frescas 20 min; una copia guardada de más de 6 h ya no se enseña (las noticias caducan). Se descartan además las de más de 7 días o de otro año. */
  D.news = function (sport, opts) {
    opts = opts || {};
    function clean(d) {
      var now = Date.now(), y = new Date().getFullYear(), items = [], i, n, lim = (d && d.items && d.items.length >= 6 ? 7 : 14) * 864e5;
      for (i = 0; d && d.items && i < d.items.length; i++) { n = d.items[i]; if (new Date(n.ts).getFullYear() === y && now - n.ts <= lim && n.ts <= now + 6 * 36e5) items.push(n); }
      return { at: d && d.at, items: items };
    }
    return D.getJSON("api/news?sport=" + sport, { ttl: 20 * MIN, maxAge: 360 * MIN, force: opts.force, onFresh: opts.onFresh ? function (d) { opts.onFresh(clean(d)); } : null }).then(clean);
  };
  /** Última vez que se actualizó una URL (para «actualizado hace…»). */
  D.age = function (url) { var e = mem[url] || U.session.get("c:" + url) || U.store.get("c:" + url); return e ? e.t : 0; };

  /* ── Canales M3U (iptv-org permite CORS: se descargan directo en el navegador, sin pasar por el servidor) ── */
  var M3U_URL = "https://iptv-org.github.io/iptv/categories/sports.m3u";
  var KEYS = {
    football: ["fox deportes", "tyc sports", "espn deportes", "tudn", "movistar deportes", "dazn", "laliga", "premier league", "gol tv", "goltv", "bein", "sky sports", "fox sports", "dsports", "directv sports", "win sports", "espn", "tnt sports", "eurosport", "sportv", "band sports", "champions", "libertadores", "sudamericana", "futbol", "fútbol", "soccer", "football"],
    basketball: ["nba", "euroleague", "ncaa", "basketball", "basket", "baloncesto", "espn", "tnt", "dsports", "tudn"],
    nhl: ["nhl", "sportsnet", "tsn", "rds", "hockey"],
    f1: ["f1", "formula 1", "fórmula 1", "formula1", "sky sports f1", "dazn f1", "motorsport"],
    tennis: ["tennis", "tenis", "atp", "wta", "eurosport", "wimbledon", "roland"],
    nfl: ["nfl", "nfl network", "redzone", "football americano", "fútbol americano"],
    mlb: ["mlb", "baseball", "béisbol", "beisbol"],
    mma: ["ufc", "fight", "boxing", "boxeo", "dazn", "combate", "wwe", "mma"],
    golf: ["golf", "pga", "golf channel"],
    rugby: ["rugby", "six nations", "sky sports rugby"],
    motor: ["motogp", "moto gp", "nascar", "indycar", "rally", "wrc", "motor", "racing"],
  };
  function parseM3U(text) {
    var out = [], cur = null, lines = text.split(/\r?\n/), i, l, m, c;
    for (i = 0; i < lines.length; i++) {
      l = lines[i].trim();
      if (l.indexOf("#EXTINF:") === 0) {
        c = l.lastIndexOf(",");
        cur = { n: c >= 0 ? l.slice(c + 1).trim() : "", g: "", l: "" };
        m = /group-title="([^"]*)"/.exec(l); if (m) cur.g = m[1];
        m = /tvg-logo="([^"]*)"/.exec(l); if (m) cur.l = m[1];
      } else if (l && l.charAt(0) !== "#" && cur) { cur.u = l; if (cur.n) out.push(cur); cur = null; }
    }
    return out;
  }
  function classify(ch) {
    var t = (ch.n + " " + ch.g).toLowerCase(), s, k;
    for (s in KEYS) for (k = 0; k < KEYS[s].length; k++) if (t.indexOf(KEYS[s][k]) >= 0) return s;
    return null;
  }
  /** Canales 24/7 de un deporte: del servidor (/api/channels: «hub» de los sitios de agenda + listas IPTV comprobadas una a una; el CDN los cachea 30 min).
   *  Si el servidor no responde, se usa la lista pública de iptv-org descargada directamente (respaldo). Devuelve [{ n, l, kind, u, r, alt }]. */
  function legacyChannels(sport) {
    var cached = U.store.get("m3u"), fresh = cached && Date.now() - cached.t < 6 * 60 * MIN;
    var p = fresh ? Promise.resolve(cached.d) : fetch(M3U_URL).then(function (r) { if (!r.ok) throw new Error("m3u"); return r.text(); }).then(function (txt) {
      var all = parseM3U(txt), by = {}, seen = {}, i, s;
      for (s in KEYS) by[s] = [];
      for (i = 0; i < all.length; i++) {
        s = classify(all[i]);
        if (!s || seen[all[i].u]) continue;
        seen[all[i].u] = 1; by[s].push({ n: all[i].n, l: all[i].l, kind: "hls", u: all[i].u, r: "", alt: [] });
      }
      for (s in by) by[s].sort(function (a, b) { return ((b.l ? 1 : 0) - (a.l ? 1 : 0)) || (a.n.toLowerCase() < b.n.toLowerCase() ? -1 : 1); });
      U.store.set("m3u", { t: Date.now(), d: by });
      return by;
    }).catch(function (e) { if (cached) return cached.d; throw e; });
    return p.then(function (by) { return by[sport] || []; });
  }
  /** Canales 24/7, al instante: primero la instantánea empaquetada (data/channels.json: hub + listas IPTV ya comprobadas, el Service Worker la guarda) y detrás se
   *  revalida con el servidor (/api/channels, comprobación en vivo). onFresh(lista) se llama solo si la lista cambió. Sin nada de eso: respaldo con iptv-org directo. */
  function merge(parts) {
    var out = [], seen = {}, i, j, k;
    for (i = 0; i < parts.length; i++) for (j = 0; j < parts[i].length; j++) { k = (parts[i][j].n || "").toLowerCase().replace(/[^a-z0-9]/g, ""); if (!k || seen[k]) continue; seen[k] = 1; out.push(parts[i][j]); }
    return out;
  }
  function sigOf(list) { var h = "", i; for (i = 0; i < list.length; i++) h += list[i].n + "|"; return h; }
  D.channels = function (sport, onFresh) {
    function part(src) { return D.getJSON("api/channels?sport=" + sport + "&src=" + src, { ttl: 30 * MIN, maxAge: 12 * 60 * MIN }).then(function (d) { return (d && d.items) || []; }, function () { return []; }); }
    function live() { return Promise.all([part("hub"), part("m3u")]).then(function (r) { return merge(r); }); }
    return D.getJSON("data/channels.json", { ttl: 6 * 60 * MIN }).then(function (d) {
      var list = merge([sport === "nhl" ? [] : (d.hub || []), (d.sports && d.sports[sport]) || []]);
      if (!list.length) throw new Error("vacía");
      var base = sigOf(list);
      live().then(function (fresh) { if (fresh.length && onFresh && sigOf(fresh) !== base) onFresh(fresh); }, function () { /* se queda la instantánea */ });
      return list;
    }).catch(function () { return live().then(function (res) { return res.length ? res : legacyChannels(sport); }); });
  };
})(window);
