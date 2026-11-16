/* TatoTV · boot.js — se ejecuta en la cabecera, ANTES de pintar (archivo propio y síncrono: la CSP no permite scripts en línea).
   · Modo TV: se marca <html class="tv"> en Smart TV y Fire TV (por User-Agent; ?tv=1 / ?tv=0 fuerzan el modo para probar). El CSS escala la interfaz y refuerza el foco.
   · Chromium viejo (televisores 2020, Fire TV): se detectan las funciones CSS que faltan y se avisa con clases; el CSS empaquetado ya trae los respaldos (tools/css-legacy.cjs).
     html.no-flex-gap  → el navegador no soporta «gap» en flex (Chromium < 84)
     html.no-focus-visible → no soporta :focus-visible (Chromium < 86)
     html.no-grid → no soporta CSS Grid (Chromium < 57)
   Los navegadores modernos no pagan nada. */
(function () {
  var root = document.documentElement, ua = navigator.userAgent || "", cls = [];
  try { history.scrollRestoration = "manual"; } catch (e) { /* nada */ }
  var force = /[?&]tv=(0|1)/.exec(location.search), isTV = /SmartTV|SMART-TV|Tizen|Web0S|WebOS|AFT[A-Z]|Android TV|BRAVIA|HbbTV|CrKey|NetCast|VIDAA|Roku|GoogleTV/i.test(ua);
  if (force) isTV = force[1] === "1";
  if (isTV) cls.push("tv");
  try {
    var probe = document.createElement("div");
    probe.style.cssText = "display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden";
    probe.appendChild(document.createElement("i")); probe.appendChild(document.createElement("i"));
    probe.firstChild.style.height = probe.lastChild.style.height = "1px";
    root.appendChild(probe);
    var h = probe.scrollHeight, noGap = h > 0 && h < 3;     // h = 0: sin diseño calculado → no se marca (nunca un falso «sin gap»)
    root.removeChild(probe);
    var noFv = true; try { document.querySelector(":focus-visible"); noFv = false; } catch (e2) { /* sin :focus-visible */ }
    var g = document.createElement("div"); g.style.display = "grid";
    if (g.style.display !== "grid") cls.push("no-grid");       // Chromium < 57 (webOS 4 / 2019): el CSS trae un diseño equivalente con flexbox
    if (noGap) cls.push("no-flex-gap");
    if (noFv) cls.push("no-focus-visible");
  } catch (e3) { /* nada */ }
  // Fondo del deporte guardado: se marca en <html> y se precarga ANTES de pintar (así no hay «destello» negro → imagen al quitarse el splash ni un salto de fútbol al deporte elegido)
  try {
    var sp = (/[?&]sport=(\w+)/.exec(location.search) || [])[1], saved = null;
    try { saved = JSON.parse(localStorage.getItem("ttv:sport")); } catch (e4) { /* nada */ }
    sp = sp || saved || "football";
    if (/^(football|basketball|nhl|f1|tennis|nfl|mlb|mma|golf|rugby|motor|other)$/.test(sp)) {
      root.setAttribute("data-sport", sp);
      var lk = document.createElement("link"); lk.rel = "preload"; lk.as = "image"; lk.href = "img/bg-" + sp + ".jpg";
      document.head.appendChild(lk);
    }
  } catch (e5) { /* nada */ }
  if (cls.length) root.className += (root.className ? " " : "") + cls.join(" ");
})();
