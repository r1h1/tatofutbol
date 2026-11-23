/* TatoTV · lib/core.js
   Utilidades compartidas por las funciones Edge (sin dependencias, sin Node APIs: solo fetch/Response). */

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Respuesta JSON con caché de CDN: `s-maxage` = cuánto la sirve el CDN sin ejecutar la función; `swr` = cuánto puede servir una copia vieja mientras revalida. */
export function json(data, { sMaxAge = 60, swr = 600, status = 200 } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
      "access-control-allow-origin": "*",
    },
  });
}

export function fail(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Descarga texto con timeout. Devuelve { ok, status, text, url } y nunca lanza. */
export async function fetchText(url, { referer, timeout = 9000, headers = {} } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const h = { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8", "accept-language": "es-ES,es;q=0.9,en;q=0.8", ...headers };
    if (referer) h.referer = referer;
    const r = await fetch(url, { headers: h, redirect: "follow", signal: ctl.signal });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text, url: r.url || url };
  } catch (e) {
    return { ok: false, status: 0, text: "", url };
  } finally {
    clearTimeout(t);
  }
}

/** Bloquea direcciones internas (anti-SSRF) y protocolos no web.
 *  Solo se tratan como «IP privada» los hosts que SON una IP numérica: «10.ftlly.com» es un dominio válido (nodo de vídeo de tvf90) y empieza por «10.». */
export function isSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.startsWith("[")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return false;
  }
  return true;
}

/** Solo aceptamos llamadas hechas desde la propia página (evita que otros usen tu cuota como proxy abierto). */
export function sameOrigin(request) {
  const host = new URL(request.url).host;
  // El reproductor HLS nativo de iOS (AVFoundation, «AppleCoreMedia») no envía Origin/Referer/Sec-Fetch-*: sin esta excepción Safari recibiría 403 en las listas y segmentos.
  if (!request.headers.get("sec-fetch-site") && !request.headers.get("origin") && !request.headers.get("referer") && /AppleCoreMedia/i.test(request.headers.get("user-agent") || "")) return true;
  const sfs = request.headers.get("sec-fetch-site");
  if (sfs) return sfs === "same-origin";
  for (const k of ["origin", "referer"]) {
    const v = request.headers.get(k);
    if (v) { try { return new URL(v).host === host; } catch (e) { return false; } }
  }
  return false;
}

/** Normaliza un nombre para compararlo: minúsculas, sin acentos, sin sufijos de club ni signos. */
export function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|cd|ud|rc|rcd|sad|sd|ca|afc|bk|club|de|del|la|el|los|las|the|real|st|saint)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nombres de países y apodos frecuentes en español → inglés (ESPN devuelve inglés). */
const ALIAS = {
  alemania: "germany", espana: "spain", francia: "france", italia: "italy", inglaterra: "england", croacia: "croatia",
  letonia: "latvia", bielorrusia: "belarus", finlandia: "finland", chequia: "czechia", "republica checa": "czechia", polonia: "poland",
  holanda: "netherlands", "paises bajos": "netherlands", belgica: "belgium", suiza: "switzerland", suecia: "sweden", noruega: "norway",
  dinamarca: "denmark", escocia: "scotland", gales: "wales", irlanda: "ireland", grecia: "greece", turquia: "turkey", rumania: "romania",
  hungria: "hungary", austria: "austria", serbia: "serbia", eslovaquia: "slovakia", eslovenia: "slovenia", islandia: "iceland",
  ucrania: "ukraine", rusia: "russia", albania: "albania", montenegro: "montenegro", "san marino": "san marino", "irlanda del norte": "northern ireland",
  brasil: "brazil", mexico: "mexico", "estados unidos": "united states", eeuu: "united states", canada: "canada", panama: "panama",
  curazao: "curacao", "antigua y barbuda": "antigua and barbuda", "trinidad y tobago": "trinidad and tobago", japon: "japan",
  "corea del sur": "south korea", "arabia saudita": "saudi arabia", marruecos: "morocco", egipto: "egypt", sudafrica: "south africa",
  "costa de marfil": "ivory coast", camerun: "cameroon", "nueva zelanda": "new zealand", ecuador: "ecuador", paraguay: "paraguay",
  "republica dominicana": "dominican republic", "el salvador": "salvador", granada: "grenada", "san cristobal y nieves": "st kitts and nevis",
  philadelphia: "philadelphia 76ers", "76ers": "philadelphia 76ers", sixers: "philadelphia 76ers",
};
export function canon(s) {
  const n = norm(s);
  return ALIAS[n] || n;
}

/** Puntuación 0..1 de parecido entre dos nombres de equipo ya canonizados. */
export function nameScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const ta = a.split(" ").filter((w) => w.length > 2), tb = b.split(" ").filter((w) => w.length > 2);
  if (!ta.length || !tb.length) return 0;
  let hit = 0, longest = 0;
  for (const w of ta) if (tb.indexOf(w) >= 0) { hit++; if (w.length > longest) longest = w.length; }
  // «Estudiantes LP» ≈ «Estudiantes de La Plata»: el nombre corto está contenido y comparte una palabra larga
  const sub = hit === Math.min(ta.length, tb.length) && longest >= 7 ? 0.75 : 0;
  return Math.max(hit / Math.max(ta.length, tb.length), sub);
}

export function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Fecha YYYYMMDD en una zona horaria con desfase fijo (horas). */
export function ymd(date, offsetH = 0) {
  const d = new Date(date.getTime() + offsetH * 3600000);
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
}

export function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)));
}

export function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
