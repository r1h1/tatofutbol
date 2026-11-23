/* TatoTV · lib/hub.js — señales por transmisora.
   Así funcionan los sitios tipo pirlotv: cada evento lista los CANALES de televisión que lo emiten (ESPN2, FS1, TUDN…) y esos canales viven en un «hub» (tvf90.com/<n>.php?stream=<id>).
   Aquí se hace igual y de forma automática: ESPN dice qué cadenas transmiten cada evento; se traducen a ids del hub que tienen emisión ahora (lib/hubdata.js, generado por tools/build-hub.mjs). */
import { HUB } from "./hubdata.js";

const LIVE = new Set(HUB.ids);
// [nombre que publica ESPN, ids del hub en orden de preferencia]
const MAP = [
  [/^espn\s*(\d)$/i, (m) => ["espn" + m[1]]],
  [/^espn$/i, () => ["espn"]],
  [/^espn\s*(deportes|mx)/i, () => ["espnmx"]],
  [/^fs1$|^fox sports 1$/i, () => ["foxsports1_usa", "foxsports"]],
  [/^fs2$|^fox sports 2$/i, () => ["foxsports2_usa", "foxsports2"]],
  [/^fox deportes/i, () => ["foxdeportes"]],
  [/^tnt$|^tnt sports/i, () => ["tntsports"]],
  [/^tudn/i, () => ["tudn"]],
  [/^telemundo/i, () => ["telemundo"]],
  [/^universo/i, () => ["universo"]],
  [/^univision|^univisión/i, () => ["univision"]],
  [/^unim[aá]s/i, () => ["unimas"]],
  [/^dazn$/i, () => ["dazn1"]],
  [/^dsports|^directv sports/i, () => ["dsports"]],
  [/^win sports/i, () => ["winsports"]],
  [/^sportv/i, () => ["sportv"]],
];
const PRETTY = (id) => id.replace(/_usa$/, "").replace(/(\D+)(\d)$/, "$1 $2").replace(/^./, (c) => c.toUpperCase()).replace(/^Dsports/i, "DSports").replace(/^Espn/i, "ESPN").replace(/^Tudn/i, "TUDN").replace(/^Tntsports/i, "TNT Sports").replace(/^Foxsports/i, "Fox Sports").replace(/^Foxdeportes/i, "Fox Deportes").replace(/^Winsports/i, "Win Sports");

/** Servidores del hub para las transmisoras de un evento: la ruta 1 (principal) y la 2 (alterna). Prioridad 4: tras los enlaces propios de cada agenda. */
export function hubServers(names) {
  const out = [], seen = new Set();
  (names || []).forEach((n) => {
    for (const [re, ids] of MAP) {
      const m = re.exec(String(n).trim());
      if (!m) continue;
      ids(m).filter((id) => LIVE.has(id)).slice(0, 1).forEach((id) => {
        if (seen.has(id)) return; seen.add(id);
        const label = PRETTY(id) + " (TV)";
        out.push({ name: label, url: "https://tvf90.com/1.php?stream=" + id, kind: "embed", pri: 4 });
        out.push({ name: label + " · OP2", url: "https://tvf90.com/2.php?stream=" + id, kind: "embed", pri: 4 });
      });
      break;
    }
  });
  return out;
}
