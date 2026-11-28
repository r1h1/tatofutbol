/* TatoTV · util.js — utilidades sin interfaz: DOM, almacenamiento seguro, fechas y avisos. Scripts clásicos (compatibles con navegadores de TV). */
(function (w) {
  "use strict";
  var U = (w.U = {});

  /* Catálogo único de deportes (clave y nombre). Sin emojis ni iconos de deporte. */
  U.SPORTS = [
    { k: "football", n: "Fútbol" }, { k: "basketball", n: "Basketball" }, { k: "nhl", n: "Hockey" }, { k: "f1", n: "F1" },
    { k: "tennis", n: "Tenis" }, { k: "nfl", n: "Americano" }, { k: "mlb", n: "Béisbol" }, { k: "mma", n: "UFC Boxeo" },
    { k: "golf", n: "Golf" }, { k: "rugby", n: "Rugby" }, { k: "motor", n: "Motor" }, { k: "other", n: "Otros deportes" },
  ];
  /** Color de la barra del sistema (Android) y de Safari por deporte: oscuro con el matiz del fondo, para que la zona del notch/isla se funda con la interfaz. */
  var THEME = { football: "#0b1a0d", basketball: "#1a0e07", nhl: "#08121f", f1: "#150607", tennis: "#0c1409", nfl: "#07140d", mlb: "#170d07", mma: "#14070b", golf: "#08160c", rugby: "#080f1d", motor: "#151006", other: "#0e0a1a" };
  U.setTheme = function (sport) {
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", THEME[sport] || "#0d0e10");
  };
  U.sportName = function (k) { for (var i = 0; i < U.SPORTS.length; i++) if (U.SPORTS[i].k === k) return U.SPORTS[i].n; return ""; };

  U.$ = function (id) { return document.getElementById(id); };
  U.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  U.hash = function (s) { var h = 5381, i; s = String(s); for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; };

  /* localStorage que nunca lanza (modo privado, cuota llena, bloqueado). */
  U.store = {
    get: function (k) { try { return JSON.parse(w.localStorage.getItem("ttv:" + k)); } catch (e) { return null; } },
    set: function (k, v) { try { w.localStorage.setItem("ttv:" + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { w.localStorage.removeItem("ttv:" + k); } catch (e) { /* nada */ } },
    /** Conserva como máximo `max` claves con ese prefijo (las más antiguas se borran). */
    trim: function (prefix, max) {
      try {
        var keys = [], i, k, t;
        for (i = 0; i < w.localStorage.length; i++) { k = w.localStorage.key(i); if (k && k.indexOf("ttv:" + prefix) === 0) { t = 0; try { t = JSON.parse(w.localStorage.getItem(k)).t || 0; } catch (e) { /* nada */ } keys.push([k, t]); } }
        keys.sort(function (a, b) { return b[1] - a[1]; });
        for (i = max; i < keys.length; i++) w.localStorage.removeItem(keys[i][0]);
      } catch (e) { /* nada */ }
    },
  };

  /* sessionStorage con la misma interfaz: lectura instantánea dentro de la pestaña (sobrevive a recargas, se borra al cerrarla). */
  U.session = {
    get: function (k) { try { return JSON.parse(w.sessionStorage.getItem("ttv:" + k)); } catch (e) { return null; } },
    set: function (k, v) { try { w.sessionStorage.setItem("ttv:" + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  U.pad = function (n) { return (n < 10 ? "0" : "") + n; };
  /** Fecha local como YYYYMMDD. */
  U.ymd = function (d) { return d.getFullYear() + U.pad(d.getMonth() + 1) + U.pad(d.getDate()); };
  U.addDays = function (d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; };

  var DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  var MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  U.dow = function (d) { return DOW[d.getDay()]; };
  U.mon = function (d) { return MON[d.getMonth()]; };

  /** Hora local legible en dos partes: { t: "5:45", p: "PM" } (p vacío en formato 24 h). */
  U.time = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return { t: "--:--", p: "" };
    try {
      var parts = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).formatToParts(d), t = "", p = "", i;
      for (i = 0; i < parts.length; i++) { if (parts[i].type === "dayPeriod") p = parts[i].value.replace(/[.\s\u00a0\u202f]/g, "").toUpperCase(); else t += parts[i].value; }
      return { t: t.trim(), p: p };
    } catch (e) {
      return { t: U.pad(d.getHours()) + ":" + U.pad(d.getMinutes()), p: "" };
    }
  };

  var toastT;
  U.toast = function (msg) {
    var el = U.$("toast"); if (!el) return;
    el.textContent = msg; el.className = "toast on";
    clearTimeout(toastT); toastT = setTimeout(function () { el.className = "toast"; }, 3200);
  };

  /** Carga un script una sola vez (hls.js solo se descarga al reproducir). */
  var loaded = {};
  U.loadScript = function (src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { delete loaded[src]; rej(new Error("script")); };
      document.head.appendChild(s);
    });
    return loaded[src];
  };
})(window);
