#!/usr/bin/env node
/* Valida de punta a punta (con red real): agenda → servidores → /api/resolve → lista .m3u8 viva.  node tools/validate.mjs [deporte]
   Muestra, por host, cuántos servidores se resuelven a vídeo directo y cuántos caen al iframe. */
import schedule from "../api/schedule.js"; import resolve from "../api/resolve.js"; import { UA } from "../lib/core.js";
const sport = process.argv[2] || "football";
const req = (u) => new Request(u, { headers: { "sec-fetch-site": "same-origin" } });
const d = await (await schedule(req("http://x/api/schedule?sport=" + sport))).json();
const servers = [], seen = new Set();
d.matches.forEach((m) => m.servers.forEach((s) => { if (!seen.has(s.url)) { seen.add(s.url); servers.push({ ...s, match: m.a.n + " vs " + m.b.n }); } }));
console.log(`${sport}: ${d.matches.length} partidos · ${d.matches.filter((m) => m.servers.length).length} con señal · ${servers.length} servidores únicos`);
const stats = {};
const host = (u) => new URL(u).hostname.replace(/^www\./, "");
async function one(s) {
  const h = host(s.url); stats[h] = stats[h] || { total: 0, hls: 0, live: 0, kind: {} };
  const st = stats[h]; st.total++; st.kind[s.kind] = 1;
  if (s.kind !== "embed") return;
  try {
    const r = await (await resolve(req("http://x/api/resolve?url=" + encodeURIComponent(s.url)))).json();
    if (!r.stream) return;
    st.hls++;
    const p = await fetch(r.stream, { headers: { "user-agent": UA, referer: r.referer || "" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (p && p.ok && (await p.text()).startsWith("#EXTM3U")) st.live++;
  } catch (e) { /* cuenta como no resuelto */ }
}
const q = servers.slice(); await Promise.all(Array.from({ length: 6 }, async () => { for (let s; (s = q.shift()); ) await one(s); }));
console.table(Object.fromEntries(Object.entries(stats).map(([h, v]) => [h, { servidores: v.total, "→ .m3u8": v.hls, "lista viva": v.live, tipo: Object.keys(v.kind).join(",") }])));

// canales 24/7: del servidor (hub de los sitios de agenda + listas IPTV comprobadas)
import channels from "../api/channels.js";
for (const src of ["hub", "m3u"]) {
  const r = await (await channels(new Request("http://x/api/channels?sport=" + sport + "&src=" + src))).json();
  console.log(`canales 24/7 (${src}): ${r.items.length}`, r.items.slice(0, 6).map((c) => c.n).join(" | "));
}
