/* TatoTV · lib/channels.js — canales de TV deportivos «siempre en vivo» (24/7) de fuentes públicas de terceros.
   Dos orígenes (como lo hacen los agregadores IPTV):
   · «hub»: los sitios de agenda (futbollibretvplay, pirlo-tv) enlazan cada canal a tvf90.com/canal.php?stream=<id>: se leen sus páginas /en-vivo/<canal> y se obtiene el id.
     /api/resolve entrega el .m3u8 vivo (con token fresco) al reproducir.
   · «m3u»: listas públicas IPTV (iptv-org por categoría/idioma/país y Free-TV): se descargan, se filtran los canales deportivos, se agrupan por nombre (varias URLs = respaldos)
     y se COMPRUEBA que la lista responde (#EXTM3U) antes de ofrecerla: así los canales caídos no llegan a la persona.
   Cada pasada usa pocas peticiones (la respuesta se cachea 30 min en el CDN). */
import { fetchText, UA, norm } from "./core.js";

const LISTS = [
  "https://iptv-org.github.io/iptv/categories/sports.m3u",
  "https://iptv-org.github.io/iptv/languages/spa.m3u",
  "https://iptv-org.github.io/iptv/countries/ar.m3u",
  "https://iptv-org.github.io/iptv/countries/mx.m3u",
  "https://iptv-org.github.io/iptv/countries/co.m3u",
  "https://iptv-org.github.io/iptv/countries/es.m3u",
  "https://iptv-org.github.io/iptv/countries/us.m3u",
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8",
];
const HUBS = [["https://futbollibretvplay.org", "futbollibre"], ["https://pirlo-tv.club", "pirlotv"]];

/** Marcas deportivas generalistas: sirven para casi cualquier deporte (prioridad menor que un canal específico). */
const MULTI = /\b(espn|fox sports|fox deportes|tyc|dsports|d sports|directv sports|win sports|tudn|bein|sky sports|dazn|movistar|claro sports|azteca deportes|tnt sports|eurosport|sportv|band sports|canal 5|telemundo deportes|gol ?tv|golazo|sport tv|sports? network|sportsnet|deportes)\b/i;
const SPECIFIC = {
  football: /f[uú]tbol|soccer|laliga|premier league|champions|libertadores|sudamericana|gol ?tv|golazo|liga mx|tudn|futv|caliente/i,
  basketball: /\bnba\b|basket|baloncesto|euroleague|nbl/i,
  nhl: /\bnhl\b|hockey|sportsnet|\btsn\b|\brds\b/i,
  nfl: /\bnfl\b|redzone|f[uú]tbol americano|american football/i,
  mlb: /\bmlb\b|baseball|b[eé]isbol/i,
  f1: /\bf1\b|f[oó]rmula ?1|formula ?1|motorsport|f10/i,
  tennis: /tennis|tenis|\batp\b|\bwta\b|wimbledon/i,
  mma: /\bufc\b|fight|boxing|boxeo|combate|\bwwe\b|\bmma\b|\baew\b/i,
  golf: /golf|\bpga\b/i,
  rugby: /rugby/i,
  motor: /motogp|nascar|indycar|rally|racing|motor/i,
};
const SPORT_KEYS = ["football", "basketball", "nhl", "nfl", "mlb", "f1", "tennis", "mma", "golf", "rugby", "motor", "other"];

function parseM3U(text) {
  const out = [], lines = text.split(/\r?\n/);
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith("#EXTINF:")) {
      const c = l.lastIndexOf(",");
      cur = { n: c >= 0 ? l.slice(c + 1).trim() : "", l: (/tvg-logo="([^"]*)"/.exec(l) || [])[1] || "", g: (/group-title="([^"]*)"/.exec(l) || [])[1] || "", r: "" };
    } else if (cur && l.startsWith("#EXTVLCOPT:http-referrer=")) cur.r = l.slice(25).trim();
    else if (cur && l && l[0] !== "#") { cur.u = l; if (cur.n) out.push(cur); cur = null; }
  }
  return out;
}

const mem = { m3u: { t: 0, d: null }, hub: { t: 0, d: null } };
const fresh = (m) => m.d && Date.now() - m.t < 25 * 60e3;

/** Todos los canales de las listas (una sola descarga por ventana de caché de la instancia). */
async function loadLists() {
  if (fresh(mem.m3u)) return mem.m3u.d;
  const res = await Promise.all(LISTS.map((u) => fetchText(u, { timeout: 9000 })));
  const groups = {};
  res.forEach((r, k) => {
    if (!r.ok) return;
    for (const c of parseM3U(r.text)) {
      if (/\[(not 24\/7|geo-blocked)\]/i.test(c.n) || /\bradio\b/i.test(c.n + " " + c.g) || !/^https?:/i.test(c.u)) continue;
      const name = c.n.replace(/\s*[\[(][^\])]*[\])]\s*/g, " ").replace(/\s+/g, " ").trim();
      const hay = name + " " + c.g;
      const multi = MULTI.test(name), specific = SPORT_KEYS.filter((s) => SPECIFIC[s] && SPECIFIC[s].test(hay));
      if (!multi && !specific.length && !/sport|deporte/i.test(hay)) continue;
      const key = norm(name);
      const g = groups[key] || (groups[key] = { n: name, l: "", multi, specific: new Set(), urls: [], score: 0 });
      specific.forEach((s) => g.specific.add(s));
      if (!g.l && c.l) g.l = c.l;
      if (!g.urls.some((x) => x.u === c.u)) g.urls.push({ u: c.u, r: c.r, free: k === LISTS.length - 1 });
    }
  });
  const list = Object.values(groups);
  list.forEach((g) => { g.score = (g.specific.size ? 2 : 1) + (g.l ? 1 : 0) + (MULTI.test(g.n) ? 1 : 0) + (/hd|1080|latin|argentina|m[eé]xico|colombia|espa/i.test(g.n) ? 0.5 : 0); });
  mem.m3u = { t: Date.now(), d: list };
  return list;
}

const probeMemo = new Map();   // url → { t, ok }: una lista ya comprobada no se vuelve a pedir en 30 min (varios deportes comparten canales)
async function probeCached(u, ref) {
  const m = probeMemo.get(u);
  if (m && Date.now() - m.t < 30 * 60e3) return m.ok;
  const ok = await probe(u, ref);
  probeMemo.set(u, { t: Date.now(), ok });
  return ok;
}

/** ¿La lista HLS responde y es de verdad un directo con vídeo? (lista maestra → su primera variante; lista de medios → se pide el primer fragmento) */
async function probe(u, ref) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4500);
  const h = { "user-agent": UA, accept: "*/*" };
  if (ref) { h.referer = ref; try { h.origin = new URL(ref).origin; } catch (e) { /* nada */ } }
  async function head(url, extra) {
    const r = await fetch(url, { headers: Object.assign({}, h, extra || {}), signal: ctl.signal, redirect: "follow" });
    if (!r.ok && r.status !== 206) return null;
    const rd = r.body && r.body.getReader ? r.body.getReader() : null;
    let txt = "";
    if (rd) { const { value } = await rd.read(); txt = new TextDecoder().decode(value || new Uint8Array()); try { rd.cancel(); } catch (e) { /* nada */ } } else txt = (await r.text()).slice(0, 6000);
    return { txt, url: r.url || url };
  }
  async function media(a) {
    if (/#EXT-X-ENDLIST/.test(a.txt) || !/#EXTINF/.test(a.txt)) return false;        // VOD o vacía
    const seg = a.txt.split(/\r?\n/).filter((x) => x && x[0] !== "#")[0];
    if (!seg) return false;
    const r = await head(new URL(seg, a.url).href, { range: "bytes=0-1023" });          // el fragmento existe y se puede leer
    return !!r;
  }
  try {
    const a = await head(u);
    if (!a || !a.txt.trim().startsWith("#EXTM3U")) return false;
    if (/#EXT-X-STREAM-INF/.test(a.txt)) {
      const v = a.txt.split(/\r?\n/).filter((x) => x && x[0] !== "#")[0];
      if (!v) return false;
      const b = await head(new URL(v, a.url).href);
      return !!(b && b.txt.trim().startsWith("#EXTM3U") && await media(b));
    }
    return await media(a);
  } catch (e) { return false; } finally { clearTimeout(t); }
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k], k); } }));
  return out;
}

/** Canales de listas M3U para un deporte, ya comprobados. */
export async function m3uChannels(sport, limit = 36) {
  const all = await loadLists();
  // un canal específico de otro deporte (p. ej. «Sky Sports F1») no aparece fuera de su deporte; los generalistas sirven para todos
  const cand = all.filter((g) => g.specific.has(sport) || (!g.specific.size && (g.multi || sport === "other")))
    .map((g) => ({ g, s: g.score + (g.specific.has(sport) ? 3 : 0) })).sort((a, b) => b.s - a.s).slice(0, limit * 2).map((x) => x.g);
  const checked = await pool(cand, 20, async (g) => {
    const alive = [];
    for (const x of g.urls.slice(0, 3)) { if (alive.length >= 2) break; if (await probeCached(x.u, x.r)) alive.push(x); }
    return alive.length ? { n: g.n, l: g.l, kind: "hls", u: alive[0].u, r: alive[0].r || "", alt: alive.slice(1).map((x) => ({ u: x.u, r: x.r || "" })), score: g.score } : null;
  });
  return checked.filter(Boolean).slice(0, limit);
}

/** Canales «hub»: se leen las páginas /en-vivo/<canal> de los sitios de agenda y se obtiene su reproductor (tvf90.com/…canal.php?stream=<id>). */
export async function hubChannels() {
  if (fresh(mem.hub)) return mem.hub.d;
  const homes = await Promise.all(HUBS.map(([u]) => fetchText(u + "/", { timeout: 8000 })));
  const pages = [];
  homes.forEach((r, i) => {
    if (!r.ok) return;
    const base = new URL(r.url).origin, seen = {};
    const re = /href="(\/en-vivo\/[a-z0-9-]+)"/g; let m;
    while ((m = re.exec(r.text))) if (!seen[m[1]]) { seen[m[1]] = 1; pages.push({ url: base + m[1], slug: m[1].split("/").pop() }); }
  });
  const uniq = {}; pages.forEach((p) => { if (!uniq[p.slug]) uniq[p.slug] = p; });
  const list = Object.values(uniq).slice(0, 40);
  const got = await pool(list, 12, async (p) => {
    const r = await fetchText(p.url, { timeout: 7000 });
    if (!r.ok) return null;
    const e = /(https?:\/\/[^"'\s<>]+?canal\.php\?stream=[A-Za-z0-9_-]+)/.exec(r.text.replace(/&amp;/g, "&"));
    if (!e) return null;
    const t = /<h1[^>]*>([^<]+)/i.exec(r.text);
    const name = (t ? t[1] : p.slug.replace(/-/g, " ")).replace(/\s*\b(por internet|en vivo|online|gratis|hd)\b/gi, "").replace(/\s+/g, " ").trim();
    return { n: name || p.slug.toUpperCase(), l: "", kind: "embed", u: e[1].replace("/online/", "/"), r: "", alt: [], score: 3, slug: p.slug };
  });
  const seen = {}, out = [];
  got.filter(Boolean).forEach((c) => { if (!seen[c.u]) { seen[c.u] = 1; out.push(c); } });
  mem.hub = { t: Date.now(), d: out };
  return out;
}

/** Palabras de cada canal «hub» → deportes donde tiene sentido (generalistas: todos). */
export function hubFor(sport, list) { return sport === "nhl" ? [] : list; }

/** Instantánea de TODOS los deportes (para empaquetarla como data/channels.json: la app muestra los canales al instante y el servidor la revalida detrás). */
export async function snapshot() {
  const hub = await hubChannels(), sports = {};
  for (const sp of SPORT_KEYS) sports[sp] = await m3uChannels(sp);   // las comprobaciones se comparten entre deportes (probeMemo)
  return { at: new Date().toISOString(), hub, sports };
}
