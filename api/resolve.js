/* GET /api/resolve?url=<página con reproductor>
   Sigue los iframes (con Referer) y extrae el .m3u8 vivo sin navegador: ver lib/resolver.js (cómo obtienen sus enlaces estos sitios).
   Respuesta: { stream, referer } o { stream:null, frame } (el cliente incrusta el reproductor real, sin el portal). */
import { json, fail, isSafeUrl, sameOrigin } from "../lib/core.js";
import { resolveEmbed } from "../lib/resolver.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (!sameOrigin(request)) return fail(403, "origen no permitido");
  const target = new URL(request.url).searchParams.get("url") || "";
  if (!isSafeUrl(target)) return fail(400, "url inválida");
  const r = await resolveEmbed(target);
  return r.stream ? json(r, { sMaxAge: 60, swr: 30 }) : json(r, { sMaxAge: 30, swr: 30 });
}
