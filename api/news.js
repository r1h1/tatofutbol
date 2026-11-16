/* GET /api/news?sport=football|basketball|nhl
   Solo titulares RECIENTES: fecha válida, del año en curso y de los últimos 7 días (si hay pocos, hasta 14). Sin fecha → se descarta.
   Feeds abandonados (AS publica contenido de 2022) y notas de otros deportes quedan fuera. CDN: 15 min + 1 h de «stale-while-revalidate». */
import { json, fetchText, stripTags, norm } from "../lib/core.js";

export const config = { runtime: "edge" };

const FOOT = /\b(f[uú]tbol|gol(es)?|liga|copa|champions|mundial|selecci[oó]n|premier|laliga|libertadores|sudamericana|eliminatorias|nations league|uefa|fifa|concacaf|conmebol|bar[cç]a|madrid|atl[eé]tico|real|boca|river|am[eé]rica|chivas|tigres|cruz azul|pumas|messi|cristiano|mbapp[eé]|haaland|yamal|entrenador|dt|fichaje|jornada|clasico|cl[aá]sico|serie a|bundesliga|soccer|goal)\b/i;
const F1RE = /\b(f1|f[oó]rmula ?1|formula 1|gran premio de (las vegas|abu dabi|qatar|brasil|m[eé]xico|estados unidos|austin|s[aã]o paulo|miami|mónaco|monaco|espa[nñ]a|italia|hungr[ií]a|b[eé]lgica|holanda|gran breta[nñ]a|singapur|jap[oó]n|china|australia|canad[aá]|austria|bahr[eé]in|arabia)|grand prix|verstappen|hamilton|leclerc|norris|piastri|alonso|sainz|russell|antonelli|colapinto|red bull|ferrari|mercedes|mclaren|aston martin|williams|alpine|haas|cadillac|audi)\b/i;
const NOF1 = (t) => !F1RE.test(t) || /moto ?gp|moto ?[23]|nascar|indycar|wrc|rally|superbike/i.test(t);
const NOMAIN = (t) => !/\b(f[uú]tbol|soccer|football|nba|nfl|mlb|nhl|f1|f[oó]rmula|tenis|tennis|golf|ufc|mma|boxeo|boxing|rugby|moto ?gp|baseball|b[eé]isbol|basketball|baloncesto|hockey|quarterback|touchdown|home run|premier league|champions)\b/i.test(t);
const FEEDS = {
  football: [
    ["Marca", "https://e00-marca.uecdn.es/rss/futbol.xml"],
    ["Mundo Deportivo", "https://www.mundodeportivo.com/rss/futbol"],
    ["ESPN", "https://www.espn.com/espn/rss/soccer/news"],
    ["Olé", "https://www.ole.com.ar/rss/ultimas-noticias/", FOOT],
    ["El Universo", "https://www.eluniverso.com/arcio/rss/category/deportes/", FOOT],
  ],
  basketball: [
    ["Marca NBA", "https://e00-marca.uecdn.es/rss/baloncesto/nba.xml"],
    ["Marca", "https://e00-marca.uecdn.es/rss/baloncesto.xml"],
    ["Mundo Deportivo", "https://www.mundodeportivo.com/rss/baloncesto"],
    ["ESPN", "https://www.espn.com/espn/rss/nba/news"],
  ],
  f1: [["ESPN F1", "https://www.espn.com/espn/rss/f1/news"], ["Marca Motor", "https://e00-marca.uecdn.es/rss/motor.xml", (t) => F1RE.test(t) && !/moto ?gp|moto ?[23]/i.test(t)], ["ESPN RPM", "https://www.espn.com/espn/rss/rpm/news", F1RE]],
  tennis: [["Marca Tenis", "https://e00-marca.uecdn.es/rss/tenis.xml"], ["Mundo Deportivo", "https://www.mundodeportivo.com/rss/tenis"], ["ESPN", "https://www.espn.com/espn/rss/tennis/news"]],
  nfl: [["ESPN", "https://www.espn.com/espn/rss/nfl/news"], ["CBS Sports", "https://www.cbssports.com/rss/headlines/nfl/"]],
  mlb: [["ESPN", "https://www.espn.com/espn/rss/mlb/news"], ["CBS Sports", "https://www.cbssports.com/rss/headlines/mlb/"]],
  mma: [["ESPN MMA", "https://www.espn.com/espn/rss/mma/news"], ["ESPN Boxing", "https://www.espn.com/espn/rss/boxing/news"]],
  golf: [["Marca Golf", "https://e00-marca.uecdn.es/rss/golf.xml"], ["ESPN", "https://www.espn.com/espn/rss/golf/news"]],
  rugby: [["ESPN", "https://www.espn.com/espn/rss/rugby/news"]],
  motor: [["Marca Motor", "https://e00-marca.uecdn.es/rss/motor.xml", NOF1], ["ESPN RPM", "https://www.espn.com/espn/rss/rpm/news", NOF1]],
  other: [["Marca", "https://e00-marca.uecdn.es/rss/mas-deportes.xml", NOMAIN]],
  nhl: [
    ["Sportsnet", "https://www.sportsnet.ca/hockey/feed/"],
    ["CBS Sports", "https://www.cbssports.com/rss/headlines/nhl/"],
    ["ESPN", "https://www.espn.com/espn/rss/nhl/news"],
  ],
};

function tag(block, name) {
  const m = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i").exec(block);
  return m ? m[1] : "";
}

function parse(xml, source, filter) {
  const out = [], re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[0];
    const title = stripTags(tag(b, "title"));
    let link = stripTags(tag(b, "link"));
    if (!link) { const h = /<link[^>]+href="([^"]+)"/i.exec(b); link = h ? h[1] : ""; }
    const date = stripTags(tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "published") || tag(b, "updated"));
    const ts = Date.parse(date);
    const img = (/<(?:media:content|media:thumbnail|enclosure)[^>]+url="([^"]+)"/i.exec(b) || [])[1] || "";
    const desc = stripTags(tag(b, "description")).slice(0, 200);
    if (!title || /^portada\b/i.test(title) || !/^https?:\/\//.test(link) || isNaN(ts)) continue;
    if (filter && !(typeof filter === "function" ? filter(title + " " + desc) : filter.test(title + " " + desc))) continue;
    out.push({ title, link, source, ts, img: /^https:/.test(img) ? img : "" });
  }
  return out;
}

export default async function handler(request) {
  const sport = new URL(request.url).searchParams.get("sport") || "football";
  const feeds = FEEDS[sport] || FEEDS.football;
  const now = Date.now(), year = new Date(now).getUTCFullYear();
  const get = async (url) => { // algunos CDN responden 202 «espera» la primera vez: se reintenta una vez
    let r = await fetchText(url, { timeout: 7000, headers: { "user-agent": "Mozilla/5.0" } });
    if (r.status === 202 || (r.ok && !/<(item|entry)[\s>]/i.test(r.text))) { await new Promise((ok) => setTimeout(ok, 700)); r = await fetchText(url, { timeout: 7000, headers: { "user-agent": "Mozilla/5.0" } }); }
    return r;
  };
  const res = await Promise.all(feeds.map(([name, url, f]) => get(url).then((r) => (r.ok ? parse(r.text, name, f) : []))));
  const valid = [].concat(...res).filter((n) => new Date(n.ts).getUTCFullYear() === year && n.ts <= now + 6 * 3600e3);
  const seen = {}, uniq = [];
  valid.sort((a, b) => b.ts - a.ts).forEach((n) => { const k = norm(n.title).slice(0, 60); if (!seen[k]) { seen[k] = 1; uniq.push(n); } });
  let items = uniq.filter((n) => now - n.ts <= 7 * 86400e3);
  if (items.length < 6) items = uniq.filter((n) => now - n.ts <= 14 * 86400e3);
  // mezcla fuentes: máximo 8 por medio para que ninguno domine
  const per = {};
  items = items.filter((n) => (per[n.source] = (per[n.source] || 0) + 1) <= 8).slice(0, 30);
  return json({ sport, at: new Date(now).toISOString(), items }, { sMaxAge: 900, swr: 3600 });
}
