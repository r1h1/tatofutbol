/* TatoTV · player.js — reproductor modal.
   Estrategia por servidor:  página con reproductor → /api/resolve intenta sacar el .m3u8 → hls.js (por el proxy /api/hls, con el Referer que exige el origen)
   → si falla, la propia página se incrusta en un iframe.  Canales M3U: directo (si el origen permite CORS) y, si no, por el proxy.
   hls.js solo se descarga la primera vez que se reproduce algo. */
(function (w) {
  "use strict";
  var P = (w.P = {});
  var el = {}, hls = null, cur = null, token = 0, lastFocus = null;

  function $(id) { return U.$(id); }
  function msg(text, err) {
    el.msg.className = "p-msg" + (err ? " err" : "");
    el.msg.innerHTML = '<img class="pulse" src="img/logo-96.png" width="64" height="64" alt="">' + (text ? "<span>" + U.esc(text) + "</span>" : "");
    el.msg.hidden = false;
  }
  function stop() {
    token++; watch(false);
    if (hls) { try { hls.destroy(); } catch (e) { /* nada */ } hls = null; }
    try { el.video.pause(); el.video.removeAttribute("src"); el.video.load(); } catch (e) { /* nada */ }
    el.video.hidden = true;
    if (el.live) { el.live.hidden = true; el.pip.hidden = true; }
    el.frame.hidden = true;
    if (el.frame.getAttribute("src")) el.frame.removeAttribute("src");
  }
  function proxy(url, ref) { return "api/hls?u=" + encodeURIComponent(url) + (ref ? "&r=" + encodeURIComponent(ref) : ""); }

  /* iframe con «sandbox»: sin ventanas emergentes ni redirecciones de la página superior (los anuncios intrusivos de los embeds quedan bloqueados).
     Algunos reproductores se niegan a funcionar con sandbox → botón «sin bloqueo» que lo recarga sin restricciones. */
  function showFrame(url, why, open) {
    stop();
    if (open) el.frame.removeAttribute("sandbox"); else el.frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock");
    el.frame.hidden = false; el.frame.src = url; el.msg.hidden = true;
    el.hint.innerHTML = (why ? U.esc(why) + " " : "") + (open ? "" : '¿No carga? <button type="button" class="btn-w sm" id="p-unsandbox">Probar sin bloqueo de ventanas</button> · ') + '<a href="' + U.esc(url) + '" target="_blank" rel="noopener noreferrer">abrir en pestaña nueva</a> · o prueba otro servidor.';
    var b = $("p-unsandbox"); if (b) b.onclick = function () { showFrame(url, why, true); };
  }
  /* ── Estado de cada señal ──
     state[i]: "chk" (verificando) · "ok" (hay vídeo) · "off" (sin señal). Se pinta como un punto de color + una etiqueta. */
  var state = {}, tags = {}, curM = null;
  function paint() {
    var all = el.servers.querySelectorAll("button.srv"), i, k, t;
    for (i = 0; i < all.length; i++) {
      k = +all[i].getAttribute("data-i");
      all[i].className = "srv" + (cur && cur.i === k ? " on" : state[k] ? " " + state[k] : "");
      t = all[i].querySelector(".srv-t"); if (t) t.textContent = tags[k] || "";
    }
  }
  function setState(idx, v, tag) { state[idx] = v; if (tag != null) tags[idx] = tag; paint(); }

  /* Memoria local: qué dominios funcionaron últimamente (puntaje -5…5) y cuál fue la última señal buena de cada partido → se ofrecen primero. */
  function load(k) { try { return JSON.parse(w.localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function save(k, v) { try { w.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } }
  var hscore = load("ttv:hs"), lastOk = load("ttv:last");
  function hostOf(u) { var m = /^https?:\/\/([^\/:?#]+)/i.exec(String(u)); return m ? m[1].toLowerCase() : ""; }
  function bump(u, d) { var h = hostOf(u); if (!h) return; hscore[h] = Math.max(-5, Math.min(5, (hscore[h] || 0) + d)); save("ttv:hs", hscore); }
  function remember(m, s) {
    if (!m || !m.id) return;
    lastOk[m.id] = norm(s.url);
    var ks = Object.keys(lastOk); if (ks.length > 40) delete lastOk[ks[0]];
    save("ttv:last", lastOk);
  }
  /** Orden: última señal buena del partido → prioridad de la fuente (enlaces ligeros primero) → dominios que funcionaron → orden original. */
  function order(list, m) {
    var last = m && lastOk[m.id];
    return list.map(function (s, i) { return { s: s, i: i }; }).sort(function (a, b) {
      var la = last && norm(a.s.url) === last ? 0 : 1, lb = last && norm(b.s.url) === last ? 0 : 1;
      if (la !== lb) return la - lb;
      var pa = a.s.pri || 5, pb = b.s.pri || 5;
      if (pa !== pb) return pa - pb;
      var ha = hscore[hostOf(a.s.url)] || 0, hb = hscore[hostOf(b.s.url)] || 0;
      return hb - ha || a.i - b.i;
    }).map(function (x) { return x.s; });
  }

  /* ── Resolución (servidor → lista HLS). Las primeras señales se resuelven EN PARALELO al abrir el partido: si la primera falla, la siguiente ya está lista. ── */
  var rc = {};
  function resolveUrl(u, force) {
    var c = rc[u];
    if (!force && c && Date.now() - c.t < 120000) return c.p;
    var p = fetch("api/resolve?url=" + encodeURIComponent(u) + (force ? "&n=" + Date.now() : "")).then(function (r) { return r.ok ? r.json() : { stream: null }; }, function () { return { stream: null }; });
    rc[u] = { t: Date.now(), p: p };
    return p;
  }
  function precheck(s, idx, ot) {
    if (s.kind !== "embed") return;
    if (!state[idx]) setState(idx, "chk");
    resolveUrl(s.url).then(function (r) {
      if (ot !== openToken || el.root.hidden) return;
      if (r.stream) setState(idx, "ok", "Directo");
      else if (r.dead) setState(idx, "off", "Sin señal");
      else if (r.blocked) setState(idx, "off", "Protegido");
      else setState(idx, "ok", "Reproductor");
    });
  }

  /** Reproduce un .m3u8 con hls.js (o HLS nativo en Safari/iOS). `urls` = intentos en orden; si uno falla se prueba el siguiente y, al agotarse, onFail. */
  function playHls(urls, onFail, onOk) {
    var my = token, i = 0, giveUp;
    function next(reason) {
      if (my !== token) return;
      if (hls) { try { hls.destroy(); } catch (e) { /* nada */ } hls = null; }
      if (i >= urls.length) return onFail(reason);
      start(urls[i++]);
    }
    function ok() {
      if (my !== token) return;
      clearTimeout(giveUp); el.msg.hidden = true; el.video.hidden = false;
      var pr = el.video.play(); if (pr && pr.catch) pr.catch(function () { /* el usuario pulsará play */ });
      if (onOk) onOk();
    }
    function start(src) {
      clearTimeout(giveUp);
      giveUp = setTimeout(function () { next("tiempo agotado"); }, i === 1 ? 10000 : 8000);
      if (w.Hls && w.Hls.isSupported()) {
        // capLevelToPlayerSize: no baja más resolución de la que cabe en el reproductor (menos datos y menos carga en el proxy)
        hls = new w.Hls({ lowLatencyMode: false, capLevelToPlayerSize: true, maxBufferLength: 20, backBufferLength: 20, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 3, manifestLoadingTimeOut: 8000 });
        hls.on(w.Hls.Events.MANIFEST_PARSED, ok);
        hls.on(w.Hls.Events.ERROR, function (e, d) {
          if (!d.fatal) return;
          if (d.type === w.Hls.ErrorTypes.MEDIA_ERROR && hls && !el.video.hidden) { try { hls.recoverMediaError(); return; } catch (x) { /* sigue */ } }
          clearTimeout(giveUp); next(d.details);
        });
        hls.loadSource(src); hls.attachMedia(el.video);
      } else if (el.video.canPlayType("application/vnd.apple.mpegurl")) {
        el.video.onloadedmetadata = ok; el.video.onerror = function () { clearTimeout(giveUp); next("nativo"); };
        el.video.src = src;
      } else { clearTimeout(giveUp); onFail("sin soporte HLS"); }
    }
    U.loadScript("js/vendor/hls.min.js").then(function () { next(); }, function () { next(); });
  }

  /** Vigilante: si el vídeo está «reproduciendo» pero la imagen no avanza (señal congelada), intenta recuperar y, si sigue igual, salta a otra señal. */
  var wd = null, lastT = -1, still = 0;
  function watch(on) {
    clearInterval(wd); wd = null; lastT = -1; still = 0;
    if (!on) return;
    wd = setInterval(function () {
      var v = el.video;
      if (v.paused || v.seeking || v.ended || v.hidden || document.hidden) { still = 0; return; }
      if (Math.abs(v.currentTime - lastT) < 0.05) still++; else { still = 0; lastT = v.currentTime; }
      if (still === 2 && hls) { try { hls.recoverMediaError(); } catch (e) { /* nada */ } }
      if (still >= 4 && cur) { var i = cur.i; watch(false); fail(i, curM, "La señal se detuvo."); }
    }, 4000);
  }

  function now(s, how) { var n = $("p-now"); if (n) n.innerHTML = s ? "Reproduciendo <b>" + U.esc(s.name) + "</b>" + (how ? " · " + how : "") : ""; }

  /** Señal sin vídeo: se marca, se anota en la memoria local y se pasa a la siguiente que no se haya descartado. */
  function fail(idx, m, why) {
    setState(idx, "off", tags[idx] === "Protegido" ? "Protegido" : "Sin señal");
    if (cur && cur.s) bump(cur.s.url, -1);
    nextServer(idx, m, why);
  }
  function go(k) { playServer(svs[k].s, k, svs[k].m, true); }
  function nextServer(idx, m, why, wrap) {
    var n = serverCount, k;
    for (k = idx + 1; k < n; k++) if (svs[k] && state[k] !== "off") return go(k);
    if (wrap) for (k = 0; k < n; k++) if (k !== idx && svs[k] && state[k] !== "off") return go(k);
    msg((why || "Esta señal no responde.") + " Prueba otra señal o un canal 24/7.", true);
  }
  /** Señal con vídeo directo ya verificada (más ligera y sin anuncios) distinta de la actual. */
  function directAlt(idx) { var n = serverCount, k; for (k = 0; k < n; k++) if (k !== idx && svs[k] && state[k] === "ok" && tags[k] === "Directo") return k; return -1; }

  /** Servidor de tipo «embed»: el servidor extrae la lista HLS (sin navegador) y la reproduce NUESTRO reproductor.
   *  Va DIRECTO desde el navegador solo si la lista lo permite (CORS abierto, sin token atado a la IP); si no, por el proxy. Si falla, un reintento con resolución nueva (token caducado o nodo distinto). */
  function startEmbed(s, idx, m, force, auto) {
    var my = token;
    resolveUrl(s.url, force).then(function (r) {
      if (my !== token) return;
      if (!r.stream) {
        if (r.dead) { setState(idx, "off", "Sin señal"); return nextServer(idx, m, "Este servidor no tiene señal ahora mismo."); }
        if (r.blocked) { setState(idx, "off", "Protegido"); return nextServer(idx, m, "Este servidor solo funciona en su sitio original."); }
        if (auto) { var alt = directAlt(idx); if (alt >= 0) { setState(idx, "ok", "Reproductor"); return go(alt); } }   // selección automática: se prefiere una señal de vídeo directo (sin iframe ni anuncios) ya verificada
        setState(idx, "ok", "Reproductor"); now(s, "reproductor propio de la señal");
        return showFrame(r.frame || s.url, "Este servidor usa su propio reproductor (sin los anuncios del portal).");
      }
      var viaProxy = proxy(r.stream, r.referer), tries = r.direct ? [r.stream, viaProxy] : [viaProxy];
      playHls(tries, function () {
        if (my !== token) return;
        if (!force) return startEmbed(s, idx, m, true, auto);
        fail(idx, m, "No se pudo reproducir esta señal.");
      }, function () { setState(idx, "ok", "Directo"); bump(s.url, 1); remember(m, s); now(s, r.direct ? "directo" : "vía TatoTV"); watch(true); sideTools(); });
    });
  }

  function playServer(s, idx, m, auto) {
    stop();
    cur = { s: s, i: idx }; curM = m;
    paint();
    el.hint.textContent = ""; now(null);
    msg("Conectando con " + s.name + "…");
    if (s.kind === "page") { setState(idx, "ok", "Reproductor"); now(s, "reproductor de un tercero"); showFrame(s.url, s.open ? "Reproductor de un tercero (último recurso: puede abrir anuncios)." : "", !!s.open); return; }   // open: ese reproductor rechaza iframes con «sandbox»
    if (s.kind === "hls") { // canal de lista IPTV: URL principal y respaldos; directo si el origen lo permite (sin Referer) y, si no, por el proxy
      var tries = [], all = [{ u: s.url, r: s.ref || "" }].concat(s.alt || []), k;
      for (k = 0; k < all.length; k++) { if (/^https:/i.test(all[k].u) && !all[k].r) tries.push(all[k].u); tries.push(proxy(all[k].u, all[k].r)); }
      playHls(tries, function () { fail(idx, m, "No se pudo reproducir este canal."); }, function () { setState(idx, "ok", "24/7"); now(s, "canal 24/7"); watch(true); sideTools(); });
      return;
    }
    startEmbed(s, idx, m, false, auto);
  }

  /** Botones de la barra (se muestran solo si el navegador los soporta). */
  function sideTools() {
    var v = el.video;
    el.live.hidden = el.video.hidden;
    el.pip.hidden = !(el.video.hidden === false && ((w.document.pictureInPictureEnabled && v.requestPictureInPicture) || (v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode("picture-in-picture"))));
    el.fs.hidden = !(el.stage.requestFullscreen || el.stage.webkitRequestFullscreen || v.webkitEnterFullscreen);
  }
  function fullscreen() {
    var v = el.video, st = el.stage;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      if (st.requestFullscreen) st.requestFullscreen(); else if (st.webkitRequestFullscreen) st.webkitRequestFullscreen(); else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    } catch (e) { /* nada */ }
  }
  function pip() {
    var v = el.video;
    try {
      if (w.document.pictureInPictureElement) { w.document.exitPictureInPicture(); return; }
      if (v.requestPictureInPicture) v.requestPictureInPicture(); else if (v.webkitSetPresentationMode) v.webkitSetPresentationMode(v.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture");
    } catch (e) { /* nada */ }
  }
  function goLive() {
    var v = el.video, n = v.seekable && v.seekable.length ? v.seekable.end(v.seekable.length - 1) : 0;
    try { if (hls && hls.liveSyncPosition) v.currentTime = hls.liveSyncPosition; else if (n) v.currentTime = n - 1; var pr = v.play(); if (pr && pr.catch) pr.catch(function () { /* nada */ }); } catch (e) { /* nada */ }
  }
  function reload() { if (!cur) return; delete rc[cur.s.url]; playServer(cur.s, cur.i, curM); }
  function another() { if (cur) nextServer(cur.i, curM, "No hay más señales por probar.", true); }

  var serverCount = 0, matchCount = 0, svs = {};
  function addServerButton(s, m, label, isChannel) {
    var i = serverCount++, b = document.createElement("button");
    urls[norm(s.url)] = 1;
    if (!isChannel) { matchCount++; $("p-count").textContent = matchCount + (matchCount === 1 ? " disponible" : " disponibles"); }
    b.type = "button"; b.className = "srv"; b.setAttribute("data-i", String(i));
    b.innerHTML = '<i class="dot"></i><span class="srv-n">' + U.esc(label || s.name || ("Servidor " + (i + 1))) + '</span><small class="srv-t"></small>';
    svs[i] = { s: s, m: m };
    b.onclick = function () { playServer(s, i, m); };
    el.servers.appendChild(b);
    return b;
  }
  var urls = {};
  function norm(u) { return String(u).split("?")[0]; }   // el mismo embed con o sin «?ad=…» es el mismo servidor
  function haveUrl(u) { return !!urls[norm(u)]; }
  function renderServers(list, m) {
    el.servers.innerHTML = ""; serverCount = 0; matchCount = 0; svs = {}; state = {}; tags = {}; urls = {}; cur = null; $("p-count").textContent = "";
    list.forEach(function (s) { addServerButton(s, m); });
  }
  /** «Grupos» de servidores (kind "se": página de partido de StreamEast): /api/servers los expande en los servidores reales del partido. */
  function expandGroup(g, m, token0, autoplay) {
    return fetch("api/servers?url=" + encodeURIComponent(g.url)).then(function (r) { return r.ok ? r.json() : { servers: [] }; }, function () { return { servers: [] }; }).then(function (d) {
      if (token0 !== openToken || el.root.hidden) return;
      var list = (d && d.servers) || [], first = null, k;
      for (k = 0; k < list.length; k++) { if (haveUrl(list[k].url)) continue; var b = addServerButton({ name: "StreamEast · " + list[k].name, url: list[k].url, kind: "embed" }, m); if (!first) first = b; }
      if (!list.length) { if (autoplay) { msg("Aún no hay señales publicadas para este partido.", true); el.hint.textContent = "StreamEast las publica poco antes del inicio. Vuelve a abrir el partido en unos minutos o prueba un canal 24/7."; } return; }
      if (autoplay && first) first.click();
    });
  }
  /** «Canales 24/7»: señal continua de canales deportivos (comprobados en el servidor). Siempre hay algo que probar aunque el partido no tenga servidores. */
  function addChannels(sport, token0) {
    if (!w.D) return;
    D.channels(sport).then(function (chs) {
      if (token0 !== openToken || !chs.length || el.root.hidden) return;
      var h = document.createElement("div"); h.className = "srv-h"; h.textContent = "Canales 24/7";
      el.servers.appendChild(h);
      chs.slice(0, 10).forEach(function (c) { addServerButton({ name: c.n, url: c.u, kind: c.kind || "hls", alt: c.alt || [], ref: c.r || "" }, null, null, true); });
    }, function () { /* sin canales: el partido sigue funcionando */ });
  }

  function scoreText(m) {
    if (!m || !m.a) return "";
    var st = A.stateOf(m);
    var sa = m.a.s, sb = m.b.s;
    return st === "pre" || sa === "" ? "" : '<span>' + U.esc(m.a.n) + "</span><span>" + U.esc(sa) + " – " + U.esc(sb) + "</span><span>" + U.esc(m.b.n) + "</span>" + (m.detail ? "<small>" + U.esc(m.detail) + "</small>" : "");
  }

  /* ── Integración con el sistema (iOS Isla Dinámica / pantalla de bloqueo, Android notificación multimedia, mandos y auriculares) ──
     Media Session muestra «ahora reproduciendo» con título, liga y logo, y enruta play/pausa. La pantalla no se apaga mientras se ve (Wake Lock).
     Los navegadores sin estas APIs simplemente las ignoran (todo va protegido). */
  var wake = null;
  function session(title, sub) {
    var ms = w.navigator.mediaSession;
    if (!ms || !w.MediaMetadata) return;
    try {
      ms.metadata = new w.MediaMetadata({ title: title, artist: sub || "En vivo", album: "TatoTV", artwork: [
        { src: "icons/icon-96.png", sizes: "96x96", type: "image/png" }, { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }] });
    } catch (e) { /* nada */ }
  }
  function sessionState(st) { try { if (w.navigator.mediaSession) w.navigator.mediaSession.playbackState = st; } catch (e) { /* nada */ } }
  function lockScreen(on) {
    try {
      if (!on) { if (wake && wake.release) wake.release(); wake = null; return; }
      if (w.navigator.wakeLock && !wake) w.navigator.wakeLock.request("screen").then(function (l) { wake = l; l.addEventListener("release", function () { wake = null; }); }, function () { /* sin permiso */ });
    } catch (e) { /* nada */ }
  }
  function sessionInit() {
    var ms = w.navigator.mediaSession;
    if (ms && ms.setActionHandler) {
      try { ms.setActionHandler("play", function () { var p = el.video.play(); if (p && p.catch) p.catch(function () { /* nada */ }); }); } catch (e) { /* nada */ }
      try { ms.setActionHandler("pause", function () { el.video.pause(); }); } catch (e) { /* nada */ }
      try { ms.setActionHandler("stop", function () { P.close(); }); } catch (e) { /* nada */ }
    }
    el.video.addEventListener("playing", function () { sessionState("playing"); lockScreen(true); });
    el.video.addEventListener("pause", function () { sessionState("paused"); lockScreen(false); });
    el.video.addEventListener("ended", function () { sessionState("none"); lockScreen(false); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && !el.video.paused && !el.root.hidden) lockScreen(true); });
  }

  function open(title, sub) {
    session(title, sub);
    lastFocus = document.activeElement;
    $("p-title").textContent = title; $("p-sub").textContent = sub || "";
    el.root.hidden = false; document.body.style.overflow = "hidden";
    try { history.pushState({ ttv: "player" }, ""); } catch (e) { /* nada */ }
    $("p-close").focus();
  }

  /** Abre un partido con su lista de servidores. */
  var openToken = 0;
  P.openMatch = function (m) {
    var ot = ++openToken;
    if (w.Legal && !Legal.accepted()) { Legal.gate(); return; }
    var title = m.a.n + (m.b.n ? " vs. " + m.b.n : "");
    open(title, m.league);
    var sc = scoreText(m); el.score.hidden = !sc; el.score.innerHTML = sc;
    el.root.setAttribute("data-match", m.id);
    if (!m.servers || !m.servers.length) {
      renderServers([], m); stop(); msg("Aún no hay transmisión publicada para este partido.", true);
      el.hint.textContent = "Las fuentes suelen publicar los enlaces poco antes del inicio. Mientras tanto prueba un canal 24/7.";
      addChannels(m.sport, ot);
      return;
    }
    var plain = [], groups = [], j;
    for (j = 0; j < m.servers.length; j++) (m.servers[j].kind === "se" ? groups : plain).push(m.servers[j]);
    plain = order(plain, m);
    renderServers(plain, m);
    for (j = 1; j < plain.length && j < 4; j++) precheck(plain[j], j, ot);   // las primeras señales se verifican en paralelo (la primera la verifica su propio arranque)
    if (plain.length) playServer(plain[0], 0, m, true); else { stop(); msg("Buscando señales…"); }
    var pend = [];
    for (j = 0; j < groups.length; j++) pend.push(expandGroup(groups[j], m, ot, !plain.length && j === 0));
    // los canales 24/7 van al final: se añaden cuando ya se expandieron los grupos (así el orden es siempre: servidores del partido → StreamEast → canales)
    Promise.all(pend).then(function () { addChannels(m.sport, ot); }, function () { addChannels(m.sport, ot); });
  };
  /** Abre un canal M3U suelto. */
  P.openChannel = function (ch) {
    openToken++;
    if (w.Legal && !Legal.accepted()) { Legal.gate(); return; }
    open(ch.n, "Canal en vivo"); el.score.hidden = true; el.root.removeAttribute("data-match");
    var s = { name: ch.n, url: ch.u, kind: ch.kind || "hls", alt: ch.alt || [], ref: ch.r || "" };
    renderServers([s], null); playServer(s, 0, null);
  };
  /** La lista se refresca cada minuto: el marcador del partido abierto se actualiza sin tocar el vídeo. */
  P.update = function (matches) {
    if (el.root.hidden) return;
    var id = el.root.getAttribute("data-match"); if (!id) return;
    for (var i = 0; i < matches.length; i++) if (matches[i].id === id) { var sc = scoreText(matches[i]); el.score.hidden = !sc; el.score.innerHTML = sc; return; }
  };
  P.isOpen = function () { return !el.root.hidden; };
  P.close = function (fromPop) {
    if (el.root.hidden) return;
    stop(); el.root.hidden = true; document.body.style.overflow = "";
    try { if (w.navigator.mediaSession) w.navigator.mediaSession.metadata = null; } catch (e) { /* nada */ } sessionState("none"); lockScreen(false);
    if (!fromPop) { try { if (history.state && history.state.ttv === "player") history.back(); } catch (e) { /* nada */ } }
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) { /* nada */ }
  };

  P.init = function () {
    el = { root: $("player"), video: $("p-video"), frame: $("p-frame"), msg: $("p-msg"), servers: $("p-servers"), hint: $("p-hint"), score: $("p-score"), stage: $("p-stage"), live: $("p-live"), pip: $("p-pip"), fs: $("p-fs") };
    $("p-next").onclick = another; $("p-reload").onclick = reload; el.live.onclick = goLive; el.pip.onclick = pip; el.fs.onclick = fullscreen;
    $("p-close").onclick = function () { P.close(); };
    el.root.addEventListener("click", function (e) { if (e.target === el.root) P.close(); });
    w.addEventListener("popstate", function () { if (!el.root.hidden) P.close(true); });
    document.addEventListener("keydown", function (e) {
      if (el.root.hidden) return;
      if (e.key === "Escape") { P.close(); return; }
      var t = e.target && e.target.tagName; if (t === "INPUT" || t === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "f" || e.key === "F") fullscreen(); else if (e.key === "n" || e.key === "N") another(); else if (e.key === "p" || e.key === "P") pip(); else if (e.key === "l" || e.key === "L") goLive();
    });
    el.video.addEventListener("error", function () { /* hls.js ya gestiona los fallos */ });
    sessionInit();
  };
})(window);
