#!/usr/bin/env node
/* Empaqueta lo que se publica en Vercel: carpeta dist/site y dist/tatotv-<hash>.zip
   - copia solo lo necesario (sin tools, README, .git, node_modules…)
   - recalcula ?v=<hash> de los CSS/JS en index.html con su contenido real
   - sella la versión del Service Worker (así los usuarios reciben la actualización)
   Uso: node tools/package.mjs   (minifica con esbuild si está instalado: npm i -D esbuild; si no, empaqueta tal cual) */
import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), DIST = path.join(ROOT, "dist"), SITE = path.join(DIST, "site");
const require = createRequire(import.meta.url); const { legacyCss } = require("./css-legacy.cjs");
const sha = (b, n = 8) => crypto.createHash("sha1").update(b).digest("hex").slice(0, n);
const INCLUDE = ["index.html", "offline.html", "legal.html", "404.html", "500.html", "favicon.ico", "sw.js", "manifest.webmanifest", "robots.txt", "sitemap.xml", "llms.txt", "llm.txt", "LICENSE", "vercel.json", "package.json", "css", "js", "img", "icons", "screenshots", "data", "api", "lib"];
const DEFAULT_SITE = "https://tatotv.vercel.app", ORIGIN = (process.env.SITE_URL || DEFAULT_SITE).replace(/\/+$/, "");

let esbuild = null; try { esbuild = (await import("esbuild")).default || (await import("esbuild")); } catch (e) { console.warn("! esbuild no instalado: se empaqueta sin minificar"); }

// canales 24/7 comprobados → data/channels.json (si no hay red se conserva el anterior; SKIP_CHANNELS=1 lo omite)
if (!process.env.SKIP_CHANNELS) spawnSync(process.execPath, [path.join(ROOT, "tools", "build-channels.mjs")], { stdio: "inherit", timeout: 240000 });
fs.rmSync(DIST, { recursive: true, force: true }); fs.mkdirSync(SITE, { recursive: true });
for (const f of INCLUDE) { const s = path.join(ROOT, f); if (fs.existsSync(s)) fs.cpSync(s, path.join(SITE, f), { recursive: true }); }

function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])); }
// respaldos para Chromium viejo (TV 2020, Fire TV): min()/max()/clamp(), env(), inset, :is(), :focus-visible, gap en flex
for (const f of walk(path.join(SITE, "css")).filter((x) => x.endsWith(".css"))) fs.writeFileSync(f, legacyCss(fs.readFileSync(f, "utf8")));
if (esbuild) {
  for (const f of walk(path.join(SITE, "css")).filter((x) => x.endsWith(".css"))) fs.writeFileSync(f, esbuild.transformSync(fs.readFileSync(f, "utf8"), { loader: "css", minify: true, target: ["chrome53", "firefox52", "safari11"] }).code);
  for (const f of [...walk(path.join(SITE, "js")).filter((x) => x.endsWith(".js") && !x.includes("vendor")), path.join(SITE, "sw.js")]) fs.writeFileSync(f, esbuild.transformSync(fs.readFileSync(f, "utf8"), { loader: "js", minify: true, target: ["chrome53", "firefox52", "safari11"] }).code);
}

// Las funciones de api/ y lib/ NO se minifican: Vercel decide «Edge» o «Node» leyendo literalmente `export const config = { runtime: "edge" }`; un minificador lo reescribe
// (`export{x as config}`), Vercel no lo reconoce, ejecuta la función como Node y devuelve 500 (le pasó a la versión del 14-nov). Aquí se comprueba que siga literal.
for (const f of walk(path.join(SITE, "api")).filter((x) => x.endsWith(".js"))) {
  if (!/export\s+const\s+config\s*=\s*\{\s*runtime:\s*["']edge["']\s*\}/.test(fs.readFileSync(f, "utf8"))) { console.error("✗ " + path.relative(SITE, f) + ": falta `export const config = { runtime: \"edge\" }` literal; no se empaqueta."); process.exit(1); }
}
// HTML: sin sangrías ni líneas en blanco ni comentarios (los scripts JSON-LD se conservan tal cual); JSON compacto; sin arte que la app ya no usa
for (const f of ["index.html", "legal.html", "offline.html", "404.html", "500.html"]) {
  const fp = path.join(SITE, f); if (!fs.existsSync(fp)) continue;
  fs.writeFileSync(fp, fs.readFileSync(fp, "utf8").replace(/<!--[\s\S]*?-->/g, "").split("\n").map((l) => l.replace(/^\s+/, "").replace(/\s+$/, "")).filter(Boolean).join("\n"));
}
for (const f of ["manifest.webmanifest", "vercel.json"]) { const fp = path.join(SITE, f); fs.writeFileSync(fp, JSON.stringify(JSON.parse(fs.readFileSync(fp, "utf8")))); }
for (const f of fs.readdirSync(path.join(SITE, "img")).filter((x) => /^bg-.*\.svg$/.test(x))) fs.rmSync(path.join(SITE, "img", f));
fs.writeFileSync(path.join(SITE, "package.json"), JSON.stringify({ name: "tatotv", version: "3.0.0", private: true, type: "module" }, null, 2));

// dominio canónico (SITE_URL=https://tu-dominio.com node tools/package.mjs) y fecha de modificación en SEO
const today = new Date().toISOString().slice(0, 10);
for (const f of ["index.html", "legal.html", "robots.txt", "sitemap.xml", "llms.txt", "llm.txt", "manifest.webmanifest"]) {
  const fp = path.join(SITE, f); if (!fs.existsSync(fp)) continue;
  let t = fs.readFileSync(fp, "utf8").split(DEFAULT_SITE).join(ORIGIN).replace(/<lastmod>[^<]*<\/lastmod>/g, "<lastmod>" + today + "</lastmod>").replace(/"dateModified": "[^"]*"/, '"dateModified": "' + today + '"');
  fs.writeFileSync(fp, t);
}

// ?v=<hash> de cada css/js enlazado desde index.html
let html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
html = html.replace(/(href|src)="((?:css|js)\/[^"?]+)(?:\?v=[^"]*)?"/g, (m, a, p) => `${a}="${p}?v=${sha(fs.readFileSync(path.join(SITE, p)))}"`);
fs.writeFileSync(path.join(SITE, "index.html"), html);

// versión del Service Worker = hash de todo lo que cambia
const build = sha(Buffer.concat(["index.html", "sw.js", ...walk(path.join(SITE, "css")), ...walk(path.join(SITE, "js")), ...walk(path.join(SITE, "img")), ...walk(path.join(SITE, "data"))].map((f) => fs.readFileSync(path.isAbsolute(f) ? f : path.join(SITE, f)))));
// la página conoce su versión (meta ttv-build) y /build.json (siempre de la red) dice cuál es la última: si difieren, aparece «Actualizar»
const ixp = path.join(SITE, "index.html"); fs.writeFileSync(ixp, fs.readFileSync(ixp, "utf8").replace("__BUILD__", build));
fs.writeFileSync(path.join(SITE, "build.json"), JSON.stringify({ v: build }));
const swp = path.join(SITE, "sw.js"); fs.writeFileSync(swp, fs.readFileSync(swp, "utf8").replace("__BUILD__", build));

const zip = path.join(DIST, `tatotv-${build}.zip`);
let r = spawnSync("zip", ["-r", "-9", "-q", zip, "."], { cwd: SITE });
if (r.status !== 0) r = spawnSync("python3", ["-m", "zipfile", "-c", zip, "."], { cwd: SITE });
if (process.argv.includes("--desktop")) { const out = path.join(process.env.HOME || ".", "Desktop", "tatotv-vercel.zip"); fs.copyFileSync(zip, out); console.log("✓ copia en", out); }
console.log("✓ dist/site listo · versión", build, "\n✓ ZIP:", zip, (fs.statSync(zip).size / 1024).toFixed(0) + " KB");
