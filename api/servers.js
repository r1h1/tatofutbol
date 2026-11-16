/* GET /api/servers?url=<página de partido de StreamEast>
   Devuelve los servidores del partido: [{ name, url, kind:"embed" }] (cada url la resuelve /api/resolve a una lista HLS). CDN: 30 s. */
import { json, fail, sameOrigin } from "../lib/core.js";
import { streamEastServers, isStreamEastPage } from "../lib/streameast.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (!sameOrigin(request)) return fail(403, "origen no permitido");
  const u = new URL(request.url).searchParams.get("url") || "";
  if (!isStreamEastPage(u)) return fail(400, "url no admitida");
  const servers = await streamEastServers(u).catch(() => []);
  return json({ servers }, { sMaxAge: 30, swr: 15 });
}
