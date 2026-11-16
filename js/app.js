/* TatoTV · app.js — pantalla principal: deporte, vista, día, lista incremental, búsqueda, refresco, aviso de versión nueva e instalación (PWA). Script clásico (sin módulos). */
(function (w) {
  "use strict";
  var A = (w.A = {});
  var SPORTS = {}; U.SPORTS.forEach(function (x) { SPORTS[x.k] = x.n; });
  var S = { sport: "football", mode: "events", day: U.ymd(new Date()), q: "", matches: [], loading: false, sig: "", rendered: "", today: "" };
  var GAME_MS = { football: 2.6 * 3600e3, basketball: 3 * 3600e3, nhl: 3 * 3600e3, nfl: 3.5 * 3600e3, mlb: 3.5 * 3600e3, tennis: 2.5 * 3600e3, f1: 2 * 3600e3, motor: 2.5 * 3600e3, mma: 5 * 3600e3, golf: 6 * 3600e3, rugby: 2 * 3600e3, other: 3 * 3600e3 };
  var PAGE = (w.U && U.lite) ? 16 : (w.innerWidth <= 820 ? 20 : 36);   // filas que se pintan por tramo (el resto llega al hacer scroll)
  var pollT = null, reqId = 0;

  /* ── estado de un partido: pre | in | post (las fuentes sin ESPN traen "est" y se calcula por la hora) ── */
  A.stateOf = function (m) {
    var t = Date.parse(m.start), now = Date.now(), dur = GAME_MS[m.sport] || GAME_MS.football;
    if (m.state === "est") {
      if (isNaN(t)) return "in";
      return now < t - 60e3 ? "pre" : now < t + dur ? "in" : "post";
    }
    // Protección contra datos con retraso: un «en vivo» que empezó hace más de 1,5 veces la duración habitual ya terminó; un «próximo» cuya hora pasó hace más de 3 min está en juego.
    if (!isNaN(t)) {
      if (m.state === "in" && now > t + dur * 1.5) return "post";
      if (m.state === "pre" && now > t + 3 * 60e3 && now < t + dur) return "in";
    }
    return m.state;
  };

  /* ── miniaturas: escena SVG estática (3 variantes por deporte, cacheadas) + escudos de ESPN o iniciales ── */
  var HUES = [8, 28, 48, 150, 175, 200, 220, 250, 280, 320, 345];
  function badge(name, side) {
    var ini = String(name || "?").replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").trim().split(/\s+/), t = ini.length > 1 ? ini[0].charAt(0) + ini[1].charAt(0) : (ini[0] || "?").slice(0, 3);
    var hue = HUES[U.hash(name) % HUES.length];
    return '<span class="badge ' + side + '" style="background:hsl(' + hue + ',55%,38%)">' + U.esc(t.toUpperCase()) + "</span>";
  }
  var PX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";   // píxel transparente mientras la imagen espera su turno
  /** <img> perezosa: el navegador solo la descarga cuando está cerca de la pantalla (IntersectionObserver; sin él se carga al momento). */
  function lzImg(cls, src, extra) { return '<img class="' + cls + '" src="' + PX + '" data-src="' + U.esc(src) + '" alt="" decoding="async" referrerpolicy="no-referrer"' + (extra || "") + ">"; }
  var io = null;
  function reveal(im) { var u = im.getAttribute("data-src"); if (u) { im.removeAttribute("data-src"); im.src = u; } }
  function lazyScan(root) {
    var els = root.querySelectorAll("img[data-src]"), i;
    if (!els.length) return;
    if (!w.IntersectionObserver) { for (i = 0; i < els.length; i++) reveal(els[i]); return; }
    if (!io) io = new w.IntersectionObserver(function (es) { for (var k = 0; k < es.length; k++) if (es[k].isIntersecting) { reveal(es[k].target); io.unobserve(es[k].target); } }, { rootMargin: U.lite ? "300px 0px" : "1000px 0px" });
    for (i = 0; i < els.length; i++) io.observe(els[i]);
  }
  /* Escudos ya vistos: se recuerdan por nombre de equipo (localStorage) para reutilizarlos cuando otra fuente trae el partido sin escudo. Las imágenes en sí
     las guarda el Service Worker (caché primero, sin caducidad): un partido que se repite no vuelve a descargar nada. */
  var LOGOS = U.store.get("logos") || {}, logosDirty = false;
  function lk(n) { return String(n || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function learnLogos(list) {
    var i, j, t, k, n = 0;
    for (i = 0; i < list.length; i++) for (j = 0; j < 2; j++) {
      t = j ? list[i].b : list[i].a; k = lk(t.n); if (!k) continue;
      if (t.logo) { if (LOGOS[k] !== t.logo) { LOGOS[k] = t.logo; logosDirty = true; } } else if (LOGOS[k]) t.logo = LOGOS[k];
    }
    if (logosDirty) {
      for (k in LOGOS) n++;
      if (n > 900) { var keep = {}, c = 0; for (k in LOGOS) { if (c++ % 2) keep[k] = LOGOS[k]; } LOGOS = keep; }
      U.store.set("logos", LOGOS); logosDirty = false;
    }
  }
  function crest(t, side) {
    if (!t.logo) return badge(t.n, side);
    var u = t.logo.replace(/^https:\/\/a\.espncdn\.com(\/i\/teamlogos\/.+)$/, "https://a.espncdn.com/combiner/i?img=$1&w=" + (U.lite ? 64 : 96) + "&h=" + (U.lite ? 64 : 96) + "&scale=crop&cquality=40");
    return lzImg("crest " + side, u, ' crossorigin="anonymous" data-n="' + U.esc(t.n) + '" data-side="' + side + '"');
  }
  function thumb(m) {
    var v = (U.hash(m.id) % 3) + 1;
    return '<div class="thumb">' + lzImg("scene", "img/t-" + m.sport + "-" + v + ".svg") + (m.b.n ? crest(m.a, "l") + '<span class="vs">VS</span>' + crest(m.b, "r") : '<span class="ico">' + U.esc(m.a.ab && m.a.ab.length < 6 && m.sport !== "tennis" ? m.a.ab : U.sportName(m.sport)) + "</span>") + "</div>";
  }

  function rowHTML(m, i) {
    var st = A.stateOf(m), t = U.time(m.start), live = st === "in";
    var when = live ? "<em>EN VIVO</em>" : "";
    when += '<span class="t">' + U.esc(t.t) + (t.p ? "<sup>" + U.esc(t.p) + "</sup>" : "") + "</span>";
    if (st === "post") when = '<span class="t">' + U.esc(t.t) + (t.p ? "<sup>" + U.esc(t.p) + "</sup>" : "") + '</span><span class="sub">FINAL</span>';
    var title = m.b.n ? U.esc(m.a.n) + " vs. " + U.esc(m.b.n) : U.esc(m.a.n);
    var has = st !== "pre" && m.a.s !== "";
    var sub = '<span class="lg">' + U.esc(m.league) + "</span>" + (has ? '<b class="ms">' + U.esc(m.a.s) + " – " + U.esc(m.b.s) + "</b>" : "") + (m.servers && m.servers.length ? '<span class="sig">' + m.servers.length + " señal" + (m.servers.length > 1 ? "es" : "") + "</span>" : "");
    var score = has ? '<div class="score">' + U.esc(m.a.s) + " – " + U.esc(m.b.s) + (live && m.detail ? "<small>" + U.esc(m.detail) + "</small>" : "") + "</div>" : "";
    return '<button type="button" class="row ' + (live ? "live" : st === "post" ? "done" : "") + '" data-i="' + i + '"><div class="when">' + when + "</div>" + thumb(m) + '<div class="info"><h3>' + title + "</h3><p" + (has ? ' class="sc"' : "") + ">" + sub + "</p></div>" + score + "</button>";
  }

  /* ── lista de partidos del día ── */
  function dayMatches() {
    var q = S.q.trim().toLowerCase(), out = [], i, m, d;
    for (i = 0; i < S.matches.length; i++) {
      m = S.matches[i]; d = new Date(m.start);
      if (isNaN(d.getTime()) || U.ymd(d) !== S.day) continue;
      if (S.mode === "live" && A.stateOf(m) !== "in") continue;
      if (q && (m.a.n + " " + m.b.n + " " + m.league).toLowerCase().indexOf(q) < 0) continue;
      out.push(m);
    }
    return out;
  }
  function ymdDate(y) { return new Date(+y.slice(0, 4), +y.slice(4, 6) - 1, +y.slice(6, 8)); }
  function dayLabel(ymd) {
    var t = U.ymd(new Date()), tm = U.ymd(U.addDays(new Date(), 1)), d = ymdDate(ymd);
    return ymd === t ? "Hoy" : ymd === tm ? "Mañana" : U.dow(d).charAt(0).toUpperCase() + U.dow(d).slice(1);
  }
  function dayShort(y) { var d = ymdDate(y); return U.dow(d) + " " + d.getDate() + " " + U.mon(d); }
  /** Primer día (local) posterior al elegido con eventos ya cargados: carreras, carteleras y torneos suelen estar semanas más adelante. */
  function nextDayWith() {
    var best = "", i, y;
    for (i = 0; i < S.matches.length; i++) { y = U.ymd(new Date(S.matches[i].start)); if (y > S.day && (!best || y < best)) best = y; }
    return best;
  }

  function renderEvents() {
    var list = U.$("list"), arr = dayMatches(), live = [], rest = [], finished = [], i, st;
    A.view = arr;
    if (S.loading && !arr.length) return skeleton();   // mientras llegan los datos de este día: esqueletos, nunca un «vacío» falso
    if (!arr.length) {
      var nx = S.mode === "events" && !S.q ? nextDayWith() : "";
      list.innerHTML = emptyHTML(S.mode === "live" ? "Nada en vivo ahora mismo" : S.day === U.ymd(new Date()) ? "No se encontró nada hoy" : "No se encontró nada este día",
        S.mode === "live" ? "Mira «Todos» para ver lo que viene." : "Prueba con otro día o con otro deporte." + (nx ? '<br><button type="button" class="btn-w" data-d="' + nx + '">Ver el próximo: ' + dayShort(nx) + "</button>" : ""));
      list.setAttribute("aria-busy", "false");
      return;
    }
    for (i = 0; i < arr.length; i++) { st = A.stateOf(arr[i]); (st === "in" ? live : st === "post" ? finished : rest).push(arr[i]); }
    var items = [];
    function block(title, cls, group) {
      if (!group.length) return;
      items.push({ h: '<div class="gh ' + cls + '">' + title + "</div>" });
      for (var k = 0; k < group.length; k++) items.push({ r: true, h: rowHTML(group[k], A.view.indexOf(group[k])) });
    }
    block("En vivo", "live", live);
    block(dayLabel(S.day) + " · " + U.mon(ymdDate(S.day)), "", rest);
    block("Finalizados", "", finished);
    feedStart(items);
  }

  /* ── lista incremental: se pintan unas pocas filas y el resto llega al acercarse al final (menos DOM = scroll fluido a 30, 60, 75, 120 o 165 Hz) ── */
  var feed = { items: [], pos: 0, io: null };
  function feedStart(items) {
    var list = U.$("list");
    feed.items = items; feed.pos = 0;
    list.innerHTML = ""; list.setAttribute("aria-busy", "false");
    feedMore(PAGE);
  }
  function feedMore(rows) {
    var list = U.$("list"), html = "", n = 0, it, old = U.$("sentinel");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    while (feed.pos < feed.items.length && n < rows) { it = feed.items[feed.pos++]; html += it.h; if (it.r) n++; }
    while (feed.pos < feed.items.length && !feed.items[feed.pos].r) html += feed.items[feed.pos++].h;   // un encabezado nunca queda solo al final de un tramo
    list.insertAdjacentHTML("beforeend", html);
    if (feed.pos < feed.items.length) {
      list.insertAdjacentHTML("beforeend", '<div id="sentinel" class="sentinel"><button type="button" class="more" id="more">Ver más</button></div>');
      if (w.IntersectionObserver) {
        if (feed.io) feed.io.disconnect();
        feed.io = new w.IntersectionObserver(function (es) { if (es[0].isIntersecting) { feed.io.disconnect(); feedMore(PAGE); } }, { rootMargin: "1400px 0px" });
        feed.io.observe(U.$("sentinel"));
      }
    }
    lazyScan(list); markLoaded(list);
  }

  /* ── esqueletos con la forma real de cada fila (partido, canal, noticia) ── */
  function skelRows(n, kind) {
    var h = '<div class="sk skel-gh"></div>', i;
    for (i = 0; i < n; i++) {
      if (kind === "ch") h += '<div class="skel-row ch"><i class="sk t"></i><div class="l"><i class="sk a"></i><i class="sk b"></i></div></div>';
      else if (kind === "nw") h += '<div class="skel-row nw"><i class="sk t"></i><div class="l"><i class="sk a"></i><i class="sk a" style="width:55%"></i><i class="sk b"></i></div></div>';
      else h += '<div class="skel-row"><i class="sk w"></i><i class="sk t"></i><div class="l"><i class="sk a"></i><i class="sk b"></i></div></div>';
    }
    return h;
  }
  function skeleton(kind) { var l = U.$("list"); l.setAttribute("aria-busy", "true"); l.innerHTML = skelRows(kind === "nw" ? 6 : 7, kind); }
  /* miniaturas: fondo fijo hasta que carga la imagen, luego se muestra */
  function markLoaded(root) {
    var imgs = root.querySelectorAll(".thumb img, .logo img"), i, im;
    for (i = 0; i < imgs.length; i++) { im = imgs[i]; if (!im.getAttribute("data-src") && im.complete && im.naturalWidth > 1) done(im); }
  }
  function done(im) { var p = im.closest ? im.closest(".thumb, .logo") : null; if (p) p.className += p.className.indexOf(" ld") < 0 ? " ld" : ""; }
  function emptyHTML(title, text) { return '<div class="empty"><img class="empty-logo" src="img/logo-96.png" width="72" height="72" alt=""><b>' + title + "</b>" + text + "</div>"; }

  /* ── canales 24/7 (servidor: sitios de agenda + listas IPTV comprobadas) ── */
  function renderChannels() {
    var list = U.$("list"), id = ++reqId;
    skeleton("ch");
    function draw(chs) {
      if (id !== reqId) return;
      var q = S.q.trim().toLowerCase();
      if (q) chs = chs.filter(function (c) { return c.n.toLowerCase().indexOf(q) >= 0; });
      A.chs = chs;
      if (!chs.length) { list.innerHTML = emptyHTML("Sin canales", "No hay canales para este deporte."); return; }
      var items = [{ h: '<div class="gh">Canales en vivo</div>' }], i, c;
      for (i = 0; i < chs.length; i++) {
        c = chs[i];
        items.push({ r: true, h: '<button type="button" class="row ch" data-c="' + i + '"><div class="logo' + (c.l ? "" : " noimg") + '">' + (c.l ? lzImg("", c.l) : U.esc(c.n.charAt(0).toUpperCase())) + '</div><div class="info"><h3>' + U.esc(c.n) + "</h3><p>Canal 24/7</p></div></button>" });
      }
      feedStart(items);
    }
    D.channels(S.sport, draw).then(draw, function () { if (id === reqId) list.innerHTML = '<div class="empty"><b>No se pudo cargar la lista</b>Revisa tu conexión e inténtalo de nuevo.</div>'; });
  }

  /* ── noticias: solo recientes, agrupadas en Hoy / Ayer / Esta semana, con «hace X» ── */
  function ago(ts) {
    var m = Math.max(1, Math.round((Date.now() - ts) / 6e4));
    if (m < 60) return "hace " + m + " min";
    var h = Math.round(m / 60); if (h < 24) return "hace " + h + " h";
    var d = Math.round(h / 24); return "hace " + d + (d === 1 ? " día" : " días");
  }
  function renderNews(force) {
    var list = U.$("list"), id = ++reqId, url = "api/news?sport=" + S.sport;
    if (!list.querySelector(".news")) skeleton("nw");
    function draw(d) {
      if (id !== reqId) return;
      var items = (d && d.items) || [], html = "", i, it, g, last = "", t0 = new Date(); t0.setHours(0, 0, 0, 0);
      if (!items.length) { list.innerHTML = emptyHTML("Sin noticias recientes", 'Aún no hay titulares de los últimos días. <button type="button" class="btn-w sm" id="news-refresh">Actualizar</button>'); return; }
      var upd = D.age(url);
      html += '<div class="gh news-h">Últimas noticias<span class="upd">' + (upd ? "Actualizado " + ago(upd) + " · " : "") + '<button type="button" class="btn-w sm" id="news-refresh">Actualizar</button></span></div>';
      for (i = 0; i < items.length; i++) {
        it = items[i];
        g = it.ts >= t0.getTime() ? "Hoy" : it.ts >= t0.getTime() - 864e5 ? "Ayer" : "Esta semana";
        if (g !== last) { html += '<div class="gh sub">' + g + "</div>"; last = g; }
        html += '<a class="news row" href="' + U.esc(it.link) + '" target="_blank" rel="noopener noreferrer"><div class="thumb">' + (it.img ? lzImg("", it.img) : "") + '</div><div class="info"><h3>' + U.esc(it.title) + "</h3><p>" + U.esc(it.source) + " · " + ago(it.ts) + "</p></div></a>";
      }
      list.innerHTML = html; list.setAttribute("aria-busy", "false"); lazyScan(list); markLoaded(list);
    }
    D.news(S.sport, { force: force, onFresh: draw }).then(draw, function () { if (id === reqId) list.innerHTML = '<div class="empty"><b>No se pudieron cargar las noticias</b>Revisa tu conexión. <button type="button" class="btn-w sm" id="news-refresh">Reintentar</button></div>'; });
  }

  /** Huella de lo que se ve de cada partido: si no cambió entre dos actualizaciones, no se repinta. */
  function signature(list) {
    var h = "", i, m;
    for (i = 0; i < list.length; i++) { m = list[i]; h += m.id + A.stateOf(m) + m.a.s + m.b.s + (m.detail || "") + (m.servers ? m.servers.length : 0) + "|"; }
    return U.hash(h) + ":" + list.length;
  }

  /* ── datos de la agenda ── */
  function load(force) {
    var sport = S.sport, day = S.day;   // (no toca reqId: ese contador es solo de canales y noticias)
    function apply(d) { // fusiona la ventana recibida (sin duplicados) con lo que ya hay de este deporte
      if (sport !== S.sport) return;
      var seen = {}, out = [], list = (S.matches || []).concat((d && d.matches) || []), i;
      for (i = list.length - 1; i >= 0; i--) { if (seen[list[i].id]) continue; seen[list[i].id] = 1; out.push(list[i]); }
      S.matches = out.reverse(); S.loading = false; learnLogos(S.matches);
      stamp(d && d.at);
      var sig = signature(S.matches);
      if (sig === S.sig && S.rendered === S.day + S.mode + S.q) { hideSplash(); return; }   // sin cambios: no se vuelve a pintar la lista (evita tirones)
      S.sig = sig; S.rendered = S.day + S.mode + S.q;
      if (S.mode === "events" || S.mode === "live") renderEvents();
      if (w.P) P.update(S.matches);
      hideSplash();
    }
    S.loading = true;
    if (!S.matches.length && (S.mode === "events" || S.mode === "live")) skeleton();
    return D.schedule(sport, day, { force: force, onFresh: apply }).then(apply, function () {
      if (sport !== S.sport) return;
      S.loading = false; hideSplash();
      if (S.matches.length) U.toast("Sin conexión: mostrando datos guardados");
      else { U.$("list").innerHTML = emptyHTML("No se pudo cargar la agenda", "Revisa tu conexión; reintentaremos automáticamente."); U.$("list").setAttribute("aria-busy", "false"); }
    });
  }
  /** «Actualizado 12:04:31»: hora del dato que se está viendo (la que fijó el servidor), no la del reloj del teléfono. */
  function stamp(iso) {
    var el = U.$("upd-time"), d = iso ? new Date(iso) : new Date();
    if (el && !isNaN(d.getTime())) el.textContent = "Actualizado " + U.pad(d.getHours()) + ":" + U.pad(d.getMinutes()) + ":" + U.pad(d.getSeconds());
  }
  /** Botón «Actualizar en vivo»: pide los datos saltándose todas las cachés. */
  function refreshLive() {
    var b = U.$("refresh-btn"); if (!b || b.disabled) return;
    b.disabled = true; var old = b.textContent; b.textContent = "Actualizando…";
    var p = load(true);
    (p && p.then ? p : Promise.resolve()).then(function () { b.disabled = false; b.textContent = old; }, function () { b.disabled = false; b.textContent = old; });
  }

  function render() {
    document.body.setAttribute("data-sport", S.sport); document.documentElement.setAttribute("data-sport", S.sport); U.setTheme(S.sport);
    U.$("sport-label").textContent = SPORTS[S.sport];
    Array.prototype.forEach.call(U.$("sport-menu").children, function (li) { li.setAttribute("aria-selected", li.getAttribute("data-sport") === S.sport ? "true" : "false"); });
    Array.prototype.forEach.call(document.querySelectorAll(".mode"), function (b) { b.className = "mode" + (b.getAttribute("data-mode") === S.mode ? " on" : ""); });
    var evt = S.mode === "events" || S.mode === "live";
    U.$("days-h").style.display = evt ? "" : "none";
    U.$("rail").style.visibility = evt ? "" : "hidden";
    U.$("q").parentNode.style.display = S.mode === "news" ? "none" : "";
    U.$("live-bar").style.display = evt ? "" : "none";
    if (evt) { renderDays(); renderEvents(); } else { hideSplash(); if (S.mode === "channels") renderChannels(); else renderNews(); }
    document.title = SPORTS[S.sport] + " en vivo · TatoTV";
  }

  /* ── calendario: 7 días (lateral en escritorio, tira horizontal en móvil) ── */
  function renderDays() {
    var rail = "", chips = "", i, d, y, on;
    for (i = 0; i < 7; i++) {
      d = U.addDays(new Date(), i); y = U.ymd(d); on = y === S.day;
      rail += '<button type="button" class="day' + (on ? " on" : "") + '" data-d="' + y + '" aria-pressed="' + on + '"><small>' + (on ? U.mon(d) : U.dow(d)) + '</small><span class="dn">' + d.getDate() + "</span></button>";
      chips += '<button type="button" class="chip' + (on ? " on" : "") + '" data-d="' + y + '" role="tab" aria-selected="' + on + '"><small>' + (i === 0 ? "hoy" : U.dow(d)) + "</small>" + d.getDate() + "</button>";
    }
    if (S.day > U.ymd(U.addDays(new Date(), 6))) {   // día lejano elegido con «Ver el próximo»
      d = ymdDate(S.day);
      rail += '<button type="button" class="day on" data-d="' + S.day + '" aria-pressed="true"><small>' + U.mon(d) + '</small><span class="dn">' + d.getDate() + "</span></button>";
      chips += '<button type="button" class="chip on" data-d="' + S.day + '" role="tab" aria-selected="true"><small>' + U.dow(d) + "</small>" + d.getDate() + "</button>";
    }
    U.$("rail").innerHTML = rail; U.$("days-h").innerHTML = chips;
  }

  /* ── acciones ── */
  function setSport(s) {
    if (!SPORTS[s] || s === S.sport) return closeMenu();
    S.sport = s; S.matches = []; S.q = ""; S.sig = ""; S.rendered = ""; U.$("q").value = "";
    S.day = U.ymd(new Date()); S.today = S.day;   // cada deporte empieza en HOY (antes arrastraba el día elegido en el anterior)
    U.store.set("sport", s); closeMenu(); render();
    if (S.mode === "events" || S.mode === "live") load();
    try { history.replaceState(null, "", location.pathname); } catch (e) { /* nada */ }
  }
  function setMode(m) { S.mode = m; S.rendered = ""; render(); if (m === "events" || m === "live") load(); }
  function setDay(d) { S.day = d; S.rendered = ""; renderDays(); renderEvents(); S.rendered = S.day + S.mode + S.q; load(); }
  function closeMenu() { U.$("sport-menu").hidden = true; U.$("sport-btn").setAttribute("aria-expanded", "false"); }

  function bind() {
    var btn = U.$("sport-btn"), menu = U.$("sport-menu"), qT;
    menu.innerHTML = U.SPORTS.map(function (x) { return '<li role="option" data-sport="' + x.k + '">' + U.esc(x.n) + "</li>"; }).join("");
    btn.onclick = function (e) { e.stopPropagation(); var o = menu.hidden; menu.hidden = !o; btn.setAttribute("aria-expanded", String(o)); if (o) menu.firstElementChild.focus(); };
    menu.onclick = function (e) { var li = e.target.closest ? e.target.closest("li") : null; if (li) setSport(li.getAttribute("data-sport")); };
    menu.tabIndex = -1;
    Array.prototype.forEach.call(menu.children, function (li) {
      li.tabIndex = 0;
      li.onkeydown = function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSport(li.getAttribute("data-sport")); }
        else if (e.key === "ArrowDown" && li.nextElementSibling) li.nextElementSibling.focus();
        else if (e.key === "ArrowUp" && li.previousElementSibling) li.previousElementSibling.focus();
        else if (e.key === "Escape") { closeMenu(); btn.focus(); }
      };
    });
    document.addEventListener("click", closeMenu);
    U.$("modes").onclick = function (e) { var b = e.target.closest ? e.target.closest(".mode") : null; if (b) setMode(b.getAttribute("data-mode")); };
    function days(e) { var b = e.target.closest ? e.target.closest("[data-d]") : null; if (b) setDay(b.getAttribute("data-d")); }
    U.$("rail").onclick = days; U.$("days-h").onclick = days;
    U.$("refresh-btn").onclick = refreshLive;
    U.$("q").oninput = function () { clearTimeout(qT); qT = setTimeout(function () { S.q = U.$("q").value; if (S.mode === "channels") renderChannels(); else renderEvents(); }, 140); };
    U.$("list").addEventListener("click", function (e) {
      var t = e.target; if (!t.closest) return;
      if (t.closest("#news-refresh")) { renderNews(true); return; }
      var nd = t.closest("[data-d]"); if (nd && nd.className.indexOf("btn-w") >= 0) { setDay(nd.getAttribute("data-d")); return; }
      if (t.closest("#more")) { feedMore(PAGE); return; }
      var r = t.closest(".row"); if (!r) return;
      if (r.hasAttribute("data-i")) { var mm = A.view[+r.getAttribute("data-i")]; if (w.Legal && !Legal.accepted()) { A.pendingMatch = mm; Legal.gate(); } else P.openMatch(mm); }
      else if (r.hasAttribute("data-c")) { if (w.Legal && !Legal.accepted()) Legal.gate(); else P.openChannel(A.chs[+r.getAttribute("data-c")]); }
    });
    U.$("list").addEventListener("load", function (e) { if (e.target && e.target.tagName === "IMG") done(e.target); }, true);
    /* escudo que no carga → insignia con iniciales (sin reintentos de red) */
    U.$("list").addEventListener("error", function (e) {
      var im = e.target; if (!im || !im.classList || !im.classList.contains("crest")) return;
      var tmp = document.createElement("div"); tmp.innerHTML = badge(im.getAttribute("data-n"), im.getAttribute("data-side"));
      im.parentNode.replaceChild(tmp.firstChild, im); done(tmp.firstChild);
    }, true);
    function net() { U.$("net-state").hidden = navigator.onLine !== false; }
    w.addEventListener("online", function () { net(); if (S.mode === "events" || S.mode === "live") load(true); }); w.addEventListener("offline", net); net();
  }

  /** Si la app queda abierta y pasa la medianoche, «hoy» se mueve (solo si se estaba viendo el día que era hoy). */
  function rollDay() {
    var t = U.ymd(new Date());
    if (S.today && S.today !== t) { if (S.day === S.today) { S.day = t; S.rendered = ""; renderDays(); renderEvents(); load(); } S.today = t; }
    if (!S.today) S.today = t;
  }
  /* Refresco automático: cada 20 s si se ve algo en vivo o hay un reproductor abierto, cada 60 s si no (el CDN reparte una misma respuesta de ≤ 15 s entre todos los
     visitantes). También al volver a la app, al recuperar la conexión y al mostrarse desde la caché de páginas del navegador (pageshow). */
  function anyLive() { var v = A.view || [], i; for (i = 0; i < v.length; i++) if (A.stateOf(v[i]) === "in") return true; return false; }
  function tick() {
    rollDay();
    if (!document.hidden && (S.mode === "events" || S.mode === "live")) { if (S.day === U.ymd(new Date())) load(false); else renderEvents(); }
    schedule();
  }
  function schedule() {
    clearTimeout(pollT);
    var fast = (w.P && P.isOpen()) || anyLive();
    pollT = setTimeout(tick, (fast ? 20000 : 60000) * (U.lite ? 2 : 1));
  }
  function poll() {
    schedule();
    function wake() {
      if (document.hidden) return;
      rollDay();
      if (S.mode === "events" || S.mode === "live") load(false);
      else if (S.mode === "news" && Date.now() - D.age("api/news?sport=" + S.sport) > 20 * 6e4) renderNews(false);
      schedule();
    }
    document.addEventListener("visibilitychange", wake);
    w.addEventListener("pageshow", function (e) { if (e.persisted) wake(); });
    w.addEventListener("focus", wake);
  }

  /* ── PWA: registro del Service Worker, aviso de versión nueva e instalación ── */
  function registerSW() {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    // En desarrollo (localhost) no se usa Service Worker: así siempre se ve el último código. Para probarlo allí: ?sw=1 (y ?sw=0 para quitarlo).
    var dev = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (/[?&]sw=1/.test(location.search)) U.store.set("devsw", 1);
    if (/[?&]sw=0/.test(location.search)) U.store.del("devsw");
    if (dev && !U.store.get("devsw")) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { r.unregister(); });
        if (regs.length && w.caches) w.caches.keys().then(function (n) { n.forEach(function (k) { if (/^ttv-/.test(k)) w.caches.delete(k); }); });
      }).catch(function () { /* nada */ });
      return;
    }
    var hadController = !!navigator.serviceWorker.controller;
    // La versión nueva se activa sola. Cuando toma el control (o build.json anuncia otra versión) aparece el aviso «Actualizar», como en TatoCine.
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) { hadController = true; return; }      // primera instalación: no hay nada que avisar
      showUpdate();
    });
    w.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
        setInterval(function () { try { reg.update(); } catch (e) { /* nada */ } checkBuild(); }, 30 * 60 * 1000);
        document.addEventListener("visibilitychange", function () { if (!document.hidden) { try { reg.update(); } catch (e) { /* nada */ } checkBuild(); } });
        setTimeout(checkBuild, 4000);
      }).catch(function () { /* sin SW también funciona */ });
    });
  }

  /* ── aviso «Hay una versión nueva» ──
     Dos señales independientes (cualquiera basta): 1) el Service Worker nuevo tomó el control; 2) /build.json (siempre de la red) trae otra versión que la de esta página.
     «Actualizar» borra el Service Worker y las cachés del shell y recarga: se vuelve a bajar TODO, aunque la versión anterior estuviera atascada. */
  var MY_BUILD = (function () { var m = document.querySelector('meta[name="ttv-build"]'); return m ? m.getAttribute("content") : ""; })();
  function showUpdate() {
    var box = U.$("update"); if (!box || !box.hidden) return;
    box.hidden = false;
    U.$("update-btn").onclick = refreshApp;
    U.$("update-later").onclick = function () { box.hidden = true; };
  }
  function refreshApp() {
    var go = function () { location.replace(location.href.split("#")[0]); };
    var p1 = navigator.serviceWorker && navigator.serviceWorker.getRegistrations ? navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }) : Promise.resolve();
    var p2 = w.caches ? w.caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return /^ttv-shell-/.test(k); }).map(function (k) { return w.caches.delete(k); })); }) : Promise.resolve();
    Promise.all([p1.catch(function () { /* nada */ }), p2.catch(function () { /* nada */ })]).then(go, go);
    setTimeout(go, 3000);
  }
  function checkBuild() {
    if (!MY_BUILD || MY_BUILD.indexOf("__") === 0 || document.hidden || navigator.onLine === false) return;
    fetch("build.json?_=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.v && j.v !== MY_BUILD) showUpdate(); }).catch(function () { /* sin red */ });
  }

  function setupInstall() {
    var btns = document.querySelectorAll('[data-act="install"]'), deferred = null, i;
    var standalone = (w.matchMedia && w.matchMedia("(display-mode: standalone)").matches) || w.navigator.standalone;
    function show(on) { for (i = 0; i < btns.length; i++) btns[i].hidden = !on; }
    if (standalone) return;
    w.addEventListener("beforeinstallprompt", function (e) { deferred = e; show(true); });   // sin preventDefault: Chrome muestra además su propio aviso
    w.addEventListener("appinstalled", function () { show(false); deferred = null; U.toast("TatoTV instalada"); });
    // iOS Safari no dispara beforeinstallprompt: se explica el gesto manual
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)) show(true);
    document.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest('[data-act="install"]') : null; if (!b) return;
      if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; show(false); }); }
      else U.toast("En Safari: Compartir → Añadir a pantalla de inicio");
    });
  }

  /* ── splash: se retira cuando ya hay datos pintados (mínimo 700 ms para que se vea el logo; tope 6 s) ── */
  var splashAt = Date.now(), splashDone = false;
  function hideSplash() {
    if (splashDone) return; splashDone = true;
    var el = U.$("splash"); if (!el) { if (w.Legal) Legal.gate(); return; }
    function remove() { el.className = "splash out"; if (el.parentNode) el.parentNode.removeChild(el); if (w.Legal) Legal.gate(); }
    // el splash no se quita hasta que el fondo del deporte está cargado y decodificado (si no, se ve un destello negro → imagen); tope 1,5 s
    function whenBg(cb) {
      var bg = document.querySelector(".bg"), u = bg && w.getComputedStyle ? (/url\(["']?([^"')]+)/.exec(w.getComputedStyle(bg).backgroundImage) || [])[1] : "", done = false, im;
      function go() { if (done) return; done = true; cb(); }
      if (!u) return cb();
      im = new Image(); im.onload = function () { if (im.decode) im.decode().then(go, go); else go(); }; im.onerror = go; im.src = u;
      setTimeout(go, 1500);
    }
    setTimeout(function () { whenBg(remove); }, Math.max(0, 700 - (Date.now() - splashAt)));
  }
  A.hideSplash = hideSplash;
  setTimeout(hideSplash, 6000);

  A.init = function () {
    var q = /[?&]sport=(\w+)/.exec(location.search), saved = U.store.get("sport");
    S.sport = SPORTS[q && q[1]] ? q[1] : SPORTS[saved] ? saved : "football";
    U.store.set("sport", S.sport);   // recuerda el deporte: la próxima vez se abre este
    var md = /[?&]mode=(events|live|channels|news)/.exec(location.search); if (md) S.mode = md[1];
    var qq = /[?&]q=([^&]+)/.exec(location.search); if (qq) { try { S.q = decodeURIComponent(qq[1].replace(/\+/g, " ")); U.$("q").value = S.q; } catch (e) { /* nada */ } }
    if (w.Legal) { Legal.mount(); Legal.afterAccept = function () { if (A.pendingMatch) { var m = A.pendingMatch; A.pendingMatch = null; P.openMatch(m); } }; }
    P.init(); bind(); render(); if (S.mode === "events" || S.mode === "live") load(); poll(); registerSW(); setupInstall();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", A.init); else A.init();
})(window);
