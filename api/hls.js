/* GET /api/hls?u=<url>&r=<referer>
   Proxy HLS: reescribe las listas .m3u8 para que sus partes pasen por aquí y reenvía segmentos/llaves con el Referer que exige el origen.
   Las listas se cachean 2 s y los segmentos 30 s en el CDN de Vercel: todos los espectadores de un canal comparten UNA descarga al origen. */
import { fail, isSafeUrl, sameOrigin, UA } from "../lib/core.js";

export const config = { runtime: "edge" };

function wrap(abs, referer) {
  return "/api/hls?u=" + encodeURIComponent(abs) + (referer ? "&r=" + encodeURIComponent(referer) : "");
}

function rewrite(text, base, referer) {
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith("#")) {
      return t.replace(/URI="([^"]+)"/g, (m, u) => { try { return 'URI="' + wrap(new URL(u, base).href, referer) + '"'; } catch (e) { return m; } });
    }
    try { return wrap(new URL(t, base).href, referer); } catch (e) { return line; }
  }).join("\n");
}

export default async function handler(request) {
  if (!sameOrigin(request)) return fail(403, "origen no permitido");
  const q = new URL(request.url).searchParams;
  const target = q.get("u") || "", referer = q.get("r") || "";
  if (!isSafeUrl(target)) return fail(400, "url inválida");

  const headers = { "user-agent": UA, accept: "*/*" };
  if (referer && isSafeUrl(referer)) { headers.referer = referer; try { headers.origin = new URL(referer).origin; } catch (e) { /* ignorar */ } }
  const range = request.headers.get("range");
  if (range) headers.range = range;

  let up;
  try { up = await fetch(target, { headers, redirect: "follow" }); } catch (e) { return fail(502, "origen no responde"); }
  if (!up.ok && up.status !== 206) return fail(up.status === 404 ? 404 : 502, "origen devolvió " + up.status);

  const ct = (up.headers.get("content-type") || "").toLowerCase();
  const isList = /mpegurl/.test(ct) || /\.m3u8?(\?|$)/i.test(target);
  if (isList) {
    const body = await up.text();
    if (body.trim().startsWith("#EXTM3U")) {
      return new Response(rewrite(body, up.url || target, referer), {
        headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "public, max-age=0, s-maxage=2, stale-while-revalidate=2", "access-control-allow-origin": "*" },
      });
    }
    return new Response(body, { status: 200, headers: { "content-type": ct || "text/plain", "cache-control": "no-store" } });
  }
  const h = new Headers({ "content-type": ct || "video/mp2t", "cache-control": "public, max-age=30, s-maxage=30", "access-control-allow-origin": "*" });
  const cl = up.headers.get("content-length"); if (cl) h.set("content-length", cl);
  const cr = up.headers.get("content-range"); if (cr) h.set("content-range", cr);
  return new Response(up.body, { status: up.status, headers: h });
}
