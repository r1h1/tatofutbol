#!/usr/bin/env node
/* Servidor local: sirve los estáticos y ejecuta las funciones de /api con el mismo código que Vercel (Node ≥ 18).  node tools/dev.mjs [puerto] */
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), PORT = +process.argv[2] || 3000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".ico": "image/x-icon" };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost:" + PORT);
  try {
    if (u.pathname.startsWith("/api/")) {
      const file = path.join(ROOT, u.pathname.replace(/\/$/, "") + ".js");
      if (!file.startsWith(path.join(ROOT, "api")) || !fs.existsSync(file)) { res.writeHead(404); return res.end("no api"); }
      const mod = await import(pathToFileURL(file).href + "?t=" + fs.statSync(file).mtimeMs);
      const headers = {}; for (const [k, v] of Object.entries(req.headers)) headers[k] = v;
      headers["sec-fetch-site"] = headers["sec-fetch-site"] || "same-origin";
      const r = await mod.default(new Request(u.href, { headers }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      if (r.body) { const reader = r.body.getReader(); for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); } }
      return res.end();
    }
    let p = path.join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream", "cache-control": "no-cache" });
    fs.createReadStream(p).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e && e.stack || e)); }
}).listen(PORT, () => console.log("TatoTV en http://localhost:" + PORT));
