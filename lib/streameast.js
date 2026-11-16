/* TatoTV · lib/streameast.js — servidores de una página de partido de StreamEast (ingeniería inversa).
   La página de cada partido (streameast.cool/<deporte>/<slug>/<id>) trae botones «Server1», «Server2»… con id="stream-btn-<id>" y un iframe
   (<iframe id="wp_player" src="https://gooz.aapmains.net/new-stream-embed/<id>?ad=…">). Cada servidor es ESE mismo embed con otro id.
   El embed solo se deja incrustar en una lista de dominios (frame-ancestors): por eso NO se incrusta; /api/resolve lee de él la lista HLS
   (SOURCE = «…/playlist/<id>/load-playlist», que exige Referer del propio embed) y la reproduce nuestro reproductor. */
import { fetchText, decodeEntities } from "./core.js";

const HOSTS = /(^|\.)streameast\.(cool|app|gd|gg|name|ws)$|(^|\.)thestreameast\.(one|top|ai)$|(^|\.)istreameast\.(app|co\.com)$/i;
export const isStreamEastPage = (u) => { try { const x = new URL(u); return x.protocol === "https:" && HOSTS.test(x.hostname); } catch (e) { return false; } };

const memo = new Map();   // url → { t, list }: las señales de un partido se consultan una vez cada 45 s por instancia
export async function streamEastServers(pageUrl) {
  const m = memo.get(pageUrl);
  if (m && Date.now() - m.t < 45e3) return m.list;
  const r = await fetchText(pageUrl, { timeout: 8000, referer: "https://streameast.cool/" });
  if (!r.ok) return m ? m.list : [];
  const html = r.text;
  const fr = /<iframe[^>]+id=["']wp_player["'][^>]+src=["']([^"']+)["']/i.exec(html) || /<iframe[^>]+src=["']([^"']*new-stream-embed[^"']+)["']/i.exec(html);
  if (!fr) { memo.set(pageUrl, { t: Date.now(), list: [] }); return []; }
  const base = decodeEntities(fr[1]);
  const list = [], seen = {};
  const re = /id=["']stream-btn-(\d+)["'][^>]*>\s*([^<]*?)\s*</g;
  let x;
  while ((x = re.exec(html))) {
    if (seen[x[1]]) continue; seen[x[1]] = 1;
    const url = base.replace(/\/\d+(\?|$)/, "/" + x[1] + "$1");
    const name = (x[2] || "").replace(/^Server\s*(\d+)$/i, "Servidor $1").trim() || "Servidor " + (list.length + 1);
    list.push({ name, url, kind: "embed" });
  }
  if (!list.length) list.push({ name: "Servidor 1", url: base, kind: "embed" });
  memo.set(pageUrl, { t: Date.now(), list });
  return list;
}
