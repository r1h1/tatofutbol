/* TatoTV · lib/sports.js — catálogo de deportes y clasificación de títulos de las fuentes.
   kind: team = «local vs visitante» (ESPN con marcador) · tennis = partidos individuales · race = sesiones (F1, IndyCar) · fight = carteleras · event = torneos.
   «other» recoge todo lo que no encaja (ciclismo, voleibol, balonmano…) para que nada se mezcle con otro deporte. */
export const SPORTS = {
  football: { kind: "team", paths: ["soccer/all"], league: "" },
  basketball: { kind: "team", paths: ["basketball/nba"], league: "NBA" },
  nhl: { kind: "team", paths: ["hockey/nhl"], league: "NHL" },
  nfl: { kind: "team", paths: ["football/nfl"], league: "NFL" },
  mlb: { kind: "team", paths: ["baseball/mlb"], league: "MLB" },
  f1: { kind: "race", paths: ["racing/f1"], league: "Fórmula 1" },
  tennis: { kind: "tennis", paths: ["tennis/atp", "tennis/wta"], league: "Tenis" },
  mma: { kind: "fight", paths: ["mma/ufc"], league: "UFC" },
  golf: { kind: "event", paths: ["golf/pga"], league: "PGA Tour" },
  motor: { kind: "race", paths: ["racing/irl"], league: "IndyCar" },
  rugby: { kind: "none", paths: [], league: "Rugby" },
  other: { kind: "none", paths: [], league: "Otros" },
};
export const isSport = (k) => Object.prototype.hasOwnProperty.call(SPORTS, k);
/** Deportes donde un evento es «A vs B» (si la fuente no trae rival, se descarta). */
export const TEAM_LIKE = { football: 1, basketball: 1, nhl: 1, nfl: 1, mlb: 1, rugby: 0, tennis: 0 };

/* Orden importante: lo más específico primero. */
const RULES = [
  ["motor", /\b(motogp|moto ?[23]|superbike|wsbk|nascar|indycar|wrc|rally|rallye|dakar|wec|le mans|dtm|formula e|f[oó]rmula e|supercross|motocross|motorsport|motociclismo|automovilismo)\b/i],
  ["f1", /\b(f1|formula ?1|f[oó]rmula ?(1|uno)|gran premio|grand prix|fp[123]|pr[aá]cticas? ?(libres?|\d)|free practice|qualifying|sprint shootout)\b/i],
  ["tennis", /\b(tenis|tennis|atp|wta|roland garros|wimbledon|us open|australian open|abierto de|davis cup|copa davis|billie jean|challenger|itf|round robin|nitto|finals)\b.*|^(tenis|tennis)\b/i],
  ["mma", /\b(ufc|mma|bellator|pfl|one championship|one fc|lfa|knockout|boxeo|boxing|box|wwe|aew|lucha libre|combate|peleas?|fight night|cage)\b/i],
  ["nfl", /\b(nfl|ncaa football|f[uú]tbol americano|american football|super bowl|cfl)\b/i],
  ["mlb", /\b(mlb|b[eé]isbol\w*|baseball|serie del caribe|lidom|liga mexicana de b[eé]isbol|npb|kbo|world series)\b/i],
  ["golf", /\b(golf|pga|lpga|dp world|ryder|masters de augusta|liv golf|round \d)\b/i],
  ["rugby", /\b(rugby|six nations|seis naciones|super rugby|nations championship|top 14|premiership rugby|urc)\b/i],
  ["nhl", /\b(nhl|hockey\w*|khl|ahl)\b/i],
  ["basketball", /\b(nba|wnba|euroliga|euroleague|baloncesto|basket\w*|basquet\w*|b[aá]squet\w*|acb|fiba|ncaab|nbl|bsn|g league)\b/i],
  ["other", /\b(voley|v[oó]ley|volleyball|handball|balonmano|ciclismo|tour de france|giro|vuelta a|nataci[oó]n|atletismo|snooker|dardos|darts|esports?|cricket|cr[ií]quet|badminton|p[aá]del|padel|waterpolo|hockey sobre|patinaje|esqu[ií]|ski|biathlon|bi[aá]tlon|gimnasia|judo|halterofilia|remo|triatl[oó]n|surf|skate|billar|petanca|pelota|f[uú]tbol sala|futsal|beach)\b/i],
];
/** Devuelve la clave del deporte para una liga/título de una fuente. Si nada coincide, es fútbol (la mayoría de las agendas). */
export function classify(league, title) {
  const t = (league || "") + " " + (title || "");
  // «Tenis – WTA Finals…», «Golf – …», «Rugby – …»: el prefijo antes del primer guion manda
  const pre = /^\s*([A-Za-zÁÉÍÓÚáéíóúñ0-9 .]+?)\s+[–—-]\s+/.exec(t);
  if (pre) for (const [k, re] of RULES) if (re.test(pre[1])) return k;
  for (const [k, re] of RULES) if (re.test(t)) return k;
  return "football";
}
