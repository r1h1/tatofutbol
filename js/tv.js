/* TatoTV · tv.js — navegación con mando (flechas, OK, Atrás) para Smart TV y Fire TV. Solo actúa en modo TV (html.tv).
   Navegación espacial: desde el elemento enfocado se salta al más cercano en la dirección pulsada. Atrás cierra el reproductor / las ventanas. */
(function (w) {
  "use strict";
  var root = document.documentElement;
  function isTV() { return /(^|\s)tv(\s|$)/.test(root.className); }
  function visible(el) { return !!(el.offsetWidth || el.offsetHeight) && !el.hidden && !el.disabled; }
  function scope() {
    var ids = ["gate", "legal", "player"], i, m;
    for (i = 0; i < ids.length; i++) { m = document.getElementById(ids[i]); if (m && !m.hidden) return m; }
    return document;
  }
  function focusables(sc) {
    var list = sc.querySelectorAll('button, a[href], input, [tabindex="0"]'), out = [], i;
    for (i = 0; i < list.length; i++) if (visible(list[i]) && list[i].tabIndex >= 0) out.push(list[i]);
    return out;
  }
  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function move(dir) {
    var sc = scope(), cur = document.activeElement, all = focusables(sc);
    if (!cur || cur === document.body || !sc.contains(cur)) { if (all[0]) { all[0].focus(); return true; } return false; }
    var a = cur.getBoundingClientRect(), ca = center(a), best = null, bd = 1e9, i, r, c, dx, dy, d, ok;
    for (i = 0; i < all.length; i++) {
      if (all[i] === cur) continue;
      r = all[i].getBoundingClientRect(); c = center(r); dx = c.x - ca.x; dy = c.y - ca.y;
      ok = dir === "left" ? dx < -2 && Math.abs(dy) < Math.abs(dx) * 3 + a.height : dir === "right" ? dx > 2 && Math.abs(dy) < Math.abs(dx) * 3 + a.height : dir === "up" ? dy < -2 && Math.abs(dx) < Math.abs(dy) * 3 + a.width : dy > 2 && Math.abs(dx) < Math.abs(dy) * 3 + a.width;
      if (!ok) continue;
      d = (dir === "left" || dir === "right") ? Math.abs(dx) + Math.abs(dy) * 2.5 : Math.abs(dy) + Math.abs(dx) * 2.5;
      if (d < bd) { bd = d; best = all[i]; }
    }
    if (best) { best.focus(); try { best.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* nada */ } return true; }
    return false;
  }
  function back() {
    var g = document.getElementById("gate");
    if (g && !g.hidden) return false;                    // el aviso legal obligatorio no se cierra con «Atrás»
    if (w.P && P.isOpen()) { P.close(); return true; }
    if (w.Legal && !document.getElementById("legal").hidden) { Legal.close(); return true; }
    var m = document.getElementById("sport-menu"); if (m && !m.hidden) { m.hidden = true; return true; }
    return false;
  }
  document.addEventListener("keydown", function (e) {
    if (!isTV() || e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.keyCode, t = e.target, typing = t && (t.tagName === "INPUT" || t.isContentEditable);
    if (k === 10009 || k === 461 || k === 4 || (k === 8 && !typing)) { if (back()) e.preventDefault(); return; }   // Tizen · webOS · Android · retroceso
    if (typing && (k === 37 || k === 39)) return;
    var dir = k === 37 ? "left" : k === 39 ? "right" : k === 38 ? "up" : k === 40 ? "down" : "";
    if (dir && move(dir)) e.preventDefault();
  });
  w.addEventListener("load", function () { if (isTV()) setTimeout(function () { var m = document.querySelector(".mode.on"); if (m && (!document.activeElement || document.activeElement === document.body)) m.focus(); }, 900); });
})(window);
