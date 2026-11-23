/* GET /api/resolve?url=<página con reproductor>
   Sigue hasta 4 iframes (con Referer) y busca la URL .m3u8 en el HTML/JS. Sin navegador: solo fetch + regex.
   Respuesta: { stream, referer } o { stream:null } (el cliente entonces incrusta la página en un iframe). */
import { fetchText, isSafeUrl, UA } from "./core.js";

/* ── Cómo obtienen sus enlaces estos sitios (ingeniería inversa) y cómo lo repetimos aquí ──
   1) Directo en el HTML/JS: «src»/«file»/«source» con la URL .m3u8 (tvf90.com → 5.php, sofayshop.st, streamx…global3.php).
   2) Base64: atob("…") con la URL.
   3) Array barajado (streamxhd.sbs): iL=[[orden,"b64"],…]; se ordena, se decodifica cada trozo (solo dígitos) y se resta k = f1() + f2() → un carácter por trozo.
   4) JavaScript empaquetado «p,a,c,k,e,d» (Dean Edwards): se desempaqueta con el diccionario que trae la propia página.
   5) Cadena de iframes: portal → reproductor → proveedor. Se salta la publicidad (frames de anuncios) y se sigue el reproductor real; si el último eslabón
      no tiene vídeo directo (p. ej. protegido por Cloudflare Turnstile), se entrega ESE reproductor para incrustarlo, no el portal con sus anuncios. */
function unpackAll(html) {
  const out = [];
  const re = /eval\(function\(p,a,c,k,e,[dr]\)\{.*?\}\('((?:[^'\\]|\\.)*)',(\d+),(\d+),'((?:[^'\\]|\\.)*)'\.split\('\|'\)/gs;
  let m;
  while ((m = re.exec(html))) {
    try {
      let p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\"); const a = +m[2]; let c = +m[3]; const k = m[4].split("|");
      const enc = (n) => (n < a ? "" : enc(Math.floor(n / a))) + ((n %= a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
      while (c--) if (k[c]) p = p.replace(new RegExp("\\b" + enc(c) + "\\b", "g"), k[c]);
      out.push(p);
    } catch (e) { /* paquete raro: se ignora */ }
  }
  return out;
}

function decodeScrambled(html) {
  // los nombres de variables cambian en cada carga: se buscan TODOS los arreglos [[orden,"b64"],…] y TODAS las constantes k = f() + g(); gana la combinación que da un .m3u8
  const fn = {}; let f; const fr = /function (\w+)\(\)\s*\{\s*return (\d+);?\s*\}/g;
  while ((f = fr.exec(html))) fn[f[1]] = +f[2];
  const ks = []; const kr = /var k=(\w+)\(\)\+(\w+)\(\)/g; let kx;
  while ((kx = kr.exec(html))) if (fn[kx[1]] != null && fn[kx[2]] != null) ks.push(fn[kx[1]] + fn[kx[2]]);
  if (!ks.length) return null;
  const arrays = []; const ar = /(\w+)=(\[\[\d+,"[A-Za-z0-9+/=]+"\](?:,\[\d+,"[A-Za-z0-9+/=]+"\])*\])/g; let am;
  while ((am = ar.exec(html))) arrays.push(am[2]);
  for (const arr of arrays) {
    const pairs = [], pr = /\[(\d+),"([A-Za-z0-9+/=]+)"\]/g; let x;
    while ((x = pr.exec(arr))) pairs.push([+x[1], x[2]]);
    pairs.sort((u, v) => u[0] - v[0]);
    for (const k of ks) {
      try {
        const url = pairs.map((q) => String.fromCharCode(parseInt(atob(q[1]).replace(/\D/g, ""), 10) - k)).join("");
        if (/^https?:\/\/[^\s]+\.m3u8/i.test(url)) return url;
      } catch (e) { /* otra combinación */ }
    }
  }
  return null;
}

export function findStream(html, base) {
  const sc = decodeScrambled(html);
  if (sc) return sc;
  const texts = [html].concat(unpackAll(html));
  for (const t of texts) {
    const clean = t.replace(/\\\//g, "/").replace(/&amp;/g, "&");
    let m = /(https?:\/\/[^\s"'<>\\]+?\.m3u8[^\s"'<>\\]*)/i.exec(clean);
    if (m) return m[1];
    const re = /atob\(\s*["']([A-Za-z0-9+/=]{20,})["']\s*\)/g;
    while ((m = re.exec(clean))) {
      try { const d = atob(m[1]); const u = /(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i.exec(d); if (u) return u[1]; } catch (e) { /* ignorar */ }
    }
    m = /["'](\/[^"'\s]+\.m3u8[^"'\s]*)["']/i.exec(clean);
    if (m) { try { return new URL(m[1], base).href; } catch (e) { /* ignorar */ } }
    // 6) Reproductores tipo «gooz.aapmains.net» (StreamEast): la lista HLS no acaba en .m3u8 → const SOURCE = "…/playlist/<id>/load-playlist" o Clappr source: atob('…')
    m = /\bSOURCE\s*=\s*["'](https?:[^"']+)["']/.exec(clean);
    if (m) return m[1];
    m = /source\s*:\s*(?:window\.)?atob\(\s*["']([A-Za-z0-9+/=]{16,})["']\s*\)/.exec(clean);
    if (m) { try { const d = atob(m[1]); if (/^https?:\/\//.test(d)) return d; } catch (e) { /* ignorar */ } }
  }
  return null;
}

const AD_HOST = /(doubleclick|googlesyndication|googletagmanager|adsterra|popads|propeller|histats|amung\.us|waust\.at|llvpn|czernik|acscdn|aclib|liftmenaliners|onepyrince|instreams|trkr|exoclick|juicyads|clickadu|hilltopads|adcash|facebook\.com|twitter\.com|t\.me|discord)/i;
const AD_PATH = /(\/|=)(ads?|adv|banner|pop(under|up)?|track(er)?|click|sponsor)\d*([./?_-]|$)/i;
function nextFrames(html, base) {
  const out = [], re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, "&"), base);
      if (!/^https?:$/.test(u.protocol) || AD_HOST.test(u.hostname) || AD_PATH.test(u.pathname + u.search)) continue;
      let score = 0;
      if (/(player|embed|stream|live|hls|channel|canal|tv|e\/|\.php)/i.test(u.pathname + u.search)) score += 2;
      out.push([score, u.href]);
    } catch (e) { /* ignorar */ }
  }
  return out.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

/** ¿La lista responde y es HLS? Los balanceadores reparten tokens entre nodos y alguno puede estar caído: se comprueba antes de entregarla.
 *  Devuelve { ok, cors }: «cors» = la respuesta lleva «Access-Control-Allow-Origin: *» (el navegador puede leerla directamente, sin pasar por nuestro proxy). */
async function probe(stream, referer) {
  const h = { "user-agent": UA, accept: "*/*", origin: "https://tatotv.vercel.app" };
  if (referer) { h.referer = referer; try { h.origin = new URL(referer).origin; } catch (e) { /* nada */ } }
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(stream, { headers: h, signal: ctl.signal, redirect: "follow" });
    if (!r.ok) return { ok: false, cors: false };
    const ok = (await r.text()).trim().startsWith("#EXTM3U");
    return { ok, cors: ok && (r.headers.get("access-control-allow-origin") || "") === "*" };
  } catch (e) { return { ok: false, cors: false }; } finally { clearTimeout(t); }
}
const alive = async (stream, referer) => (await probe(stream, referer)).ok;

/** ¿La página es un reproductor protegido por dominio / Cloudflare Turnstile? Fuera de su dominio autorizado dice «Not allowed / domain protected»: no se puede usar. */
function isBlocked(html) { return /challenges\.cloudflare\.com|this stream is domain protected|domain protected|id=["']offline["']/i.test(html) && !/\.m3u8/i.test(html); }

async function chain(target) {
  let url = target, referer, last = null, blocked = false, dead = false;
  const seen = new Set();
  for (let hop = 0; hop < 4; hop++) {
    if (seen.has(url) || !isSafeUrl(url)) break;
    seen.add(url);
    const r = await fetchText(url, { referer, timeout: 5000 });
    if (!r.ok && !r.text) { dead = hop === 0 || hop > 0; break; }   // el servidor/hub no responde (403, caído): sin señal
    if (hop > 0) last = r.url; // último reproductor alcanzado (para incrustarlo si no hay vídeo directo)
    const s = findStream(r.text, r.url);
    if (s) return { stream: s, referer: r.url };
    const frames = nextFrames(r.text, r.url);
    if (!frames.length) { blocked = isBlocked(r.text); break; }
    referer = r.url;
    url = frames[0];
  }
  return { stream: null, frame: dead ? null : last, blocked, dead };
}


/** Resuelve una página de reproductor a una lista HLS viva: hasta 2 intentos (cada carga puede asignar otro nodo/token; más tardaría demasiado en declarar muerta una señal).
 *  → { stream, referer, needRef } | { stream:null, frame, blocked }.  needRef = la lista solo responde con el Referer del reproductor (hay que pasar por el proxy). */
export async function resolveEmbed(target) {
  const first = await chain(target);
  if (!first.stream) return { stream: null, frame: first.frame, blocked: first.blocked, dead: first.dead };
  // La página trae una lista HLS: se comprueba que responda. Dos intentos EN PARALELO (cada carga puede recibir otro nodo/token); gana el primero que funcione.
  const tryOne = (r) => probe(r.stream, r.referer).then((p) => { if (!p.ok) throw new Error("sin señal"); return r; });
  const second = chain(target).then((r) => { if (!r.stream) throw new Error("sin lista"); return tryOne(r); });
  let win = null;
  try { win = await Promise.any([tryOne(first), second]); } catch (e) { win = null; }
  if (!win) return { stream: null, frame: null, blocked: false, dead: true };   // hay lista pero NO responde («not found»/500: canal sin emisión, p. ej. «disney24»): servidor muerto. No se muestra su reproductor (enseñaría su aviso).
  const open = await probe(win.stream, null);
  // direct = el navegador puede pedir la lista él mismo (sin gastar ancho de banda de Vercel): hace falta que responda sin Referer, con CORS abierto y que el token NO esté atado a la IP de quien lo pidió
  //   (tvf90/ftlly emiten «?token=…» ligado a la IP: desde Vercel funciona, desde el navegador del usuario da 403 → siempre por el proxy).
  return { stream: win.stream, referer: win.referer, needRef: !open.ok, direct: open.ok && open.cors && !/[?&]token=/i.test(win.stream) };
}
