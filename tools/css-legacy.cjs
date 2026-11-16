/**
 * TatoTV · tools/css-legacy.cjs
 * Endurece el CSS para navegadores Chromium viejos (televisores y Fire TV con Chromium 68–85: webOS 5, Tizen 5.5, Fire OS antiguos…) SIN tocar el código fuente:
 * se aplica al empaquetar (tools/package.js). Cada respaldo se inserta en el MISMO sitio de la cascada que la declaración moderna, así que el orden y la
 * especificidad no cambian; un navegador moderno ignora el respaldo porque la declaración moderna que va después lo pisa.
 *   · inset: …                   → top/right/bottom/left            (Chromium 87)
 *   · min()/max()/clamp()        → valor fijo equivalente antes      (Chromium 79)
 *   · env(safe-area-inset-*)     → mismo valor con 0px antes         (Chromium 69)
 *   · :is(a, b) …                → selectores expandidos             (Chromium 88)
 *   · :focus-visible             → regla gemela con :focus bajo html.no-focus-visible (la clase la pone js/boot.js)       (Chromium 86)
 *   · display:flex + gap         → márgenes entre hijos bajo html.no-flex-gap (la clase la pone js/boot.js)               (Chromium 84)
 * No hace nada que un navegador moderno note. Límites: gap con flex-wrap se aproxima con margen derecho/inferior; aspect-ratio no tiene respaldo genérico.
 */
function splitTop(str, sep) {
  const out = []; let depth = 0, quote = "", cur = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) { cur += c; if (c === quote && str[i - 1] !== "\\") quote = ""; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === "(" || c === "[") depth++; else if (c === ")" || c === "]") depth--;
    if (c === sep && depth === 0) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}
/** Encuentra la llamada `name(...)` equilibrada que empieza en `start` (índice del nombre); devuelve { end, args }. */
function callAt(str, start, nameLen) {
  let depth = 0, i = start + nameLen;                                   // i apunta a «(»
  const argStart = i + 1;
  for (; i < str.length; i++) { if (str[i] === "(") depth++; else if (str[i] === ")") { depth--; if (!depth) return { end: i + 1, args: splitTop(str.slice(argStart, i), ",").map((a) => a.trim()) }; } }
  return null;
}
function replaceCalls(value, re, pick) {
  let out = "", pos = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(value))) {
    const call = callAt(value, m.index, m[0].length - 1);
    if (!call) break;
    out += value.slice(pos, m.index) + pick(m[1], call.args);
    pos = call.end; re.lastIndex = call.end;
  }
  return out + value.slice(pos);
}
function legacyValue(value) {
  let v = value;
  for (let n = 0; n < 4 && /(?<![-\w])(min|max|clamp)\(/.test(v); n++) {
    v = replaceCalls(v, /(?<![-\w])(min|max|clamp)\(/g, (name, args) => {
      let a = name === "clamp" ? (args.length > 1 ? args[1] : args[0]) : args[0];
      if (/(?<![-\w])(min|max|clamp)\(/.test(a) && args.length > 1) a = args[args.length - 1];   // el argumento elegido contiene otra función: se evita
      return a;
    });
  }
  v = replaceCalls(v, /(?<![-\w])(env)\(/g, (name, args) => (args.length > 1 ? args.slice(1).join(",") : "0px"));
  return v;
}
function boxToLonghands(value, important) {
  const p = splitTop(value.trim().replace(/\s+/g, " "), " ").filter(Boolean);
  if (!p.length || p.length > 4) return null;
  const [t, r = t, b = t, l = r] = p, imp = important ? " !important" : "";
  return ["top:" + t + imp, "right:" + r + imp, "bottom:" + b + imp, "left:" + l + imp];
}
function expandIs(sel) {
  const i = sel.indexOf(":is(");
  if (i < 0) return [sel];
  let depth = 0, j = i + 3;
  for (; j < sel.length; j++) { if (sel[j] === "(") depth++; else if (sel[j] === ")") { depth--; if (!depth) break; } }
  const inner = sel.slice(i + 4, j), tail = sel.slice(j + 1), out = [];
  for (const alt of splitTop(inner, ",")) for (const rest of expandIs(alt.trim() + tail)) out.push(sel.slice(0, i) + rest);
  return out;
}
function transformBody(body) {
  const decls = splitTop(body, ";").map((d) => d.trim()).filter(Boolean), out = [];
  for (const d of decls) {
    const k = d.indexOf(":");
    if (k < 0) { out.push(d); continue; }
    const prop = d.slice(0, k).trim(), raw = d.slice(k + 1).trim(), important = /!important\s*$/.test(raw), val = raw.replace(/\s*!important\s*$/, ""), imp = important ? " !important" : "";
    if (prop.startsWith("--")) { out.push(d); continue; }
    if (prop === "inset") { const lh = boxToLonghands(val, important); if (lh) { out.push(...lh); continue; } }
    if (/(?<![-\w])(min|max|clamp|env)\(/.test(val)) {
      const fb = legacyValue(val);
      if (fb !== val && !/(?<![-\w])(min|max|clamp|env)\(/.test(fb) && out[out.length - 1] !== prop + ":" + fb + imp) out.push(prop + ":" + fb + imp);
    }
    out.push(d);
  }
  return out;
}
function gapRules(sels, body) {
  if (!/(^|;)\s*display\s*:\s*(inline-)?flex\b/.test(body)) return "";
  const get = (p) => { const m = new RegExp("(?:^|;)\\s*" + p + "\\s*:\\s*([^;]+)").exec(body); return m ? m[1].trim() : null; };
  const g = get("gap"); let row = get("row-gap"), col = get("column-gap");
  if (g) { const [a, b] = splitTop(g.replace(/\s+/g, " "), " "); row = row || a; col = col || b || a; }
  if (!row && !col) return "";
  const dir = get("flex-direction") || "row", wrap = /wrap/.test(get("flex-wrap") || "") || /flex-flow\s*:[^;]*wrap/.test(body);
  const zero = (x) => !x || /^0(px|rem|em)?$/.test(x);
  let css = "";
  for (const s of sels) {
    if (/::|^@/.test(s)) continue;
    const base = "html.no-flex-gap " + s.trim();
    if (wrap) { if (!zero(col) || !zero(row)) css += base + ">*{margin-right:" + (col || 0) + ";margin-bottom:" + (row || 0) + "}"; }
    else if (/column/.test(dir)) { if (!zero(row)) css += base + ">*+*{margin-" + (dir === "column-reverse" ? "bottom" : "top") + ":" + row + "}"; }
    else if (!zero(col)) css += base + ">*+*{margin-" + (dir === "row-reverse" ? "right" : "left") + ":" + col + "}";
  }
  return css;
}
function legacyCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (m, selRaw, body) => {
    const sel = selRaw.trim();
    if (!sel || sel.startsWith("@")) return m;
    const sels = splitTop(sel, ",").flatMap((s) => expandIs(s.trim()));
    const newBody = transformBody(body).join(";");
    let out = sels.join(",") + "{" + newBody + "}";
    const fv = sels.filter((s) => s.includes(":focus-visible")).map((s) => "html.no-focus-visible " + s.replace(/:focus-visible/g, ":focus"));
    if (fv.length) out += fv.join(",") + "{" + newBody + "}";
    out += gapRules(sels, newBody);
    return out;
  });
}
module.exports = { legacyCss, legacyValue, expandIs, splitTop };
