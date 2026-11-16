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
    token++;
    if (hls) { try { hls.destroy(); } catch (e) { /* nada */ } hls = null; }
    try { el.video.pause(); el.video.removeAttribute("src"); el.video.load(); } catch (e) { /* nada */ }
    el.video.hidden = true;
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
  var resolved = {}; // url del embed → "hls" | "frame" (no se vuelve a intentar resolver lo que ya falló en esta sesión)

  /** Reproduce un .m3u8 con hls.js (o HLS nativo en Safari/iOS). `urls` = lista de intentos en orden; el siguiente se prueba si el actual falla. */
  function playHls(urls, onFail) {
    var my = ++token, i = 0, giveUp;
    function next(reason) {
      if (my !== token) return;
      if (hls) { try { hls.destroy(); } catch (e) { /* nada */ } hls = null; }
      if (i >= urls.length) return onFail(reason);
      var src = urls[i++];
      start(src);
    }
    function ok() { if (my !== token) return; clearTimeout(giveUp); el.msg.hidden = true; el.video.hidden = false; var pr = el.video.play(); if (pr && pr.catch) pr.catch(function () { /* el usuario pulsará play */ }); }
    function start(src) {
      clearTimeout(giveUp);
      giveUp = setTimeout(function () { next("tiempo agotado"); }, i === 1 && urls.length > 1 ? 7000 : 14000);
      if (w.Hls && w.Hls.isSupported()) {
        hls = new w.Hls({ lowLatencyMode: false, maxBufferLength: 20, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 3 });
        hls.on(w.Hls.Events.MANIFEST_PARSED, ok);
        hls.on(w.Hls.Events.ERROR, function (e, d) {
          if (!d.fatal) return;
          if (d.type === w.Hls.ErrorTypes.MEDIA_ERROR && hls) { try { hls.recoverMediaError(); return; } catch (x) { /* sigue */ } }
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

  function playServer(s, idx, m) {
    stop();
    var my = token;
    cur = { s: s, i: idx };
    Array.prototype.forEach.call(el.servers.querySelectorAll("button"), function (b) { var k = +b.getAttribute("data-i"); b.className = "srv" + (k === idx ? " on" : bad[k] ? " off" : ""); });
    el.hint.textContent = "";
    msg("Conectando con " + s.name + "…");

    if (s.kind === "page") { showFrame(s.url, s.open ? "Reproductor de un tercero (último recurso: puede abrir anuncios)." : "", !!s.open); return; }   // open: ese reproductor rechaza iframes con «sandbox»
    if (s.kind === "hls") { // canal de lista IPTV: URL principal y respaldos; directo si el origen lo permite (sin Referer) y, si no, por el proxy
      var tries = [], all = [{ u: s.url, r: s.ref || "" }].concat(s.alt || []), k;
      for (k = 0; k < all.length; k++) { if (/^https:/i.test(all[k].u) && !all[k].r) tries.push(all[k].u); tries.push(proxy(all[k].u, all[k].r)); }
      playHls(tries, function () { msg("No se pudo reproducir este canal. Prueba otro.", true); });
      return;
    }
    // kind "embed": el servidor extrae la lista HLS (sin navegador) y la reproduce NUESTRO reproductor (nunca se incrusta ni redirige a otro sitio).
    //  · needRef (la lista solo responde con el Referer del reproductor, p. ej. StreamEast): siempre por el proxy.
    //  · si no, DIRECTO desde el navegador (no gasta ancho de banda del servidor) y, si falla (CORS / Referer / IP), por el proxy.
    if (resolved[s.url] === "dead") { markBad(idx); return nextServer(idx, m, "Este servidor no tiene señal ahora mismo."); }
    if (resolved[s.url] === "blocked") { markBad(idx); return nextServer(idx, m, "Este servidor solo funciona en su sitio original."); }
    if (resolved[s.url]) { showFrame(resolved[s.url] === "frame" ? s.url : resolved[s.url], "Este servidor usa su propio reproductor."); return; }
    fetch("api/resolve?url=" + encodeURIComponent(s.url)).then(function (r) { return r.ok ? r.json() : { stream: null }; }, function () { return { stream: null }; }).then(function (r) {
      if (my !== token) return;
      if (!r.stream) {
        if (r.dead) { resolved[s.url] = "dead"; markBad(idx); return nextServer(idx, m, "Este servidor no tiene señal ahora mismo."); }
        if (r.blocked) { resolved[s.url] = "blocked"; markBad(idx); return nextServer(idx, m, "Este servidor solo funciona en su sitio original («Not allowed / domain protected»)."); }
        resolved[s.url] = r.frame || "frame"; return showFrame(r.frame || s.url, "Este servidor usa su propio reproductor (sin anuncios del portal).");
      }
      var viaProxy = proxy(r.stream, r.referer), tries = (!r.needRef && /^https:/i.test(r.stream)) ? [r.stream, viaProxy] : [viaProxy];
      playHls(tries, function () { if (my === token) { markBad(idx); nextServer(idx, m, "No se pudo reproducir este servidor."); } });
    });
  }

  /** Servidor sin señal: se marca en la lista y se pasa solo al siguiente que no se haya probado (si no queda ninguno, se avisa). */
  var bad = {};
  function markBad(idx) {
    bad[idx] = 1;
    var b = el.servers.querySelector('button[data-i="' + idx + '"]'); if (b) b.className = "srv off";
  }
  function nextServer(idx, m, why) {
    var all = el.servers.querySelectorAll("button.srv"), i, k;
    for (i = 0; i < all.length; i++) { k = +all[i].getAttribute("data-i"); if (k > idx && !bad[k]) { all[i].click(); return; } }
    msg(why + " Prueba otro servidor o un canal 24/7.", true);
  }

  var serverCount = 0;
  function addServerButton(s, m, label) {
    var i = serverCount++, b = document.createElement("button");
    urls[norm(s.url)] = 1;
    b.type = "button"; b.className = "srv"; b.setAttribute("data-i", String(i)); b.textContent = label || s.name || ("Servidor " + (i + 1));
    b.onclick = function () { playServer(s, i, m); };
    el.servers.appendChild(b);
    return b;
  }
  var urls = {};
  function norm(u) { return String(u).split("?")[0]; }   // el mismo embed con o sin «?ad=…» es el mismo servidor
  function haveUrl(u) { return !!urls[norm(u)]; }
  function renderServers(list, m) {
    el.servers.innerHTML = ""; serverCount = 0; bad = {}; urls = {};
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
      chs.slice(0, 10).forEach(function (c) { addServerButton({ name: c.n, url: c.u, kind: c.kind || "hls", alt: c.alt || [], ref: c.r || "" }, null); });
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
    renderServers(plain, m);
    if (plain.length) playServer(plain[0], 0, m); else { stop(); msg("Buscando señales…"); }
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
    el = { root: $("player"), video: $("p-video"), frame: $("p-frame"), msg: $("p-msg"), servers: $("p-servers"), hint: $("p-hint"), score: $("p-score") };
    $("p-close").onclick = function () { P.close(); };
    el.root.addEventListener("click", function (e) { if (e.target === el.root) P.close(); });
    w.addEventListener("popstate", function () { if (!el.root.hidden) P.close(true); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !el.root.hidden) P.close(); });
    el.video.addEventListener("error", function () { /* hls.js ya gestiona los fallos */ });
    sessionInit();
  };
})(window);
