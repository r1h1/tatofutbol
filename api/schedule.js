/* GET /api/schedule?sport=football|basketball|nhl&date=YYYYMMDD
   Une el calendario oficial de ESPN (hora, marcador, escudos) con TODAS las fuentes de transmisión (pirlotv, futbollibretvplay/rojadirecta, rojadirectatvlive, StreamEast).
   Pasos: 1) las fuentes se agrupan en «clusters» por partido (mismo id de ESPN o equipos parecidos y hora cercana) y sus servidores se fusionan;
   2) cada evento de ESPN toma su cluster; 3) los clusters sin evento de ESPN aparecen igualmente (ligas menores).
   Todo ocurre UNA vez por ventana de caché en el CDN: miles de visitantes = 1 ejecución. */
import { json, fail, canon, nameScore, hash, ymd } from "../lib/core.js";
import { espnDay } from "../lib/espn.js";
import { SPORTS, isSport } from "../lib/sports.js";
import { scrapeAgenda } from "../lib/sources.js";

export const config = { runtime: "edge" };

const TZ_SOURCES = -5;
const MAX_GAP = 4 * 3600e3;

/** Parecido de un par de equipos (acepta el orden invertido). */
function pair(a1, b1, a2, b2) {
  const x1 = canon(a1), y1 = canon(b1), x2 = canon(a2), y2 = canon(b2);
  return Math.max(Math.min(nameScore(x1, x2), nameScore(y1, y2)), Math.min(nameScore(x1, y2), nameScore(y1, x2)));
}
function near(t1, t2) { return !t1 || !t2 || Math.abs(Date.parse(t1) - Date.parse(t2)) <= MAX_GAP; }

/** Minutos de diferencia entre dos horas del día (circular). */
function clockGap(a, b) { const d = Math.abs(((Date.parse(a) - Date.parse(b)) / 60000) % 1440); return Math.min(d, 1440 - d); }

/** Las fuentes que solo dan HH:MM (pirlotv) no dicen el día (y cerca de medianoche listan el de ayer): se ancla con ESPN u otra fuente que sí lo dé; si no, el día más cercano a «ahora». */
function resolveDayless(scraped, espn, now) {
  const anchors = espn.map((e) => ({ h: e.a.n, a: e.b.n, start: e.start })).concat(scraped.filter((s) => !s.dayless && s.start).map((s) => ({ h: s.home, a: s.away, start: s.start })));
  const byId = {};
  espn.forEach((e) => { byId[e.id] = e; });
  scraped.forEach((s) => {
    if (s.espnId && byId[s.espnId]) { s.start = byId[s.espnId].start; return; } // adstrim usa el id de ESPN: su hora es la oficial
    if (s.espnId) s.dayless = true; // id desconocido: su «date» no es fiable, solo la hora
    if (!s.dayless || !s.start) return;
    let best = null, bs = 0.6;
    anchors.forEach((a) => { if (clockGap(a.start, s.start) <= 30) { const sc = pair(a.h, a.a, s.home, s.away); if (sc > bs) { bs = sc; best = a; } } });
    if (best) { s.start = best.start; return; }
    const base = Date.parse(s.start);
    let pick = base, d = Infinity;
    [-1, 0, 1].forEach((k) => { const t = base + k * 86400000, gap = Math.abs(t - (now.getTime() + 8 * 3600e3)); if (gap < d) { d = gap; pick = t; } });
    s.start = new Date(pick).toISOString();
  });
}

function mergeServers(dst, add, pri) {
  const seen = {};
  dst.forEach((s) => { seen[s.url] = 1; });
  add.forEach((s) => { if (!seen[s.url]) { seen[s.url] = 1; dst.push({ ...s, pri: s.pri != null ? s.pri : pri }); } });
}

function cluster(scraped) {
  const cl = [];
  scraped.forEach((s) => {
    let c = null;
    for (const k of cl) {
      if ((s.espnId && k.espnId === s.espnId) || (pair(s.home, s.away, k.home, k.away) >= 0.7 && near(s.start, k.start))) { c = k; break; }
    }
    if (!c) { c = { home: s.home, away: s.away, league: s.league, start: s.start, espnId: s.espnId || "", approx: !!s.approx, logos: s.logos || null, servers: [] }; cl.push(c); }
    if (!c.espnId && s.espnId) c.espnId = s.espnId;
    if (c.approx && !s.approx && s.start) { c.start = s.start; c.approx = false; }
    if (!c.logos && s.logos) c.logos = s.logos;
    mergeServers(c.servers, s.servers, s.pri || 5);
  });
  cl.forEach((c) => c.servers.sort((a, b) => (a.pri || 5) - (b.pri || 5)));
  return cl;
}

export default async function handler(request) {
  const url = new URL(request.url);
  const sport = (url.searchParams.get("sport") || "football").toLowerCase();
  if (!isSport(sport)) return fail(400, "deporte no soportado");
  const kind = SPORTS[sport].kind;
  const now = new Date();
  const today = ymd(now, TZ_SOURCES);
  let date = (url.searchParams.get("date") || today).replace(/\D/g, "");
  if (!/^\d{8}$/.test(date)) date = today;

  // Ventana de 3 días (D-1, D, D+1): cubre las diferencias horarias; el cliente filtra por su día local.
  const day = (n) => ymd(new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8) + n)), 0);
  const days = [day(-1), day(0), day(1)];
  const inWindow = days.indexOf(today) >= 0;
  const [espnDays, scraped] = await Promise.all([Promise.all(days.map((d) => espnDay(sport, d))), inWindow ? scrapeAgenda(sport, now) : Promise.resolve([])]);
  const seenIds = new Set();
  const t0 = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)) - 86400000, t1 = t0 + 3 * 86400000;
  // el tenis llega mezclado de varios días: solo se conserva la ventana pedida (carreras, carteleras y torneos son pocos y se envían completos)
  const espn = [].concat(...espnDays).filter((e) => !seenIds.has(e.id) && seenIds.add(e.id) && (kind !== "tennis" || (Date.parse(e.start) >= t0 && Date.parse(e.start) < t1)));

  resolveDayless(scraped, espn, now);
  const clusters = cluster(scraped), used = new Set();
  const matches = espn.map((e) => {
    let best = -1, bestScore = 0.6;
    clusters.forEach((c, i) => {
      if (used.has(i)) return;
      let sc;
      if (c.espnId === e.id) sc = 2;
      else if (kind === "team") sc = near(c.start, e.start) ? pair(e.a.n, e.b.n, c.home, c.away) : 0;
      else if (kind === "tennis") sc = near(c.start, e.start) && (c.away || /\bvs\b/i.test(c.home)) ? pair(e.a.n, e.b.n, c.home, c.away) : 0;
      else sc = c.start && e.start && Math.abs(Date.parse(c.start) - Date.parse(e.start)) <= 90 * 60e3 ? 0.7 : 0; // carreras, carteleras y torneos: la misma hora
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    const m = { id: e.id, sport, league: e.league, start: e.start, state: e.state, detail: e.detail, a: e.a, b: e.b, servers: [] };
    if (best >= 0) {
      used.add(best);
      const c = clusters[best];
      m.servers = c.servers;
      if (sport === "football" && !c.espnId) { // nombres en español como los publican las fuentes, alineados con el orden de ESPN
        if (c.league) m.league = c.league;
        const straight = Math.min(nameScore(canon(e.a.n), canon(c.home)), nameScore(canon(e.b.n), canon(c.away))) >= Math.min(nameScore(canon(e.a.n), canon(c.away)), nameScore(canon(e.b.n), canon(c.home)));
        m.a = { ...e.a, n: straight ? c.home : c.away }; m.b = { ...e.b, n: straight ? c.away : c.home };
      }
    }
    return m;
  });

  clusters.forEach((c, i) => {
    if (used.has(i) || date !== today) return;
    const start = c.start ? new Date(Date.parse(c.start) + 0).toISOString() : now.toISOString();
    const lg = c.logos || ["", ""];
    matches.push({
      id: "s" + hash(sport + c.home + c.away + c.start), sport, league: c.league, start, state: "est", detail: "", approx: c.approx,
      a: { n: c.home, ab: "", logo: lg[0], s: "" }, b: { n: c.away, ab: "", logo: lg[1], s: "" }, servers: c.servers,
    });
  });

  // Fútbol: ESPN lista cientos de partidos; se muestran los que tienen transmisión (si ninguna fuente respondió, solo los primeros 120).
  let list = matches;
  if (sport === "football") {
    const withStreams = matches.filter((m) => m.servers.length);
    list = withStreams.length ? withStreams : matches.slice(0, 120);
  }
  list.sort((x, y) => String(x.start || "").localeCompare(String(y.start || "")));

  return json({ sport, date, at: now.toISOString(), matches: list }, { sMaxAge: inWindow ? 15 : 1800, swr: inWindow ? 5 : 86400 });   // hoy: el CDN solo conserva 15 s (marcadores y estados casi en tiempo real); otros días: 30 min
}
