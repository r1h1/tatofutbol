/* GET /api/channels?sport=football&src=hub|m3u
   Canales deportivos 24/7 de fuentes públicas: «hub» (canales de los sitios de agenda → tvf90) y «m3u» (listas IPTV comprobadas una a una).
   Respuesta compacta; CDN 30 min + 2 h de «stale-while-revalidate»: miles de visitas = una pasada. */
import { json, fail } from "../lib/core.js";
import { isSport } from "../lib/sports.js";
import { m3uChannels, hubChannels, hubFor } from "../lib/channels.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  const q = new URL(request.url).searchParams;
  const sport = (q.get("sport") || "football").toLowerCase(), src = q.get("src") || "m3u";
  if (!isSport(sport)) return fail(400, "deporte no soportado");
  let items = [];
  try { items = src === "hub" ? hubFor(sport, await hubChannels()) : await m3uChannels(sport); } catch (e) { items = []; }
  return json({ sport, src, at: new Date().toISOString(), items }, { sMaxAge: 1800, swr: 7200 });
}
