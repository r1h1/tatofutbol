/* TatoTV · lib/espn.js — calendario, estados, marcadores y escudos/banderas de la API pública de ESPN, compactados a un formato único.
   Cada evento: { id, league, start, state: pre|in|post, detail, a:{n,ab,logo,s}, b:{…} }.
   team → «A vs B» (fútbol, NBA, NHL, NFL, MLB) · tennis → un partido por enfrentamiento individual · race → una sesión (práctica, clasificación, carrera)
   fight → una cartelera · event → un torneo (golf). La API no acepta rangos de fechas: en los deportes por día se pide un día por llamada. */
import { fetchText } from "./core.js";
import { SPORTS } from "./sports.js";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/";
const EMPTY = { n: "", ab: "", logo: "", s: "" };

const memo = {};   // copia de 12 s en la instancia: varias ventanas de días y varios visitantes comparten la misma llamada a ESPN
async function getJSON(path, qs) {
  const key = path + "?" + (qs || ""), m = memo[key];
  if (m && Date.now() - m.t < 12000) return m.d;
  const r = await fetchText(BASE + path + "/scoreboard" + (qs ? "?" + qs : ""), { timeout: 5000, headers: { accept: "application/json" } });
  if (!r.ok) return m ? m.d : null;
  try { const d = JSON.parse(r.text); memo[key] = { t: Date.now(), d }; return d; } catch (e) { return m ? m.d : null; }
}
const iso = (d) => (d && d.length === 17 ? d.replace("Z", ":00Z") : d);
function status(st) {
  st = st || {}; const ty = st.type || {};
  return { state: ty.state || "pre", detail: ty.state === "in" ? (st.displayClock && st.displayClock !== "0:00" ? st.displayClock : ty.shortDetail || "") : ty.shortDetail || "" };
}

/* ── equipos ── */
function team(e, sport, cfg) {
  const c = (e.competitions || [])[0];
  if (!c || !c.competitors || c.competitors.length < 2) return null;
  const home = c.competitors.find((x) => x.homeAway === "home") || c.competitors[0];
  const away = c.competitors.find((x) => x.homeAway === "away") || c.competitors[1];
  const side = (x) => ({ n: x.team.displayName || x.team.name || "", ab: x.team.abbreviation || "", logo: x.team.logo || "", s: x.score != null && x.score !== "" ? String(x.score) : "" });
  const us = sport !== "football"; // en deportes de EE. UU. se muestra «visitante vs local»
  const note = (c.altGameNote || "").split(",")[0].trim();
  const st = status(c.status || e.status);
  return { id: "e" + e.id, league: cfg.league || note || "Fútbol", start: iso(e.date), state: st.state, detail: st.detail, a: us ? side(away) : side(home), b: us ? side(home) : side(away) };
}

/* ── tenis ── */
function tennis(d, tour) {
  const out = [];
  for (const e of d.events || []) {
    for (const g of e.groupings || []) {
      const gname = (g.grouping && (g.grouping.displayName || g.grouping.slug)) || "";
      if (!/single/i.test(gname)) continue; // solo individuales (los dobles no traen nombres completos)
      for (const c of g.competitions || []) {
        const cs = c.competitors || [];
        if (cs.length < 2) continue;
        const nm = (x) => (x.athlete && (x.athlete.displayName || x.athlete.fullName)) || "";
        const sets = (x) => (x.linescores || []).map((l) => (l.value != null ? Math.round(l.value) : "")).join("-");
        const won = (x) => (x.linescores || []).filter((l) => l.winner).length;
        const [p, q] = cs.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        if (!nm(p) || !nm(q)) continue;
        const st = status(c.status);
        const flag = (x) => (x.athlete && x.athlete.flag && x.athlete.flag.href) || "";
        const round = (c.round && (c.round.displayName || c.round.name)) || "";
        out.push({
          id: "e" + (c.id || e.id + nm(p)), league: [e.name, tour.toUpperCase(), round].filter(Boolean).join(" · "), start: iso(c.startDate || c.date), state: st.state,
          detail: st.state === "pre" ? st.detail : sets(p) + " / " + sets(q),
          a: { n: nm(p), ab: "", logo: flag(p), s: st.state === "pre" ? "" : String(won(p)) }, b: { n: nm(q), ab: "", logo: flag(q), s: st.state === "pre" ? "" : String(won(q)) },
        });
      }
    }
  }
  return out;
}

/* ── carreras: una entrada por sesión ── */
const SESSION = { FP1: "Práctica libre 1", FP2: "Práctica libre 2", FP3: "Práctica libre 3", Qual: "Clasificación", SQ: "Clasificación sprint", Sprint: "Sprint", Race: "Carrera" };
function race(d, cfg) {
  const out = [];
  for (const e of d.events || []) {
    const circuit = (e.circuit && (e.circuit.fullName || e.circuit.shortName)) || "";
    for (const c of e.competitions || []) {
      const ab = (c.type && c.type.abbreviation) || "";
      const st = status(c.status);
      out.push({ id: "e" + c.id, league: [e.name, circuit].filter(Boolean).join(" · ") || cfg.league, start: iso(c.startDate || c.date || e.date), state: st.state, detail: st.detail, a: { ...EMPTY, n: SESSION[ab] || (e.competitions.length === 1 ? e.shortName || e.name : ab || "Sesión"), ab }, b: EMPTY });
    }
  }
  return out;
}

/* ── carteleras y torneos: una entrada por evento ── */
function whole(d, cfg, sport) {
  const out = [];
  for (const e of d.events || []) {
    const st = status(e.status);
    const comps = e.competitions || [];
    let sub = cfg.league;
    if (sport === "mma") {
      const main = comps[comps.length - 1];
      const names = main && (main.competitors || []).map((x) => (x.athlete && x.athlete.displayName) || "").filter(Boolean);
      sub = cfg.league + (names && names.length === 2 ? " · " + names.join(" vs ") : "") + (comps.length ? " · " + comps.length + " combates" : "");
    }
    out.push({ id: "e" + e.id, league: sub, start: iso(e.date), state: st.state, detail: st.detail, a: { ...EMPTY, n: e.name || e.shortName || cfg.league }, b: EMPTY });
  }
  return out;
}

/** Eventos de ESPN de un deporte para un día (YYYYMMDD). En carreras, carteleras y torneos se pide la jornada vigente (no depende del día). */
export async function espnDay(sport, ymdStr) {
  const cfg = SPORTS[sport];
  if (!cfg || !cfg.paths.length) return [];
  const daily = cfg.kind === "team" || cfg.kind === "tennis";
  const res = await Promise.all(cfg.paths.map((p) => getJSON(p, daily ? "dates=" + ymdStr + "&limit=300" : "")));
  const out = [];
  res.forEach((d, i) => {
    if (!d) return;
    if (cfg.kind === "team") (d.events || []).forEach((e) => { const t = team(e, sport, cfg); if (t) out.push(t); });
    else if (cfg.kind === "tennis") out.push(...tennis(d, cfg.paths[i].split("/")[1]));
    else if (cfg.kind === "race") out.push(...race(d, cfg));
    else out.push(...whole(d, cfg, sport));
  });
  return out;
}
