#!/usr/bin/env node
/* Genera data/channels.json: canales 24/7 de todos los deportes, ya comprobados (hub de los sitios de agenda + listas IPTV públicas).
   La app los muestra al instante al abrir «Canales» y /api/channels los revalida detrás.  node tools/build-channels.mjs   (npm run channels)
   Si no hay red, se conserva el archivo anterior. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { snapshot } from "../lib/channels.js";
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "channels.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
try {
  const t = Date.now(), s = await snapshot();
  const n = Object.values(s.sports).reduce((a, l) => a + l.length, 0);
  if (!s.hub.length && n < 10) throw new Error("muy pocos canales (¿sin red?)");
  // formato compacto: sin puntuación interna
  const slim = (c) => ({ n: c.n, l: c.l || "", kind: c.kind, u: c.u, r: c.r || "", alt: c.alt || [] });
  fs.writeFileSync(out, JSON.stringify({ at: s.at, hub: s.hub.map(slim), sports: Object.fromEntries(Object.entries(s.sports).map(([k, v]) => [k, v.map(slim)])) }));
  console.log(`✓ data/channels.json · ${s.hub.length} del hub + ${n} de listas IPTV · ${((Date.now() - t) / 1000).toFixed(0)} s · ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
} catch (e) { console.warn("! no se actualizó data/channels.json (" + e.message + "); se conserva el anterior"); if (!fs.existsSync(out)) fs.writeFileSync(out, JSON.stringify({ at: "", hub: [], sports: {} })); }
