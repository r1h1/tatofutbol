/* TatoTV · lib/sources.js
   Lectura de las agendas públicas (HTML) SIN navegador: fetch + expresiones regulares.
   Cada fuente devuelve entradas { title, league, home, away, start(ISO|null), sport, servers:[{name,url,kind}] }.
   kind: "embed" = página con reproductor que /api/resolve intenta convertir en .m3u8 · "page" = se incrusta en iframe · "se" = página de partido de StreamEast: /api/servers la expande en sus servidores reales y /api/resolve los convierte en vídeo HLS propio (nunca se incrusta ni se redirige). */
import { fetchText, stripTags, decodeEntities } from "./core.js";
import { classify, TEAM_LIKE } from "./sports.js";
import { futbolvivo } from "./futbolvivo.js";

const TZ_PIRLO = -5; // pirlotv.la publica la hora de Colombia/Perú (UTC-5)

export { classify };

/** «Liga: Local vs Visitante», «Tenis – WTA Finals – Día 6», «ESPN Knockout – LFA 246 – A vs. B»… → { league, home, away }.
 *  Con rival: equipos/jugadores. Sin rival (torneos, carreras, carteleras): el nombre del evento va en `home` y `away` queda vacío. */
export function splitTitle(raw) {
  let t = String(raw || "").replace(/\s+/g, " ").trim(), league = "";
  const VS = /\s+(?:vs\.?|v|@)\s+/i;
  const ci = t.indexOf(":");
  if (ci > 0 && ci < 48 && !/^https?$/i.test(t.slice(0, ci))) { league = t.slice(0, ci).trim(); t = t.slice(ci + 1).trim(); }
  const segs = t.split(/\s+[–—]\s+/);
  if (segs.length >= 2) {
    const i = segs.findIndex((x) => VS.test(x));
    if (i >= 0) {
      const m = segs[i].split(VS);
      const pre = segs.slice(0, i).concat(league ? [] : []).join(" · "), post = segs.slice(i + 1).join(" · ");
      return { league: [league, pre, post].filter(Boolean).join(" · "), home: m[0].trim(), away: m.slice(1).join(" vs ").trim() };
    }
    if (segs.length === 2 && !/\b(tenis|tennis|golf|rugby|f1|gp|premio|pr[aá]ctica|clasificaci[oó]n|carrera|sprint|qualifying|practice|d[ií]a|round|ronda|jornada|etapa|fecha|grupo|final)\b/i.test(t)) return { league, home: segs[0].trim(), away: segs[1].trim() }; // «A – B»
    return { league: league || segs[0].trim(), home: segs.slice(1).join(" · ").trim(), away: "" };
  }
  const m = t.split(/\s+(?:vs\.?|v|@|-|x)\s+/i);
  if (m.length >= 2) return { league, home: m[0].trim(), away: m.slice(1).join(" - ").trim() };
  return { league, home: t, away: "" };
}

function b64url(r) {
  try { const s = atob(decodeURIComponent(r)); return /^https?:\/\//.test(s) ? s : null; } catch (e) { return null; }
}

/** Hora "HH:MM" de hoy en la zona de la fuente → ISO UTC. */
function todayAt(hhmm, offsetH, now) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  if (!m) return null;
  const local = new Date(now.getTime() + offsetH * 3600000);
  const utc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), +m[1], +m[2]) - offsetH * 3600000;
  return new Date(utc).toISOString();
}

/* ── pirlotv.la · agenda del día con varios canales por partido ── */
export async function pirlotv(now) {
  const base = "https://pirlotv.la";
  const r = await fetchText(base + "/home.php");
  if (!r.ok) return [];
  const out = [];
  const re = /<li><a href="#">([^<]+)<span class="t">([^<]+)<\/span><\/a>\s*<ul>([\s\S]*?)<\/ul>/g;
  let m;
  while ((m = re.exec(r.text))) {
    const title = decodeEntities(m[1]).trim();
    const { league, home, away } = splitTitle(title);
    const sport = classify(league, title);
    if (!sport || (!away && TEAM_LIKE[sport])) continue;
    const servers = [];
    const lre = /<a href="([^"]+)">([^<]+)<\/a>/g;
    let l;
    while ((l = lre.exec(m[3]))) {
      let url = l[1].startsWith("http") ? l[1] : base + (l[1].startsWith("/") ? "" : "/") + l[1];
      const q = /[?&]r=([^&]+)/.exec(url);
      if (q) { const real = b64url(q[1]); if (real) url = real; }
      servers.push({ name: decodeEntities(l[2]).trim(), url, kind: "embed" });
    }
    if (!servers.length) continue;
    out.push({ title, league: league || "Fútbol", home, away, start: todayAt(m[2], TZ_PIRLO, now), sport, servers, source: "pirlotv", pri: 1, dayless: true });
  }
  return out;
}

/* ── streameast · NBA / NHL con hora relativa ("18 hours from now") ── */
async function streameast(path, sport, label, now) {
  const base = "https://streameast.cool";
  const r = await fetchText(base + path);
  if (!r.ok) return [];
  const out = [], seen = new Set();
  const re = /<a[^>]+href="(https:\/\/streameast\.cool\/(?:nba|nhl)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(r.text))) {
    if (seen.has(m[1])) continue;
    const text = stripTags(m[2]).replace(/[●•]/g, " live ").replace(/\s+/g, " ").trim();
    const t = /^(?:NBA|NHL)\s+(.+?)\s+vs\.?\s+(.+?)(?:\s+(\d+)\s+(minute|hour|day)s?\s+from now|\s+(live|started).*)?$/i.exec(text);
    if (!t) continue;
    seen.add(m[1]);
    let start = t[5] ? now.toISOString() : null;
    if (t[3]) { const mult = t[4].toLowerCase() === "minute" ? 60000 : t[4].toLowerCase() === "hour" ? 3600000 : 86400000; start = new Date(now.getTime() + +t[3] * mult).toISOString(); }
    out.push({ title: `${label}: ${t[1]} vs ${t[2]}`, league: label, home: t[1].trim(), away: t[2].trim(), start, sport, servers: [{ name: "StreamEast", url: m[1], kind: "se", pri: 8 }], source: "streameast", approx: true });
  }
  return out;
}

/* ── futbollibretvplay.org (y sus espejos: rojadirectatvplay.org/.com, futbollibretvplus.org/.com…) ──
   Ingeniería inversa: la página es un cascarón; su /js/index.js llama a una API Strapi pública (CORS abierto) → https://api.wqxag.com/diaries.json
   Cada evento trae diary_description («Liga: Local vs Visitante»), date_diary, diary_hour (America/Lima = UTC-5) y embeds[].embed_iframe
   (/embed/eventos.html?r=<base64 de la URL real, p. ej. https://tvf90.com/1.php?stream=espn4>). */
const FL_API = ["https://api.wqxag.com/diaries.json"];
const FL_SITE = "https://futbollibretvplay.org";

function b64any(r) {
  try { let x = decodeURIComponent(r).replace(/-/g, "+").replace(/_/g, "/"); while (x.length % 4) x += "="; const s = atob(x).trim(); return /^https?:\/\//.test(s) ? s : null; } catch (e) { return null; }
}
function limaToIso(date, hour) {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || ""), h = /^(\d{1,2}):(\d{2})/.exec(hour || "");
  if (!d || !h) return null;
  return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], +h[1], +h[2]) - TZ_PIRLO * 3600000).toISOString();
}

/** tvf90.com es un «hub» de canales: el mismo canal responde en varias rutas (1, 2, 3, hd, canal). Se ofrecen las que la agenda no listó (la comprobación de /api/resolve descarta las que no sirvan). */
function withTvfVariants(servers) {
  const have = {}, out = servers.slice();
  servers.forEach((s) => { have[s.url] = 1; });
  servers.forEach((s) => {
    const m = /^(https?:\/\/tvf90\.com\/)(?:\d+|hd|canal)\.php\?stream=([\w-]+)$/.exec(s.url);
    if (!m) return;
    ["1", "2", "3", "hd", "canal"].forEach((v) => {
      const u = m[1] + v + ".php?stream=" + m[2];
      if (!have[u]) { have[u] = 1; out.push({ name: s.name.replace(/\s*·.*$/, "") + " · " + (v === "canal" ? "alterna" : v === "hd" ? "HD" : "OP" + v), url: u, kind: "embed", alt: true }); }
    });
  });
  return out;
}

/** API Strapi compartida (futbollibretvplay.org → api.wqxag.com; pelotalibre.mx → agenda18.com; mismos ids y embeds). */
async function strapi(apiUrl, referer, source, pri) {
  const r = await fetchText(apiUrl, { referer: referer + "/", headers: { accept: "application/json" }, timeout: 5000 });
  if (!r.ok) return [];
  let data;
  try { data = JSON.parse(r.text).data || []; } catch (e) { return []; }
  const out = [];
  for (const x of data) {
    const a = x.attributes || x;
    const title = String(a.diary_description || "").replace(/\s+/g, " ").trim();
    const { league, home, away } = splitTitle(title);
    const sport = classify(league, title);
    if (!sport || (!away && TEAM_LIKE[sport])) continue;
    const embeds = (a.embeds && a.embeds.data) || [];
    const servers = [], seen = {};
    for (const e of embeds) {
      const ea = e.attributes || e;
      let url = String(ea.embed_iframe || "").trim();
      if (!url) continue;
      const q = /[?&]r=([^&]+)/.exec(url);
      const real = q && b64any(q[1]);
      url = (real || (url.startsWith("http") ? url : referer + (url.startsWith("/") ? "" : "/") + url)).trim();
      if (seen[url]) continue; seen[url] = 1;
      servers.push({ name: decodeEntities(String(ea.embed_name || "Servidor")).replace(/[┃|]/g, " · ").replace(/\s+/g, " ").trim(), url, kind: "embed" });
    }
    out.push({ title, league: league || "Fútbol", home, away, start: limaToIso(a.date_diary, a.diary_hour), sport, servers: withTvfVariants(servers), source, pri });
  }
  return out;
}
export const futbollibre = () => strapi("https://api.wqxag.com/diaries.json", FL_SITE, "futbollibre", 1);
/** pelotalibre.mx: su app.js lee https://agenda18.com/agenda.json (mismo formato; CORS abierto). */
export const pelotalibre = () => strapi("https://agenda18.com/agenda.json", "https://pelotalibre.mx", "pelotalibre", 1);

/** pirllotv.hair (= pirlo.rest): WordPress con el plugin «futbol-agenda» → /wp-content/uploads/futbol-agenda/agenda.json
 *  { data:[{ title:"Liga: A vs B", date_raw, time_raw (hora de Lima), country, channels:[{ name, stream_url }] }] } (los enlaces son de tvf90.com). */
export async function pirllotv() {
  const r = await fetchText("https://pirllotv.hair/wp-content/uploads/futbol-agenda/agenda.json", { referer: "https://pirllotv.hair/", headers: { accept: "application/json" }, timeout: 5000 });
  if (!r.ok) return [];
  let d;
  try { d = JSON.parse(r.text).data || []; } catch (e) { return []; }
  const out = [];
  for (const x of d) {
    const title = String(x.title || "").replace(/\s+/g, " ").trim();
    const { league, home, away } = splitTitle(title);
    const sport = classify(league + " " + (x.country || ""), title);
    if (!sport || (!away && TEAM_LIKE[sport])) continue;
    const servers = [], seen = {};
    for (const c of x.channels || []) {
      const url = String(c.stream_url || "").trim(); if (!/^https?:/.test(url) || seen[url]) continue; seen[url] = 1;
      servers.push({ name: decodeEntities(String(c.name || "Servidor")).replace(/\s*\|\s*/g, " · "), url, kind: "embed" });
    }
    if (!servers.length) continue;
    out.push({ title, league: league || x.country || "Fútbol", home, away, start: limaToIso(x.date_raw, x.time_raw), sport, servers: withTvfVariants(servers), source: "pirllotv", pri: 1 });
  }
  return out;
}

/** pirlotvonoine.site / pelotalibrehd.me (Astro): /api/agenda → { events:[{ title, date, time (Lima), embeds:[{ name, lang, iframe }] }] }. Mismos ids que agenda18; sirve de respaldo. */
export async function pirlotvonoine() {
  const r = await fetchText("https://pirlotvonoine.site/api/agenda", { referer: "https://pirlotvonoine.site/", headers: { accept: "application/json" }, timeout: 5000 });
  if (!r.ok) return [];
  let d;
  try { d = JSON.parse(r.text).events || []; } catch (e) { return []; }
  const out = [];
  for (const x of d) {
    const title = String(x.title || "").replace(/\s+/g, " ").trim();
    const { league, home, away } = splitTitle(title);
    const sport = classify(league, title);
    if (!sport || (!away && TEAM_LIKE[sport])) continue;
    const servers = [], seen = {};
    for (const e of x.embeds || []) {
      const url = String(e.iframe || "").trim(); if (!/^https?:/.test(url) || seen[url]) continue; seen[url] = 1;
      servers.push({ name: decodeEntities(String(e.name || "Servidor")).replace(/[┃|]/g, " · "), url, kind: "embed" });
    }
    if (!servers.length) continue;
    out.push({ title, league: league || "Fútbol", home, away, start: limaToIso(x.date, x.time), sport, servers: withTvfVariants(servers), source: "pirlotvonoine", pri: 2 });
  }
  return out;
}

/* ── rojadirectatvlive.me («Tarjeta Roja») ──
   Ingeniería inversa: su app.js consume https://adstrim.quest/api/matches (CORS abierto; respaldo adstrim.site). El «id» ES el id de evento de ESPN,
   hora en UTC, escudos de ESPN y hasta N reproductores en iframe1…iframeN. */
export async function adstrim() {
  let r = null;
  for (const u of ["https://adstrim.quest/api/matches", "https://adstrim.site/api/matches"]) { r = await fetchText(u, { referer: "https://rojadirectatvlive.me/", headers: { accept: "application/json" } }); if (r.ok) break; }
  if (!r || !r.ok) return [];
  let list;
  try { const j = JSON.parse(r.text); list = Array.isArray(j) ? j : j.matches || []; } catch (e) { return []; }
  const out = [];
  list.forEach((m) => {
    const home = String(m.homeTeam || "").trim(), away = String(m.awayTeam || "").trim(), league = String(m.leagueName || "").trim();
    const sport = classify(league, home + " vs " + away);
    if (!sport || !home || (!away && TEAM_LIKE[sport])) return;
    const servers = [];
    Object.keys(m).filter((k) => /^iframe\d*$/.test(k) && /^https?:/.test(m[k])).sort().forEach((k, i) => {
      let host = ""; try { host = new URL(m[k]).hostname.replace(/^www\./, "").split(".").slice(-2, -1)[0] || ""; } catch (e) { /* nada */ }
      servers.push({ name: "Opción " + (i + 1) + (host ? " · " + host : ""), url: m[k], kind: "embed" });
    });
    if (!servers.length) return;
    const start = m.date && m.time ? new Date(m.date + "T" + String(m.time).slice(0, 5) + ":00Z").toISOString() : null;
    out.push({ title: league + ": " + home + " vs " + away, league, home, away, start, sport, servers, espnId: m.id ? "e" + m.id : "", logos: [m.homeTeamLogo || "", m.awayTeamLogo || ""], source: "adstrim", pri: 2 });
  });
  return out;
}

/* ── StreamEast, secciones nuevas: enlaces «/stream/<categoría>/<slug>» con texto «Categoría Título 6 days from now | ● LIVE» ── */
const UNIT = { minute: 60000, hour: 3600000, day: 86400000, week: 604800000 };
async function streameastStreams(path, now) {
  const r = await fetchText("https://streameast.cool" + path);
  if (!r.ok) return [];
  const out = [], seen = new Set();
  const re = /<a[^>]+href="https:\/\/streameast\.cool\/stream\/([a-z0-9-]+)\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(r.text))) {
    const href = "https://streameast.cool/stream/" + m[1] + "/" + m[2];
    if (seen.has(href)) continue;
    let text = stripTags(m[3]).replace(/[●•]/g, " live ").replace(/\s+/g, " ").trim();
    const t = /^(.*?)(?:\s+(\d+)\s+(minute|hour|day|week)s?\s+from now|\s+live\b.*|\s+started\b.*)?$/i.exec(text);
    if (!t || !t[1]) continue;
    const cat = m[1].replace(/-/g, " "), body = t[1].trim();
    const title = body.toLowerCase().indexOf(cat) === 0 ? body.slice(cat.length).trim() : body;
    if (!title) continue;
    seen.add(href);
    const league = cat.split(" ").map((w) => (w.length <= 4 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
    const start = t[2] ? new Date(now.getTime() + +t[2] * UNIT[t[3].toLowerCase()]).toISOString() : now.toISOString();
    const { home, away } = splitTitle(title);
    const sport = classify(league, title);
    out.push({ title: league + ": " + title, league, home: away ? home : title, away, start, sport, servers: [{ name: "StreamEast", url: href, kind: "se", pri: 8 }], source: "streameast", pri: 6, approx: true });
  }
  return out;
}
const SE_PAGES = { f1: ["/f1streams4"], motor: ["/f1streams4"], mma: ["/mmastreams4", "/boxingstreams4", "/wwestreams4"], mlb: ["/mlbstreams4"], nfl: ["/nflstreams4", "/cfbstreams4"] };

/** Todas las entradas del día para un deporte (las fuentes se piden en paralelo y las que fallan se ignoran). */
/** Cada fuente tiene un plazo (4,5 s) y una copia en memoria de la instancia (25 s): una fuente lenta o caída nunca retrasa a las demás ni a la agenda. */
const memo = {};
function cached(key, ttl, fn) {
  const m = memo[key];
  if (m && Date.now() - m.t < ttl) return Promise.resolve(m.d);
  return Promise.race([fn().catch(() => null), new Promise((r) => setTimeout(() => r(null), 4500))]).then((d) => {
    if (d && d.length !== undefined) { memo[key] = { t: Date.now(), d }; return d; }
    return m ? m.d : [];
  });
}

/** Servidores que no funcionan y se quitan siempre: «Capo Deportes» (sofayshop/capopro: caídos o sin vídeo). */
const BAD_NAME = /capo\s*deportes/i;
/** Hosts de reproductor protegidos por dominio / Turnstile («Not allowed — This stream is domain protected»): solo funcionan dentro del sitio original. */
const BLOCKED_HOST = /(^|\.)(pandebut\.net|dynbush\.net|trendplace\.top|quotarevival\.net|golperutv\.xyz|la18hd\.su|streamx99\.com)$/i;   // protegidos por dominio/Turnstile, con acceso denegado o con la URL escondida en un script ofuscado
function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return ""; } }
function dropBad(list) {
  list.forEach((e) => { e.servers = (e.servers || []).filter((sv) => !BAD_NAME.test(sv.name || "") && !BLOCKED_HOST.test(hostOf(sv.url))); });
  return list.filter((e) => e.servers.length || e.source === "streameast");
}

/** Comprueba (con memoria de 30 min) a dónde lleva cada canal de pirlotv: los que acaban en un reproductor bloqueado se descartan antes de llegar a la lista. */
const endMemo = new Map();
async function endsBlocked(url) {
  const m = endMemo.get(url);
  if (m && Date.now() - m.t < 30 * 60e3) return m.b;
  let b = false, u = url, ref;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const r = await fetchText(u, { referer: ref, timeout: 3000 });
      const fr = /<iframe[^>]+src=["']([^"']+)["']/i.exec(r.text);
      if (!fr) { b = BLOCKED_HOST.test(new URL(u).hostname) || /challenges\.cloudflare\.com|domain protected/i.test(r.text) && !/\.m3u8/i.test(r.text); break; }
      ref = r.url; u = new URL(fr[1], r.url).href;
      if (BLOCKED_HOST.test(new URL(u).hostname)) { b = true; break; }
    }
  } catch (e) { /* desconocido: se conserva */ }
  endMemo.set(url, { t: Date.now(), b });
  return b;
}
/** ¿El canal de tvf90.com tiene emisión? (5.php?stream=<id> trae la lista con token; si esa lista responde «not found», el canal está apagado). Memo de 3 min por id. */
const tvfMemo = new Map();
async function tvfAlive(id) {
  const m = tvfMemo.get(id);
  if (m && Date.now() - m.t < 3 * 60e3) return m.ok;
  let ok = true;   // ante la duda (no se pudo comprobar) se conserva
  try {
    const r = await fetchText("https://tvf90.com/5.php?stream=" + encodeURIComponent(id), { referer: "https://tvf90.com/1.php?stream=" + id, timeout: 3000 });
    const mm = /https?:\/\/[^"'\s<>]+?\.m3u8[^"'\s<>]*/i.exec(r.text.replace(/\\\//g, "/"));
    if (mm) { const l = await fetchText(mm[0], { referer: r.url, timeout: 3000 }); ok = l.ok && l.text.trim().startsWith("#EXTM3U"); }
  } catch (e) { ok = true; }
  tvfMemo.set(id, { t: Date.now(), ok });
  return ok;
}
const TVF_ID = /^https?:\/\/tvf90\.com\/[\w]+\.php\?stream=([\w-]+)$/;
export async function pruneDeadTvf(list, budgetMs) {
  const ids = new Set();
  list.forEach((e) => e.servers.forEach((sv) => { const m = TVF_ID.exec(sv.url); if (m && !tvfMemo.has(m[1])) ids.add(m[1]); }));
  const todo = Array.from(ids).slice(0, 60);
  let i = 0;
  const work = Promise.all(Array.from({ length: 14 }, async () => { for (;;) { const id = todo[i++]; if (!id) return; await tvfAlive(id); } }));
  await Promise.race([work, new Promise((r) => setTimeout(r, budgetMs))]);
  list.forEach((e) => { e.servers = e.servers.filter((sv) => { const m = TVF_ID.exec(sv.url); return !(m && tvfMemo.has(m[1]) && !tvfMemo.get(m[1]).ok); }); });
}

async function pruneBlocked(list, budgetMs) {
  const todo = [];
  list.forEach((e) => { if (e.source === "pirlotv") e.servers.forEach((sv) => { if (sv.kind === "embed" && !endMemo.has(sv.url)) todo.push(sv.url); }); });
  const uniq = Array.from(new Set(todo)).slice(0, 60);
  let i = 0;
  const work = Promise.all(Array.from({ length: 12 }, async () => { for (;;) { const u = uniq[i++]; if (!u) return; await endsBlocked(u); } }));
  await Promise.race([work, new Promise((r) => setTimeout(r, budgetMs))]);   // lo que no alcance a comprobarse queda para la siguiente consulta
  list.forEach((e) => { if (e.source === "pirlotv") e.servers = e.servers.filter((sv) => !(endMemo.get(sv.url) || {}).b); });
}

export async function scrapeAgenda(sport, now = new Date()) {
  const T = 25000;
  const jobs = [cached("pirlotv", T, () => pirlotv(now)), cached("futbollibre", T, () => futbollibre()), cached("pelotalibre", T, () => pelotalibre()), cached("pirllotv", T, () => pirllotv()), cached("pirlotvonoine", T, () => pirlotvonoine()), cached("adstrim", T, () => adstrim()), cached("futbolvivo", T, () => futbolvivo())];
  if (sport === "basketball") jobs.push(cached("se:nba", T, () => streameast("/nbastreams4", "basketball", "NBA", now)));
  if (sport === "nhl") jobs.push(cached("se:nhl", T, () => streameast("/nhlstreams4", "nhl", "NHL", now)));
  (SE_PAGES[sport] || []).forEach((pg) => jobs.push(cached("se:" + pg, T, () => streameastStreams(pg, now))));
  const lists = await Promise.all(jobs);
  const all = [].concat(...lists).filter((e) => e.sport === sport && !isNaN(e.start ? Date.parse(e.start) : 0));
  await Promise.all([pruneBlocked(all, 3000), pruneDeadTvf(all, 3000)]);
  return dropBad(all);
}
