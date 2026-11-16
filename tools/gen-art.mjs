#!/usr/bin/env node
/* Genera el arte estático (SVG): fondos por deporte y miniaturas. Se ejecuta una vez (npm run art); los archivos resultantes se versionan y se cachean para siempre. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "img");
fs.mkdirSync(OUT, { recursive: true });

const SPORTS = {
  football: { c1: "#b7f35a", c2: "#1d4d1f", dark: "#0b1a0d" },
  basketball: { c1: "#ff8a3d", c2: "#6b2d0b", dark: "#1a0e07" },
  nhl: { c1: "#6fb7ff", c2: "#12305a", dark: "#08121f" },
  f1: { c1: "#ff3b3b", c2: "#5a0f12", dark: "#150607" },
  tennis: { c1: "#d7f24a", c2: "#2f4a1a", dark: "#0c1409" },
  nfl: { c1: "#7bd88f", c2: "#15402a", dark: "#07140d" },
  mlb: { c1: "#ff9f5a", c2: "#6a3418", dark: "#170d07" },
  mma: { c1: "#ff4d6d", c2: "#4a1020", dark: "#14070b" },
  golf: { c1: "#8ee38a", c2: "#1d5a2a", dark: "#08160c" },
  rugby: { c1: "#9ad1ff", c2: "#1e3a6a", dark: "#080f1d" },
  motor: { c1: "#ffd24a", c2: "#5a4310", dark: "#151006" },
  other: { c1: "#c9a7ff", c2: "#3b2a6a", dark: "#0e0a1a" },
};

/* Líneas de cada campo, dibujadas en un lienzo de 1000 × 560 (se escala/recorta después). */
function field(sport, stroke, w) {
  const s = `fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  if (sport === "football")
    return `<g ${s}><rect x="40" y="40" width="920" height="480" rx="6"/><path d="M500 40V520"/><circle cx="500" cy="280" r="76"/><rect x="40" y="150" width="140" height="260"/><rect x="40" y="215" width="56" height="130"/><rect x="820" y="150" width="140" height="260"/><rect x="904" y="215" width="56" height="130"/><path d="M180 232a76 76 0 0 1 0 96M820 232a76 76 0 0 0 0 96"/></g><circle cx="500" cy="280" r="5" fill="${stroke}"/>`;
  if (sport === "basketball")
    return `<g ${s}><rect x="40" y="40" width="920" height="480" rx="10"/><path d="M500 40V520"/><circle cx="500" cy="280" r="72"/><rect x="40" y="190" width="190" height="180"/><rect x="770" y="190" width="190" height="180"/><path d="M230 220a70 70 0 0 1 0 120M770 220a70 70 0 0 0 0 120M40 90h110a190 190 0 0 1 0 380H40M960 90H850a190 190 0 0 0 0 380h110"/><circle cx="76" cy="280" r="14"/><circle cx="924" cy="280" r="14"/></g>`;
  if (sport === "f1" || sport === "motor")
    return `<g ${s}><path d="M120 400C80 330 120 250 210 240L420 215C500 205 520 140 600 120C700 95 820 130 860 210C900 290 840 340 760 350L560 372C500 380 470 450 380 470C270 492 160 470 120 400Z"/><path d="M150 392C120 335 150 275 220 268L430 243C520 232 545 168 610 150C700 126 800 156 830 218" opacity=".5"/><path d="M215 238V290M205 244h22" /></g>`;
  if (sport === "tennis")
    return `<g ${s}><rect x="90" y="70" width="820" height="420"/><path d="M90 150h820M90 410h820M500 150V410M270 150V410M730 150V410M500 70V490"/><path d="M90 280h180M730 280h180"/></g>`;
  if (sport === "nfl")
    return `<g ${s}><rect x="40" y="60" width="920" height="440" rx="8"/><path d="M130 60V500M220 60V500M310 60V500M400 60V500M500 60V500M600 60V500M690 60V500M780 60V500M870 60V500"/><path d="M130 190h18M130 370h18M870 190h-18M870 370h-18M500 60l0 0"/><path d="M40 280H10M960 280h30M10 250v60M990 250v60"/></g>`;
  if (sport === "mlb")
    return `<g ${s}><path d="M500 470L130 190A520 520 0 0 1 870 190Z"/><path d="M500 440L300 290L500 140L700 290Z"/><circle cx="500" cy="300" r="26"/><path d="M500 470L130 190M500 470L870 190"/><circle cx="500" cy="440" r="10"/><circle cx="300" cy="290" r="10"/><circle cx="700" cy="290" r="10"/><circle cx="500" cy="140" r="10"/></g>`;
  if (sport === "mma")
    return `<g ${s}><path d="M330 60h340l210 210v140L670 520H330L120 410V270Z"/><path d="M360 110h280l170 170v120L640 470H360L190 400V280Z" opacity=".55"/><path d="M330 60L360 110M670 60L640 110M880 270L810 280M880 410L810 400M670 520L640 470M330 520L360 470M120 410L190 400M120 270L190 280"/></g>`;
  if (sport === "golf")
    return `<g ${s}><path d="M110 430C80 330 140 190 300 150C440 118 520 200 640 170C780 134 920 190 900 330C880 460 760 500 600 480C470 465 400 520 280 505C190 495 130 480 110 430Z"/><circle cx="700" cy="300" r="62"/><circle cx="700" cy="300" r="9" fill="${stroke}"/><path d="M700 300V150M700 150l70 26-70 26"/><path d="M280 420c40-40 90-30 120 0" opacity=".6"/></g>`;
  if (sport === "rugby")
    return `<g ${s}><rect x="40" y="70" width="920" height="420" rx="6"/><path d="M500 70V490M200 70V490M800 70V490M110 70V490M890 70V490"/><circle cx="500" cy="280" r="50"/><path d="M40 280H0M960 280h40M0 220v120M1000 220v120"/></g>`;
  if (sport === "other")
    return `<g ${s}><circle cx="500" cy="280" r="190"/><circle cx="500" cy="280" r="120" opacity=".7"/><circle cx="500" cy="280" r="50" opacity=".5"/><path d="M500 50V510M270 280H730" opacity=".6"/></g>`;
  return `<g ${s}><rect x="40" y="40" width="920" height="480" rx="150"/><path d="M500 40V520" /><circle cx="500" cy="280" r="66"/><path d="M280 40V520M720 40V520"/><circle cx="210" cy="160" r="52"/><circle cx="210" cy="400" r="52"/><circle cx="790" cy="160" r="52"/><circle cx="790" cy="400" r="52"/><path d="M40 250h-0M110 250a30 30 0 0 1 0 60h0M890 250a30 30 0 0 0 0 60"/></g><circle cx="500" cy="280" r="5" fill="${stroke}"/>`;
}

/* Fondo de página (16:9): campo girado y ampliado, retícula de puntos como la media tinta de la referencia, brillo del color del deporte. */
function bg(sport, p) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
<defs>
<radialGradient id="g" cx="22%" cy="30%" r="75%"><stop offset="0" stop-color="${p.c1}" stop-opacity=".34"/><stop offset=".45" stop-color="${p.c2}" stop-opacity=".55"/><stop offset="1" stop-color="${p.dark}"/></radialGradient>
<pattern id="d" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#fff" fill-opacity=".10"/></pattern>
<linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient>
</defs>
<rect width="1600" height="900" fill="${p.dark}"/>
<rect width="1600" height="900" fill="url(#g)"/>
<rect width="1600" height="900" fill="url(#d)"/>
<g transform="translate(-60 120) rotate(-9 800 450) scale(1.75)" opacity=".9">${field(sport, p.c1, 2.4).replace(/stroke-opacity="[^"]*"/g, "")}</g>
<g transform="translate(-60 120) rotate(-9 800 450) scale(1.75)" opacity=".16">${field(sport, "#fff", 9)}</g>
<rect width="1600" height="900" fill="url(#f)"/>
</svg>`;
}

/* Miniatura (16:9, 320×180): tres variantes por deporte (ángulo y brillo distintos) elegidas según el partido. */
function thumb(sport, p, v) {
  const rot = [-8, 7, 0][v], sc = [1.05, 1.3, 0.92][v], tx = [-10, -60, 20][v], ty = [20, 0, 22][v];
  const gx = ["20%", "80%", "50%"][v];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
<defs><radialGradient id="g" cx="${gx}" cy="35%" r="85%"><stop offset="0" stop-color="${p.c1}" stop-opacity=".55"/><stop offset=".6" stop-color="${p.c2}"/><stop offset="1" stop-color="${p.dark}"/></radialGradient>
<pattern id="d" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".9" fill="#fff" fill-opacity=".12"/></pattern></defs>
<rect width="320" height="180" fill="url(#g)"/><rect width="320" height="180" fill="url(#d)"/>
<g transform="translate(${tx} ${ty}) rotate(${rot} 160 90) scale(${sc * 0.32})" opacity=".85">${field(sport, p.c1, 4)}</g>
</svg>`;
}

for (const [sport, p] of Object.entries(SPORTS)) {
  fs.writeFileSync(path.join(OUT, `bg-${sport}.svg`), bg(sport, p));
  for (let v = 0; v < 3; v++) fs.writeFileSync(path.join(OUT, `t-${sport}-${v + 1}.svg`), thumb(sport, p, v));
}
console.log("Arte generado en", OUT);
