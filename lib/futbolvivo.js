/* TatoTV · lib/futbolvivo.js — catálogo de golygoals.com / futbolvivo.tv (ingeniería inversa).
   Su página pide https://cdn.strm-api.org/api/v1/gsc/matches, que responde CIFRADO («k1…»): AES-GCM (clave de 256 bits incrustada en su propia página) sobre un texto
   en base64url con el alfabeto sustituido (MIXED→PLAIN) y la cadena invertida; los primeros 12 bytes son el IV. Aquí se descifra con WebCrypto (Edge/Node) sin ejecutar su código.
   Cada partido trae streams[]: { embed_url, real_url, provider: "se" (StreamEast: real_url = gooz.aapmains.net → se reproduce con nuestro propio vídeo) | "sc" (StreamCenter: streamec.st; se muestra en su marco) }.
   Si la clave cambiara, el descifrado falla y la fuente devuelve [] (las demás siguen funcionando). */
import { fetchText } from "./core.js";
import { classify } from "./sports.js";

const API = "https://cdn.strm-api.org/api/v1/gsc/matches";
const KEY = "vqW3n/yB1R+GwSPc4kJs2dCkV7kRmXaNy3lQ/3XkHJI=";
const PLAIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const MIXED = "MiljRIn9PX1o63wGBYTtFsKmEkSur-pC_U02cvzAdy5e8ZqLDgJ4OhVN7QbHxfWa";
const MAP = {}; for (let i = 0; i < MIXED.length; i++) MAP[MIXED[i]] = PLAIN[i];

const b64bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let keyP = null;

export async function decodePayload(text) {
  text = String(text || "").trim();
  if (!text.startsWith("k1")) return JSON.parse(text);
  let b = Array.from(text.slice(2)).reverse().map((c) => { const p = MAP[c]; if (!p) throw new Error("alfabeto"); return p; }).join("").replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  const bytes = b64bytes(b);
  keyP = keyP || crypto.subtle.importKey("raw", b64bytes(KEY), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await keyP, bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}

const SPORT = { soccer: "football", football: "nfl", hockey: "nhl", basketball: "basketball", baseball: "mlb", tennis: "tennis", mma: "mma", boxing: "mma", fight: "mma", golf: "golf", rugby: "rugby" };

export async function futbolvivo() {
  const r = await fetchText(API, { timeout: 6000, referer: "https://golygoals.com/", headers: { accept: "*/*" } });
  if (!r.ok) return [];
  let d;
  try { d = await decodePayload(r.text); } catch (e) { return []; }
  const out = [];
  for (const m of d.matches || []) {
    const home = (m.home && m.home.name) || "", away = (m.away && m.away.name) || "";
    if (!home && !away) continue;
    const sport = SPORT[m.sport] || classify("", m.title || "");
    const servers = [], seen = {}, n = (m.streams || []).length;
    // Prioridad por «peso» (menor = antes): los enlaces que van directos al navegador no cuestan nada; los de «gooz» (StreamEast) pasan por el proxy de Vercel (≈ 4 Mbps → pri 7);
    // los de StreamCenter («sc») se muestran en SU reproductor (marco) porque su lista exige una concesión firmada propia: no gastan ancho de banda nuestro, pero van al final (pri 9) por ser el menos fiable.
    (m.streams || []).forEach((s) => {
      const url = s.real_url || s.embed_url; if (!url || seen[url]) return; seen[url] = 1;
      const sc = /(^|\.)(streamec|embedcenter|streamcenter)\.st\b/i.test(url.replace(/^https?:\/\//, ""));
      servers.push({ name: "Futbolvivo · " + (s.language || "Señal") + (n > 1 ? " #" + (s.no || servers.length + 1) : "") + (sc ? " (marco)" : ""), url, kind: sc ? "page" : "embed", pri: sc ? 9 : 7, ...(sc ? { open: true } : {}) });
    });
    if (!servers.length) continue;
    const id = /^event-espn-.*?-(\d{6,})$/.exec(m.api_id || "");
    const lg = /^event-espn-league-[a-z]+-([a-z0-9]+)-\d+$/.exec(m.api_id || "");
    out.push({ title: (lg ? lg[1].toUpperCase() : m.sport_name || "") + ": " + home + " vs " + away, league: lg ? lg[1].toUpperCase() : m.sport_name || "", home, away, start: m.starts_at || null, sport, servers,
      source: "futbolvivo", pri: 3, espnId: id ? "e" + id[1] : "", logos: [(m.home && m.home.badge) || "", (m.away && m.away.badge) || ""] });
  }
  return out;
}
