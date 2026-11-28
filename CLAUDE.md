# TatoTV — memoria completa del proyecto (CLAUDE.md)

Este archivo es la memoria del proyecto para retomarlo en otra máquina (p. ej. un MacBook). Está en español porque el dueño trabaja en español. Léelo completo antes de tocar nada.

## 1. Qué es y qué quiere el dueño

**TatoTV** (https://tatotv.vercel.app) es un agregador de deportes en vivo: agenda de partidos/eventos con marcador, señales (servidores) de transmisión, canales 24/7 y noticias. Antes era Python/FastAPI/Playwright en Render (repo original `r1h1/tatofutbol`); se migró a **100 % JavaScript desplegable en Vercel**: sitio estático + funciones Edge diminutas, sin navegador headless, sin backend que levantar. Referencia de estilo/estrategia: el proyecto hermano **TatoCine** (`~/Desktop/Descargas/tato-cine`) y TatoSound (legal).

Objetivos permanentes del dueño:
- Funciona en vivo de verdad (marcadores, estados, señales); la app «siempre es en vivo»: **no cachear la agenda de hoy**.
- Sin anuncios, sin trackers, sin monetización, sin engaños. El reproductor es NUESTRO (no se incrustan portales con anuncios, salvo último recurso).
- Interfaz simple tipo servicio de streaming, miniaturas estáticas, fondo del deporte estático y cacheado, **sin emojis, sin animaciones**, textos cortos.
- Retrocompatible (Chromium 53+: LG webOS 2019/2020, Tizen, Fire TV, Safari 11+, Firefox 52+) y fluido de 30 a 165 Hz. PWA completa. Responsive (iPhone 15 Pro/Isla Dinámica, tablet, escritorio, TV).
- Legal/descargo de responsabilidad estilo TatoCine/TatoSound (modal obligatorio, textos en `js/legal.js`).
- **Cada entrega termina con un ZIP productivo limpio en `~/Desktop/tatotv-vercel.zip`** (sin tests/tools/README), borrando el anterior. Se sube a Vercel con Vercel Drop/CLI.
- El dueño es de Guatemala; hora local UTC-6. Hablarle en español, directo y breve. Usa pronombres neutros si no se sabe.

## 2. Comandos

```bash
npm install                      # solo esbuild (devDependency)
node tools/dev.mjs 3300          # servidor local (3000 suele estar ocupado por otra app); sirve estáticos + api/* como Edge
node tools/test.mjs              # 11 pruebas de lógica pura (sin red)
node tools/compat.test.mjs       # compatibilidad Chromium 53+: sin async/await, sin APIs/CSS modernos, sin emojis
node tools/validate.mjs football # prueba de punta a punta con red real (agenda → servidores → resolve → .m3u8 vivo)
node tools/package.mjs --desktop # genera dist/ y copia el ZIP a ~/Desktop/tatotv-vercel.zip
SKIP_CHANNELS=1 node tools/package.mjs --desktop   # igual, sin regenerar canales/hub (rápido, sin red)
node tools/build-channels.mjs    # regenera data/channels.json (hub + IPTV comprobados)
node tools/build-hub.mjs         # regenera lib/hubdata.js (canales del hub tvf90 con emisión ahora)
```

Antes de entregar: `test` + `compat.test` + `package --desktop`, y comprobar que el ZIP: (a) cada `api/*.js` contiene literal `export const config = { runtime: "edge" }`, (b) no contiene `tools/`, tests, `node_modules` ni `.md`, (c) `build.json` trae la versión nueva. Para pruebas en navegador se usó Playwright de Python en `venv/` (no versionado) con capturas en el scratchpad.

Dev server: si ves comportamiento viejo tras editar `lib/` o `api/`, reinícialo (`kill $(pgrep -f '^node tools/dev.mjs')`; NO usar `pkill -f` porque se mata a sí mismo, exit 144). En localhost el Service Worker está desactivado (usar `?sw=1` para probarlo, `?sw=0` para quitarlo).

## 3. Arquitectura

```
index.html, legal.html, offline.html, 404/500.html, manifest.webmanifest, sw.js, vercel.json
css/app.css            estilos (rem, sin animaciones); css-legacy.cjs los endurece al empaquetar
js/                    boot, util, data, app, player, legal, perf, tv (scripts CLÁSICOS, sin módulos, sin async/await)
api/                   funciones Edge: schedule, resolve, servers, hls, news, channels
lib/                   lógica compartida de servidor: core, espn, sports, sources, resolver, streameast, futbolvivo, channels, hub, hubdata
data/channels.json     instantánea de canales 24/7 (generada)
tools/                 dev, test, compat.test, validate, package, build-channels, build-hub, css-legacy, gen-art
img/, icons/           fondos por deporte (jpg+svg), miniaturas t-<deporte>-N.svg, logos, iconos PWA
```

Reglas duras del código de servidor (`api/` y `lib/`):
- **NO minificar** `api/` ni `lib/`: Vercel decide Edge o Node leyendo el literal `export const config = { runtime: "edge" }`. Minificado → 500 en producción (ya pasó). `package.mjs` aborta si falta el literal. Solo se minifica css/js/sw (esbuild, target `["chrome53","firefox52","safari11"]`).
- Solo `fetch`/`Response`/Web Crypto (Edge). Sin Node APIs ni dependencias.
- `lib/core.js`: `json()` (cache-control con `s-maxage` y `stale-while-revalidate`), `fetchText`, `isSafeUrl` (anti-SSRF: bloquea localhost/IPs privadas **numéricas**; `10.ftlly.com` es un dominio válido y debe pasar), `sameOrigin` (las rutas de proxy/resolve solo aceptan llamadas de la propia página; excepción: UA `AppleCoreMedia` sin cabeceras), `canon/nameScore/norm` (emparejado de equipos es/en), `ymd`.

Reglas duras del cliente: JS clásico ES5-ish, sin `async/await`, sin emojis, `html.no-grid / no-flex-gap / no-focus-visible` puestos por `js/boot.js` para navegadores viejos; `tools/css-legacy.cjs` agrega respaldos (inset, min/max/clamp, env(), :is, :focus-visible, flex+gap).

## 4. Flujo de datos

**`/api/schedule?sport=<k>&date=YYYYMMDD`** (`api/schedule.js`): ventana D-1..D+1 de ESPN (`lib/espn.js`, scoreboard por deporte; cada evento lleva `bc` = transmisoras) + todas las fuentes de señales (`scrapeAgenda` en `lib/sources.js`) → se agrupan en *clusters* por id de ESPN o por equipos parecidos + hora cercana (≤4 h) → cada evento ESPN toma su cluster; los clusters sin evento ESPN aparecen igual (ligas menores). Fuentes que solo dan HH:MM (pirlotv) se anclan al día con ESPN u otra fuente (`resolveDayless`). Fútbol solo muestra partidos con señal. Hoy: CDN `s-maxage=15, swr=5`; otros días 1800/86400.

Deportes (`lib/sports.js`): football, basketball (NBA/NCAA), nhl, nfl, mlb, f1, tennis, mma, golf, motor, rugby, other. `classify(league,title)` por regex en orden de especificidad (ej. «Basketball» completo: `basket\w*`). Etiquetas de UI: Todos / En vivo / Canales / Noticias; «Americano», «UFC Boxeo», «F1».

**Fuentes de agenda/señales** (cada una cacheada 25 s en la instancia con `cached()`):
- `pirlotv` (pirlotv.la, HTML; hora Lima UTC-5; `dayless`).
- `futbollibre` = futbollibretvplay.org → API Strapi `api.wqxag.com/diaries.json`; `pelotalibre` → `agenda18.com/agenda.json` (mismo formato, parser `strapi()`); `pirllotv` (pirllotv.hair = pirlo.rest, WordPress `/wp-content/uploads/futbol-agenda/agenda.json`); `pirlotvonoine` (`/api/agenda`, también pelotalibrehd.me); `adstrim` (rojadirectatvlive, `adstrim.quest/api/matches`, `id` = id ESPN); `futbolvivo` (golygoals/futbolvivo.tv, API cifrada); StreamEast (páginas de partido, kind `se`).
- Las URLs decodificadas de base64 (`?r=`) vienen con `\n`: siempre `.trim()`.
- Hubs de reproductor: **`tvf90.com`** (`/1.php|2|3|hd|canal.php?stream=<id>` → `5.php?stream=<id>` trae la lista HLS con token; es el hub principal, ~95 % resoluble). Inutilizables: `la18hd.su` (403), `golperutv.xyz`→`quotarevival.net` (protegido por dominio), `streamx99.com` (URL escondida en JS ofuscado), `sportsonline.click`→`waterera.net` (protegido), `flyembed.cfd` (sin DNS). Están en `BLOCKED_HOST` y se descartan.
- Se eliminaron por pedido del dueño: servidores «Capo Deportes» (`BAD_NAME`) y «Canal 10» («Not allowed / domain protected»).
- `pruneBlocked` (hosts protegidos, 3 s) y `pruneDeadTvf` (canales tvf90 cuya lista responde «not found»/500; memo 3 min) limpian servidores muertos antes de entregar la agenda.

**Señales por transmisora** (`lib/hub.js` + `lib/hubdata.js`): ESPN dice qué cadenas emiten (ESPN2, FS1, TUDN…); `MAP` las traduce a ids del hub y se ofrecen solo las que están en `HUB.ids` (generado por `tools/build-hub.mjs`, ~42 de 115 candidatos con emisión). `pri: 4`. «Fox» a secas NO es Fox Sports.

**Prioridad de servidores (`pri`, menor primero)**: 1–3 enlaces directos de agendas → 4 hub por transmisora → 7 futbolvivo «gooz» (por proxy) → 8 grupo StreamEast (`kind:"se"`, se expande con `/api/servers`) → 9 StreamCenter «marco» (`kind:"page"`, `open:true` = iframe sin sandbox, último recurso). Principio del dueño: preferir enlaces ligeros; los pesados solo si no hay otros («lo importante es ver»).

**`/api/resolve?url=`** (`lib/resolver.js`, sin navegador): sigue la cadena de iframes saltando anuncios y extrae el `.m3u8` por: URL directa en HTML/JS, `atob` base64, array barajado (streamxhd: `iL=[[orden,"b64"],…]` menos `k=f1()+f2()`), packer `p,a,c,k,e,d`, `SOURCE="…"` y Clappr `source: atob(...)` (gooz/StreamEast). Verifica la lista con `probe()`; dos intentos EN PARALELO. Respuesta: `{stream, referer, needRef, direct}` o `{stream:null, frame, blocked, dead}`. `dead` = hay lista pero no responde → servidor muerto (no mostrar el reproductor del hub: enseñaría su aviso «ingresa a pelotalibre.uno…», sitio que no existe). `blocked` = Turnstile/«domain protected». `direct` = el navegador puede pedirla él mismo (CORS `*`, responde sin Referer y SIN `?token=`).

**Hallazgo clave (token atado a IP)**: `tvf90/ftlly` emiten `?token=…` válido solo para la IP que lo pidió. En local todo funciona (misma IP); en producción el navegador recibe 403 si va directo, así que esas listas van SIEMPRE por `/api/hls`. Por eso `direct` exige no tener token.

**`/api/hls?u=&r=`**: proxy HLS (reescribe listas, reenvía segmentos con Referer/Origin; lista cache 2 s, segmento 30 s en CDN). Solo `sameOrigin`. Cuesta ~1,8 GB/h por espectador en Vercel (plan gratis 100 GB; el dueño tiene ~10 usuarios).

**`/api/servers?url=`**: expande una página de partido de StreamEast en servidores reales (botones `stream-btn-<id>` + iframe `wp_player`/`new-stream-embed`; memo 45 s; `isStreamEastPage` restringe a hosts https de streameast).

**futbolvivo** (`lib/futbolvivo.js`): `https://cdn.strm-api.org/api/v1/gsc/matches` viene cifrado: prefijo `k1`, cadena invertida, alfabeto MIXED→PLAIN, base64url, IV = 12 primeros bytes, AES-GCM, clave `vqW3n/yB1R+GwSPc4kJs2dCkV7kRmXaNy3lQ/3XkHJI=`. Servidores `sc` (streamec/embedcenter/streamcenter) → kind `page` pri 9 open; el resto `embed` pri 7. Verificado: gooz «English #2/#3» (StreamEast/futbolvivo) reproducen dentro de TatoTV en HD. **Pendiente (no hecho)**: el catálogo en español de futbolvivo.tv (`__lx(3)`) requeriría ejecutar su script ofuscado; el dueño no lo autorizó. No ejecutar sin permiso explícito.

**Canales 24/7** (`lib/channels.js`, `/api/channels?sport=&src=hub|m3u`, `data/channels.json`): canales del hub (de las páginas `/en-vivo/<slug>` → `tvf90.com/canal.php?stream=<id>`) + listas IPTV (iptv-org, Free-TV) con comprobación de salud. El cliente pinta la instantánea de `data/channels.json` y revalida contra el servidor; respaldo: M3U de iptv-org descargada directo.

**Noticias** (`/api/news`): solo del día/semana, año actual, se renuevan (maxAge 6 h en cliente).

## 5. Cliente

- `js/data.js`: `D.getJSON` con 3 capas (memoria, sessionStorage, localStorage; stale-while-revalidate), `force` (salta todas las cachés), **`wait`** (no mostrar copia vencida: espera red máx. 4 s) y **`live`** (`cache:"no-store"`). `D.schedule`: hoy ttl 15 s y copia >3 min no se muestra; otros días 30 min.
- `js/app.js`: estado `S`, `load(force, wait)` con **3 reintentos automáticos** (1,2/2,4/3,6 s) y reintento a los 4 s si sigue vacío; `setSport` pone `S.day` = hoy (bug antiguo: arrastraba el día); al entrar y al cambiar de deporte/día/modo se usa `wait`; sondeo adaptativo (20 s si hay algo en vivo o reproductor abierto, 60 s si no) + al volver a la app, `online`, `pageshow`, `focus`; botón «Actualizar en vivo» (fuerza); `signature()` evita repintar sin cambios; imágenes lazy con IntersectionObserver; splash estático sin barra (espera el fondo para no «flashear»); selección de deporte en localStorage; aviso «Actualizar» (comparar `build.json` con `<meta name="ttv-build">` + `controllerchange`), `refreshApp` (desregistra SW, borra caches `ttv-shell-*`, recarga).
- `js/player.js`: modal con video grande y panel «Señales» (punto de color + etiqueta: Directo / Reproductor / Sin señal / Protegido / 24/7). Al abrir, verifica en paralelo las primeras señales; orden: última señal buena del partido → `pri` → puntaje de dominio (`ttv:hs`) → original; prefiere video directo a iframe en selección automática; reintento con resolución nueva si falló; vigilante de congelamiento cada 4 s (salta de señal); botones Otra señal / Recargar / Ir al directo / Imagen en imagen / Pantalla completa; atajos F, N, P, L; Media Session, Wake Lock; hls.js (`js/vendor/hls.min.js`, carga perezosa, `capLevelToPlayerSize`); `/api/hls` por proxy. El aviso legal del reproductor va al final (`.player-notice` tras `.p-body`).
- `sw.js`: shell versionado (`ttv-shell-<build>`), `clean()` para respuestas redirigidas/comprimidas (Safari fallaba con «response served by service worker has redirections»), skipWaiting+claim. **`/api/schedule`, `/api/hls`, `/api/resolve` y `build.json` NO pasan por el SW** (la agenda es en vivo; antes el SW cortaba a 5 s y en frío la agenda tardaba ~7 s → «No se pudo cargar la agenda»). `news`/`channels`: SWR con frescura por tipo. Imágenes: caché primero.
- CSS: `.modal{padding-top:3px}`, `.splash` y `.shell` con 3 px extra arriba (pedido del dueño por la Isla Dinámica); `--sat` con mínimo 1,75 rem en modo standalone/fullscreen táctil; panel lateral de señales en ≥1000 px de ancho y ≥560 de alto o móvil horizontal.
- `vercel.json`: CSP estricta (`script-src 'self'`; `frame-src https:`), `cleanUrls:false`, `/build.json` no-store, assets inmutables, `/` y `sw.js` no-cache.

## 6. Empaquetado (`tools/package.mjs`)

Copia `INCLUDE` (index, offline, legal, 404, 500, favicon, sw, manifest, robots, sitemap, llms/llm.txt, LICENSE, vercel.json, package.json, css, js, img, icons, screenshots, data, api, lib) a `dist/site`, regenera canales y hub (salvo `SKIP_CHANNELS`), endurece CSS, minifica css/js/sw con esbuild, estampa versión (hash) en `sw.js`, `build.json` y `<meta ttv-build>`, escribe `package.json` mínimo y crea `dist/tatotv-<hash>.zip`; `--desktop` lo copia a `~/Desktop/tatotv-vercel.zip`. `CLAUDE.md`, `README.md`, `tools/` y `PRIVACY.md` NO van en el ZIP.

## 7. Errores pasados (no repetir)

1. Minificar `api/`/`lib/` → Vercel no detecta Edge → 500.
2. Parche mal hecho dejó `js/app.js` en 0 bytes → se reconstruyó; haz copia antes de parches grandes con Python.
3. `pkill -f` se mata a sí mismo; puerto 3000 ocupado por otra app → usar 3300.
4. `load()` incrementaba `reqId` y rompía la lista de canales.
5. Marcadores viejos por capas de caché → red primero para hoy, 15 s en CDN, copia >3 min no se muestra.
6. SW con respuestas redirigidas en Safari → `clean()`, `cleanUrls:false`.
7. PWA vieja atascada en SW en espera → skipWaiting + `build.json` + `refreshApp`.
8. Iframe de StreamCenter con `sandbox` → «Stream blocked»: `open:true` sin sandbox.
9. Filtro anti-SSRF bloqueaba `10.ftlly.com` por empezar con «10.» → solo IPs numéricas.
10. «Basketball» caía en Fútbol (la regex pedía `basket` + `\b`) → `basket\w*`.
11. Señal muerta tardaba 16 s en declararse muerta (3 intentos secuenciales) → 2 en paralelo, ~5 s.
12. Aviso legal del reproductor se superponía a las señales (hijos de flex que se encogían) → `.p-box>*{flex-shrink:0}`.
13. Agenda no cargaba en frío (SW cortaba a 5 s) → ver arriba.

## 8. Estado y pendientes

- **28 nov 2026 (versión `4c57c30e`, `~/Desktop/tatotv-vercel.zip`):** horas «AM/PM» sin espacio (`U.time` quitaba solo los puntos de «a. m.» → «A M»); encabezado de hoy «Hoy · 28 nov» (antes «Hoy · nov», sin el número); `.row{content-visibility:auto}` (los navegadores viejos lo ignoran). Medido antes de cambiar: primeras tarjetas 1,3 s, reposo 0 % de CPU, 532 nodos, 3 MB de heap (ya estaba muy optimizada). **El ZIP se probó TAL CUAL** (descomprimido + `tools/dev.mjs` copiado al lado): agenda real (20 partidos), reproductor con video avanzando por `/api/hls`, cero errores; `validate.mjs football`: 88 partidos con señal, 202 listas vivas.
- Último ZIP entregado: versión `58cfd3b1` (2026-11-23; `~/Desktop/tatotv-vercel.zip`, ya subido o por subir a Vercel por el dueño). Producción: https://tatotv.vercel.app (Vercel plan gratis; uso bajo, ~0,4 %).
- **Git**: rama `master`, remoto `https://github.com/r1h1/tatofutbol`. Todo está commiteado y subido (último commit `351e993`, 2026-11-23). Cuentas de GitHub: `r1h1` es la dueña del repo; si `gh` tiene activa otra cuenta, el push da 403 → `gh auth switch -u r1h1` (o `gh auth login`). No commitear `dist/`, `node_modules/`, `venv/` (en `.gitignore`).
- **Mudanza a macOS** (la carpeta se copia tal cual): (1) borrar `venv/` (es de Linux, no funciona en Mac; pesa 213 MB) y `node_modules/` + `dist/` y volver a `npm install`; (2) Node ≥ 20 (se usó 24); (3) `tools/package.mjs --desktop` usa `$HOME/Desktop/tatotv-vercel.zip` y la orden `zip` del sistema (viene en macOS), así que funciona igual; (4) si quieres repetir las pruebas de navegador: `python3 -m venv venv && venv/bin/pip install playwright && venv/bin/playwright install chromium` (los scripts de prueba eran temporales y no están en el repo: se escriben con `playwright.async_api`, `is_mobile=True`, viewport 393×852 para iPhone, 1366×800 escritorio, 844×390 horizontal; semilla `localStorage.setItem('ttv:legal', JSON.stringify({v:'2026-11',t:1}))` para saltar el aviso legal); (5) la memoria de Claude Code de la otra máquina (`~/.claude/projects/...`) NO viaja: este archivo la reemplaza.
- Pendiente opcional: catálogo español de futbolvivo.tv (requiere autorización explícita del dueño); verificar en vivo el enlace StreamCenter «marco» durante un partido; probar en dispositivos reales (iPhone, TVs LG/Samsung/Fire TV); re-validar fuentes con `node tools/validate.mjs <deporte>` cuando un partido pierda señales (los sitios de terceros cambian seguido); considerar fijar región de Edge solo si el token atado a IP causara fallos entre resolver y proxy (hoy el reintento lo cubre).
- Preferencias de trabajo del dueño: hacer el trabajo completo y probarlo (Playwright) antes de entregar; resumen final corto y honesto sobre lo probado y lo no probado; ZIP en el escritorio al final (borrando el anterior si lo pide); no inventar resultados; no ejecutar scripts ofuscados de terceros ni tocar credenciales sin permiso.
- **28 nov 2026 (versión `c5776465`):** créditos «Ma. Ing. Daniel Rivas, Guatemala» (fila Créditos de `js/legal.js`). ZIP probado tal cual con datos reales.
