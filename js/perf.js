/* TatoTV · perf.js — rendimiento: modo ligero (TV, conexión lenta, ahorro de datos o equipo modesto) y precarga en reposo.
   Modo ligero: sin desenfoques ni animaciones, miniaturas más livianas, listas más cortas y refresco menos frecuente. Ajuste manual: auto → sí → no. */
(function (w) {
  "use strict";
  var c = w.navigator.connection || {}, ua = w.navigator.userAgent || "";
  var pref = U.store.get("lite") || "auto";
  var slow = !!c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || "");
  var low = (w.navigator.deviceMemory && w.navigator.deviceMemory <= 2) || (w.navigator.hardwareConcurrency && w.navigator.hardwareConcurrency <= 2);
  var tv = /(^|\s)tv(\s|$)/.test(w.document.documentElement.className);
  U.isTV = tv;
  U.lite = pref === "on" || (pref === "auto" && (slow || low || tv));
  U.saveData = !!c.saveData;
  var LABEL = { auto: "Modo ligero: auto", on: "Modo ligero: sí", off: "Modo ligero: no" };
  function apply() {
    document.body.className = document.body.className.replace(/\s*\blite\b/g, "") + (U.lite ? " lite" : "");
    var bs = document.querySelectorAll('[data-act="lite"]'), i;
    for (i = 0; i < bs.length; i++) bs[i].textContent = LABEL[pref] + (pref === "auto" && U.lite ? " (activo)" : "");
  }
  apply();
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest('[data-act="lite"]') : null; if (!b) return;
    pref = { auto: "on", on: "off", off: "auto" }[pref] || "on"; U.store.set("lite", pref);
    U.lite = pref === "on" || (pref === "auto" && (slow || low || tv)); apply();
    U.toast(LABEL[pref] + " · se aplica por completo al recargar");
  });
  /* precarga en reposo: las agendas de los otros deportes quedan guardadas (memoria + storage + Service Worker) para cambiar de deporte al instante */
  function warm() {
    if (U.lite || U.saveData || (w.navigator.onLine === false) || !w.D) return;
    var today = U.ymd(new Date()), cur = (/[?&]sport=(\w+)/.exec(w.location.search) || [])[1] || U.store.get("sport") || "football", all = ["football", "basketball", "nhl"], i, k = 0;
    for (i = 0; i < all.length; i++) if (all[i] !== cur) (function (s, d) { setTimeout(function () { try { D.schedule(s, today).catch(function () { /* nada */ }); } catch (e) { /* nada */ } }, d); })(all[i], 2500 + 1800 * k++);
  }
  var idle = w.requestIdleCallback || function (f) { return setTimeout(f, 3000); };
  w.addEventListener("load", function () { idle(warm, { timeout: 6000 }); });
})(window);
