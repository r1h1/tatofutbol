#!/usr/bin/env node
/* Construye lib/hubdata.js: catálogo de canales del hub tvf90.com con emisión AHORA (sirve para asignar señales a eventos por su transmisora).
   Fuentes de ids: todo lo que publican las agendas hoy + una lista de candidatos habituales.  node tools/build-hub.mjs */
import { writeFileSync } from "node:fs";
import { scrapeAgenda } from "../lib/sources.js";
import { SPORTS } from "../lib/sports.js";
import { resolveEmbed } from "../lib/resolver.js";

const ids = new Set(("espn espn2 espn3 espn4 espn5 espn6 espn7 espn8 espnnews espndeportes espnu espnpremium espnmx fox foxsports fox1 fox2 fox3 foxdeportes fs1 fs2 foxsportsmx foxsports2 foxsports3 " +
  "tudn tudn_mx tudnusa tnt tntsports tbs truTV nbc nbcsn nbcsports cbs cbssports abc usa peacock universo telemundo telemundousa unimas univision galavision " +
  "dsports dsports2 dsportsplus dsports_plus win winplus winsports winsports_plus vix vix1 vix2 liga1max liga1 gol golperu golden movistar movistarplus tyc tycsports tycsportsplay tnt_sports tntsports_ar " +
  "directv directvsports dazn dazn1 dazn2 dazn3 skysports skysports1 skysports2 bein beinsports beinsports1 beinsports2 sportv sportv2 sportv3 premiere globo " +
  "nbatv nflnetwork nflredzone mlbnetwork nhlnetwork golf golfchannel tennischannel tennis f1tv espn_plus paramount paramountplus cbssportsnetwork bally ballysports mntv marquee yes").split(/\s+/));
for (const sp of Object.keys(SPORTS)) { try { (await scrapeAgenda(sp)).forEach((e) => e.servers.forEach((s) => { const m = /tvf90\.com\/\w+\.php\?stream=([\w-]+)/.exec(s.url); if (m) ids.add(m[1]); })); } catch (e) { /* sigue */ } }
const list = [...ids].filter(Boolean), out = {}; let i = 0;
await Promise.all(Array.from({ length: 10 }, async () => { for (;;) { const id = list[i++]; if (!id) return; const r = await resolveEmbed("https://tvf90.com/1.php?stream=" + id); if (r.stream) out[id] = 1; } }));
const alive = Object.keys(out).sort();
console.log(list.length + " ids probados · " + alive.length + " con emisión:", alive.join(" "));
writeFileSync(new URL("../lib/hubdata.js", import.meta.url), "/* Generado por tools/build-hub.mjs: canales de tvf90.com con emisión en la última comprobación. */\nexport const HUB = " + JSON.stringify({ at: new Date().toISOString(), ids: alive }) + ";\n");
