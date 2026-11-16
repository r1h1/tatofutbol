// Compatibilidad: suelo Chromium 53 (LG webOS 4 de 2019); al empaquetar, esbuild baja la sintaxis (async/await, spread, ?.) a ese nivel. Aquí se vetan las APIs que NO se pueden bajar. Antes: suelo Chromium 68 (LG webOS 5 / Tizen 5.5 / Fire TV 2020). Sin transpilar, el JS y el CSS no deben usar nada posterior sin detección,
// y el proyecto no usa emojis.  node tools/compat.test.mjs
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const walk = (d, ext, out = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (["node_modules", ".git", "tools", "dist", "venv", "api", "lib"].includes(f.name)) continue; const p = path.join(d, f.name); if (f.isDirectory()) walk(p, ext, out); else if (p.endsWith(ext)) out.push(p); } return out; };
const bad = [];
const JS = [[/\basync\s+(function|\(|\w+\s*=>)|\bawait\s/, "async/await (Chromium 55; esbuild no lo baja: se usan Promesas)"], [/[A-Za-z_\])]\?\.[A-Za-z_\[(]/, "optional chaining (Chromium 80)"], [/\?\?(?!=)/, "nullish coalescing (80)"], [/\?\?=|\|\|=|&&=/, "asignación lógica (85)"], [/\.replaceAll\(/, "replaceAll (85)"], [/\.at\(-?\d/, "Array.at (92)"], [/\.padStart\(|\.padEnd\(/, "padStart/padEnd (57)"], [/Object\.(entries|values)\(/, "Object.entries/values (54)"], [/\.finally\(/, "Promise.finally (63)"], [/\.flatMap\(/, "flatMap (69)"], [/new Intl\.(RelativeTimeFormat|ListFormat)/, "Intl moderno"],
  [/Object\.fromEntries/, "fromEntries (73)"], [/\.flatMap\(|\.flat\(/, "flat/flatMap (69)"], [/Promise\.allSettled/, "allSettled (76)"], [/\.matchAll\(/, "matchAll (73)"], [/structuredClone|\.replaceChildren\(|\.hasOwn\(|findLast\(|AbortSignal\.timeout/, "API de Chromium 90+"], [/\bclass\s+\w+\s*\{[^}]*#\w/, "campos privados (74)"], [/\bimport\(|\bexport\s/, "módulos ES (los scripts son clásicos)"]];
for (const f of [...walk(ROOT, ".js"), path.join(ROOT, "sw.js")]) {
  if (f.includes(path.join("js", "vendor"))) continue;
  const src = fs.readFileSync(f, "utf8"), rel = path.relative(ROOT, f);
  try { new vm.Script(src, { filename: rel }); } catch (e) { bad.push(rel + ": no se analiza (" + e.message + ")"); }
  src.split("\n").forEach((line, n) => { const code = line.replace(/\/\/.*$/, "").replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""'); for (const [re, why] of JS) if (re.test(code)) bad.push(rel + ":" + (n + 1) + " usa " + why); });
}
const CSS = [[/:has\(/, ":has()"], [/@container\b/, "container queries"], [/text-wrap\s*:/, "text-wrap"], [/color-mix\(/, "color-mix"], [/@layer\b/, "@layer"], [/:where\(|:is\(/, ":is()/:where() (88)"], [/\binset\s*:/, "inset (87; se usa top/right/bottom/left)"], [/\bsubgrid\b/, "subgrid"], [/\bdvh\b|\bsvh\b|\blvh\b/, "unidades dvh/svh"], [/&\s*\{/, "CSS anidado"]];
for (const f of walk(path.join(ROOT, "css"), ".css")) { const src = fs.readFileSync(f, "utf8"), rel = path.relative(ROOT, f); for (const [re, why] of CSS) if (re.test(src)) bad.push(rel + ": usa " + why); }
// sin emojis en el código fuente de la interfaz
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{FE0F}]/u;
for (const f of [...walk(ROOT, ".js"), ...walk(ROOT, ".css"), path.join(ROOT, "index.html"), path.join(ROOT, "legal.html")]) { if (f.includes(path.join("js", "vendor"))) continue; fs.readFileSync(f, "utf8").split("\n").forEach((l, n) => { if (EMOJI.test(l)) bad.push(path.relative(ROOT, f) + ":" + (n + 1) + " contiene un emoji"); }); }
if (bad.length) { console.error("✗ compatibilidad:\n  " + bad.join("\n  ")); process.exit(1); }
console.log("✓ compatibilidad Chromium 53+ (webOS 2019/2020, Tizen 2019/2020, Fire TV, Safari 11+, Firefox 52+): scripts clásicos, sin APIs ni CSS posteriores, sin emojis");
