<div align="center">

# TatoTV

**Agenda deportiva en vivo — 100 % JavaScript, sin Python, sin Playwright, sin servidor propio.**

Fútbol · Basketball · Hockey NHL · Fórmula 1 · Tenis · NFL · MLB · UFC y boxeo · Golf · Rugby · Motor · Otros · marcadores · horarios en tu zona · reproductor HLS integrado · canales M3U

</div>

---

## Qué es

Una web estática (HTML + CSS + JS clásico, sin compilar) más **cuatro funciones Edge de Vercel** de ~100 líneas, sin dependencias ni navegador. Se despliega como TatoCine: subes la carpeta y funciona.

| Pieza | Dónde corre | Qué hace |
|---|---|---|
| Interfaz, caché, reproductor | Navegador | Lista tipo «guía de TV», calendario de 7 días, búsqueda, hls.js (se descarga solo al reproducir) |
| Canales M3U (iptv-org) | **Navegador directo** (CORS abierto) | Descarga, clasifica y guarda 6 h en `localStorage` |
| `api/schedule` | Edge + CDN | Une el calendario de **ESPN** (hora, marcador, escudos) con todas las fuentes de transmisión, agrupa los servidores del mismo partido y empareja equipos (español↔inglés) |
| `api/resolve` | Edge | Sigue los iframes del reproductor y extrae el `.m3u8` con regex (sin Chromium) |
| `api/hls` | Edge + CDN | Proxy HLS con el `Referer` que exige el origen |
| `api/news` | Edge + CDN | Titulares RSS en español |

## 12 deportes bien separados

Cada evento de cualquier fuente se clasifica por su título (`lib/sports.js`; lo que empieza con «F1» o «Gran Premio» es Fórmula 1, «Tenis –» es Tenis, «UFC/Boxeo/PFL» es Combate, etc.) y va solo a su deporte; lo que no encaja cae en «Otros deportes». Calendarios y marcadores de ESPN por tipo: equipos (fútbol, NBA, NHL, NFL, MLB), partidos individuales (tenis ATP/WTA, con banderas), sesiones (F1, IndyCar), carteleras (UFC) y torneos (golf). Eventos sin rival (carreras, torneos) se muestran con su nombre y un icono; si el día elegido está vacío, un botón lleva al próximo día con eventos. Para añadir un deporte: una entrada en `lib/sports.js` (+ `tools/gen-art.mjs`, `js/util.js` y `css`).

## Cómo obtienen sus enlaces los sitios (y cómo lo repetimos)

`/api/resolve` repite lo que hace cada sitio: **HTML/JS directo** (`tvf90.com`, `sofayshop.st`, `streamx…`), **base64** (`atob`), **arreglo barajado** (`streamxhd.sbs`: se ordenan los trozos y se resta una constante; los nombres de variable cambian en cada carga, así que se prueban todas las combinaciones), **JS empaquetado p,a,c,k,e,d** y **cadena de iframes** (portal → reproductor → proveedor) saltándose los frames de publicidad. Si el último eslabón no da vídeo directo (p. ej. Cloudflare Turnstile en `trendplace.top`/`dynbush.net`) se incrusta **ese reproductor** y no el portal con sus anuncios. Los tokens ligados a IP se resuelven y se verifican (`#EXTM3U`) en el servidor, con hasta 3 reintentos por nodo caído.

## Datos en vivo (marcadores y estados al día)

- **Hoy no se sirve nada viejo:** el CDN conserva `/api/schedule` de hoy solo 15 s (todos los visitantes comparten esa respuesta), el Service Worker usa *red primero* y el navegador ya no muestra una copia de más de 3 min. Antes se podían ver marcadores de horas atrás (SWR del CDN, del Service Worker y de `localStorage` apilados).
- **Refresco automático:** cada 20 s si se ve algo en vivo o hay un reproductor abierto (el marcador del reproductor se actualiza solo), cada 60 s si no; también al volver a la app, al recuperar la conexión y al salir de la caché de páginas. Botón **«Actualizar en vivo»** bajo el buscador (se salta todas las cachés) con la hora del dato: «Actualizado 12:04:31».
- **Datos con retraso:** un «en vivo» que empezó hace más de 1,5 veces la duración habitual pasa a *Finalizados*, y un «próximo» cuya hora ya pasó se muestra *EN VIVO*.
- **Rapidez:** cada fuente de agenda tiene un plazo de 4,5 s y una copia de 25 s en el servidor; ESPN, 12 s: una fuente lenta ya no retrasa la lista. Consumo: ≈ 10 KB por consulta; con 10 usuarios, muy por debajo de los 100 GB mensuales.
- **Canales al instante:** `data/channels.json` (≈ 400 canales comprobados, se regenera con `npm run channels` y al empaquetar) se muestra de inmediato y `/api/channels` lo revalida detrás (de ~8 s a < 0,1 s).

## Familia pirlotv / pelotalibre (ingeniería inversa de sus agendas)

Todos son cascarones sobre el mismo backend: `pirlotv.la` (HTML servido, `<li>Liga: A vs B<span class=t>`), **`pirllotv.hair` = `pirlo.rest`** (WordPress, plugin `futbol-agenda`: `/wp-content/uploads/futbol-agenda/agenda.json`, canales ya con su `stream_url` de tvf90), **`pelotalibre.mx`** (lee `agenda18.com/agenda.json`, Strapi, igual que `futbollibretvplay.org` → `api.wqxag.com`), **`pirlotvonoine.site` / `pelotalibrehd.me`** (Astro, `/api/agenda`, mismos ids que agenda18) y `pelotalibres.st` (HTML, hora de España, hub `streamx99.com`). Los reproductores son hubs: **`tvf90.com`** (resoluble, ≈ 95 %), `la18hd.su` (403 a clientes externos), `golperutv.xyz` → `quotarevival.net` (protegido por dominio) y `streamx99.com` (URL escondida en un script ofuscado: no se resuelve sin ejecutar su código). TatoTV lee las cuatro agendas resolubles y descarta los hubs no usables.

**Canales sin emisión:** un hub puede devolver una lista con token que en realidad responde «not found» (canales reutilizados como `disney24`, `tudn_mx`). Antes se mostraba el reproductor del hub con su aviso («ingresa a pelotalibre.uno»). Ahora `/api/resolve` lo marca `dead`, el reproductor lo tacha y pasa al siguiente, y el calendario los poda antes de llegar a la lista (comprobación cacheada 3 min).

## StreamEast sin iframes ni redirecciones (ingeniería inversa)

La página de cada partido de StreamEast trae botones `Server1`, `Server2`… (`id="stream-btn-<id>"`) y un iframe `gooz.aapmains.net/new-stream-embed/<id>`. Ese embed **solo se deja incrustar en una lista de dominios** (`frame-ancestors`), por eso antes salía «no permite verse». Ahora: `/api/servers` lee los botones de la página y devuelve un servidor por id → `/api/resolve` lee del embed la lista HLS (`const SOURCE = "…/playlist/<id>/load-playlist"` o `Clappr source: atob(…)`), que **solo responde con el Referer/Origin del embed** → `/api/hls` la reproduce con ese Referer y la entrega a nuestro `<video>`. Los segmentos no traen CORS, por eso también van por el proxy. Resultado: se ve dentro de TatoTV, sin anuncios del sitio, sin abrir pestañas.

**Ancho de banda:** el vídeo de StreamEast (≈ 4 Mbps, unos 1,8 GB por hora y espectador) pasa por Vercel; con el plan gratuito (100 GB/mes) son ≈ 55 horas de visionado entre todos. Los servidores que no exigen Referer (tvf90 y similares) van directos del origen al navegador y no consumen ancho de banda de Vercel. Los reproductores protegidos por dominio / Turnstile (`pandebut.net`, `dynbush.net`, `trendplace.top`: «Not allowed / domain protected») se detectan y se descartan; «Capo Deportes» se quitó.

## futbolvivo.tv / golygoals.com (ingeniería inversa)

Su página pide `cdn.strm-api.org/api/v1/gsc/matches`, que responde **cifrado** (`k1…`): AES-GCM con una clave de 256 bits que va en su propia página, sobre base64url con el alfabeto sustituido y la cadena invertida; los primeros 12 bytes son el IV. `lib/futbolvivo.js` lo descifra con WebCrypto (sin ejecutar su código) y convierte cada partido en una fuente más del calendario (el id de ESPN va dentro de su `api_id`, así que el emparejamiento es exacto). Cada partido trae señales de dos proveedores: `se` (los mismos embeds de StreamEast → soportado) y `sc` (StreamCenter: entrega el vídeo con una concesión firmada y un worker propio; la lista responde 403 fuera de su reproductor → **no soportado**, se omite). Si la clave cambiara, la fuente devuelve vacío y las demás siguen funcionando. Pendiente (sin permiso de ejecución): su catálogo en español de `futbolvivo.tv` (`__lx(3)`), que usa un script ofuscado en la página principal.

## Prioridad por «peso» de los servidores

Cada servidor lleva una prioridad (menor = antes): 1–3 enlaces que van **directos** al navegador (tvf90, pirlotv…: no gastan ancho de banda de Vercel) → 7 señales de futbolvivo/StreamEast que pasan por el proxy (≈ 4 Mbps) → 8 StreamEast → 9 «marco» de StreamCenter (se carga en su propio reproductor, sin `sandbox` porque lo rechaza). Si el primero falla, el reproductor pasa solo al siguiente. Si un partido solo tiene enlaces pesados, se usan igualmente: lo importante es verlo.

## Más señales y «siempre en vivo»

- **tvf90.com es un hub de canales:** el mismo canal responde en `1`, `2`, `3`, `hd` y `canal.php?stream=<id>`; la agenda solo lista algunas rutas y TatoTV ofrece las demás (la comprobación de `/api/resolve` descarta las que no sirvan). De 82 a unos 180 servidores únicos en una pasada de fútbol, con ~95 % resueltos a vídeo vivo.
- **Canales 24/7** (`/api/channels`): (1) *hub*: se leen las páginas `/en-vivo/<canal>` de los sitios de agenda y se obtiene el reproductor de cada canal; (2) *listas IPTV* públicas (iptv-org por categoría, idioma y país, y Free-TV): se filtran los deportivos, se agrupan por nombre (varias URLs = respaldos) y **se comprueba cada uno** (lista maestra → variante → primer fragmento) antes de ofrecerlo. Respuesta cacheada 30 min en el CDN y en el Service Worker.
- En el reproductor, cada partido muestra además **«Canales 24/7»** del deporte: aunque el partido no tenga servidores siempre hay algo que probar.
- `node tools/validate.mjs <deporte>` verifica partidos, servidores, vídeo vivo y canales.

## Fuentes (ingeniería inversa, verificada)

| Sitio | Cómo se conecta realmente | Qué usa TatoTV |
|---|---|---|
| futbollibretvplay.org (+ espejos rojadirectatvplay.org/.com, futbollibretvplus.org/.com) | Cascarón HTML; su `js/index.js` llama a la API Strapi **`api.wqxag.com/diaries.json`** (CORS abierto, hora `America/Lima`). Los embeds son `/embed/eventos.html?r=<base64>` → `tvf90.com/N.php?stream=…` → iframe `5.php` con el `.m3u8` en claro | Agenda + servidores. **24/24 servidores resueltos a vídeo directo** |
| rojadirectatvlive.me | `app.js` consume **`adstrim.quest/api/matches`** (respaldo `adstrim.site`): el `id` es el id de evento de ESPN, hora UTC, hasta N iframes | Servidores enlazados por id de ESPN |
| pirlotv.la | HTML servido por el servidor (`<li><a>Liga: A vs B<span class=t>`); cada canal → `cdplay.live` → `streamx….sbs` → `.m3u8` (3 saltos) | Agenda + servidores |
| StreamEast | El reproductor lo inyecta JS y la página **prohíbe iframes** (X-Frame-Options → «refused to connect») | Botón «Abrir en pestaña nueva» |
| futbolvivo.tv, sportsonline, embedsports, streamxhd | Reproductores protegidos (Cloudflare Turnstile / URL ofuscada). No se evade ninguna protección | Se incrustan en su propio iframe |

`node tools/validate.mjs [deporte]` repite la verificación completa con red real: agenda → servidores → `/api/resolve` → lista `.m3u8` viva, agrupado por host.

## Marca, carga y caché de interfaz

- `icons/`, `favicon.ico`, `img/logo-*.png` y `img/og.png` se generan desde `tatotv.png`; el logo se muestra en el **splash**, la cabecera, los estados vacíos y el reproductor.
- Splash de carga (se retira cuando hay datos; mínimo 0,7 s) y **skeletons** con la forma real de partidos, canales, noticias y reproductor; las miniaturas hacen *shimmer* hasta cargar.
- El vídeo se prueba **directo** desde el navegador (sin gastar tu ancho de banda de Vercel) y solo cae al proxy si el origen lo exige. No hay rastreadores ni analítica propios; los iframes ajenos van con `sandbox` (sin ventanas emergentes) y un botón «sin bloqueo» si el reproductor lo necesita.

## SEO, descubrimiento y legal (al estilo TatoCine / TatoSound)

- **Archivos:** `robots.txt` (con rastreadores de IA permitidos), `sitemap.xml`, `llms.txt` y `llm.txt`, `manifest.webmanifest` (id, accesos directos, capturas, `launch_handler`), `404.html`, `500.html`, `offline.html` y datos estructurados JSON-LD (WebSite + WebApplication).
- **Dominio:** los archivos usan `https://tatotv.vercel.app`; al empaquetar, `SITE_URL=https://tu-dominio.com npm run package` lo reemplaza en todos (y estampa `lastmod`).
- **Legal:** aviso y descargo **obligatorio** («Aceptar y continuar») antes de abrir cualquier reproductor, con versión (`2026-11`; si cambia, se pide de nuevo). Centro **Legal** (descargo, privacidad, código fuente, créditos, sitios de terceros, retiro de contenido), pie legal en la lista, aviso bajo el reproductor, `legal.html`, `PRIVACY.md`, `THIRD_PARTY_NOTICES.md` y `LICENSE`. Un único documento (`js/legal.js`) alimenta todo. Ajusta `REPO`, `OPERATOR` y `CONTACT` en ese archivo antes de publicar.
- **Rendimiento:** modo ligero automático (TV, conexión lenta, ahorro de datos, equipo modesto) con botón manual; precarga en reposo de los otros deportes; caché en 4 capas.

## Despliegue en Vercel

```bash
npm run package          # genera dist/site y dist/tatotv-<versión>.zip
cd dist/site && npx vercel --prod
```

También puedes conectar el repositorio de Git a Vercel (no necesita *build command* ni *output directory*: la raíz es el sitio). El `.zip` contiene exactamente lo que se publica (descomprímelo y despliega esa carpeta).

> Vercel no tiene «subir ZIP» en el panel: se despliega desde Git, con la CLI (`vercel`) o arrastrando la carpeta descomprimida con la CLI/Vercel for Git.

## Por qué no se satura

1. **CDN primero.** Todas las respuestas llevan `s-maxage` + `stale-while-revalidate`: agenda de hoy 45 s, otros días 30 min, noticias 15 min, listas HLS 2 s, segmentos 30 s. Mil visitantes = una ejecución por ventana, no mil.
2. **Sin navegador.** Nada de Chromium: cada función dura milisegundos y casi no usa memoria (Edge Runtime).
3. **Trabajo en el cliente.** M3U, escudos (CDN de ESPN) y arte van directo del navegador; el servidor no los toca.
4. **Caché en 3 capas en el dispositivo:** memoria con deduplicación → `localStorage` con *stale-while-revalidate* (pinta al instante lo último guardado) → Service Worker (shell offline, API con frescura por tipo, imágenes cache-first).
5. **Sin llamadas a Wikipedia.** Las miniaturas son escenas SVG estáticas (3 variantes por deporte, ~1 KB) con el escudo de ESPN o iniciales como respaldo. Los fondos por deporte también son SVG estáticos cacheados para siempre.
6. **Anti-abuso:** `/api/resolve` y `/api/hls` solo aceptan llamadas de tu propio dominio y rechazan IPs internas (anti-SSRF).

## Reproducción (de más a menos fiable)

`embed` → `/api/resolve` extrae el `.m3u8` → hls.js vía `/api/hls` → si falla, la página se incrusta en un `<iframe>`.  
`page` (p. ej. StreamEast, que inyecta el reproductor con JS) → `<iframe>` directo + enlace «abrir en pestaña nueva».  
Canal M3U → directo; si el origen no permite CORS o es `http://`, por el proxy.

**Límite honesto:** si un origen bloquea IPs de centros de datos (Cloudflare) o ata el token a la IP, ese servidor fallará desde Vercel; para eso están los varios servidores por partido y el respaldo en iframe. El vídeo de los servidores `embed` pasa por `/api/hls` y consume ancho de banda de tu plan.

## Fluidez a 30, 60, 75, 120 y 165 Hz

Sin animaciones ni transiciones (nada depende de la frecuencia de la pantalla), ningún manejador de scroll ni trabajo por fotograma, filas con `content-visibility`, lista **incremental** (se pintan 20–36 filas y el resto al acercarse al final con IntersectionObserver), **imágenes perezosas** con margen amplio (las miniaturas de abajo ya están listas al llegar), hls.js solo al reproducir, fondo en capa propia y refresco de datos que solo repinta si algo cambió. Los escudos se guardan en el Service Worker (hasta 1500, sin caducidad) y en `localStorage` se recuerda el escudo de cada equipo para reutilizarlo en otras fuentes.

## Retrocompatibilidad (suelo: Chromium 68 — LG webOS 5, Tizen 5.5 y Fire TV 2020)

- **Sin transpilar:** scripts clásicos, `fetch` + Promesas, sin `?.`/`??`/`replaceAll`/`flat`; `node tools/compat.test.mjs` lo comprueba (y que no haya emojis).
- **CSS con respaldos automáticos:** al empaquetar, `tools/css-legacy.cjs` (el mismo de TatoCine) añade el valor equivalente antes de `min()`/`max()`/`clamp()`, `env()` e `inset`, y reglas gemelas para `:focus-visible` y `gap` en flex. `js/boot.js` detecta lo que falta y marca `html.no-flex-gap` / `html.no-focus-visible`; los navegadores modernos no pagan nada.
- **Modo TV** (`html.tv`, automático en Smart TV y Fire TV o con `?tv=1`): interfaz más grande, márgenes de seguridad (overscan), foco grueso y **navegación con mando** (flechas, OK y Atrás: Tizen 10009, webOS 461, Android 4) en `js/tv.js`. Límite honesto: sin el televisor real solo se puede afirmar que el código no usa nada posterior sin detección.
- **Pantallas:** interfaz en `rem` (escala en 1280, 1600, 1920, 2560 y 3440 px), barra inferior fija con las vistas en móvil y tableta, dos columnas compactas en tableta ancha, columna ancha en escritorio/TV, zonas seguras de iPhone y modo horizontal. Sin emojis: iconos SVG en un sprite.

## Desarrollo

```bash
npm run dev        # http://localhost:3000 (estáticos + /api con el mismo código que Vercel)
npm test           # pruebas de la lógica pura (sin red)
node tools/validate.mjs   # valida las fuentes con red real
npm run art        # regenera fondos y miniaturas SVG (img/)
npm run package    # dist/site + ZIP (con ?v=hash y versión del Service Worker)
```

Estructura: `index.html` · `css/app.css` · `js/{util,data,player,app}.js` · `js/vendor/hls.min.js` · `api/*.js` (Edge) · `lib/*.js` (compartido) · `img/` · `icons/` · `sw.js` · `vercel.json`.

### Cambiar el fondo por una foto
Pon `img/bg-hockey.jpg` (etc.) y apunta a ella en `css/app.css` (`body[data-sport="…"] .bg`). Se cachea igual.

### Añadir una fuente de partidos
Escribe una función en `lib/sources.js` que devuelva `{title, league, home, away, start, sport, servers:[{name,url,kind}]}` y súmala en `scrapeAgenda`.

## Aviso legal

TatoTV es un agregador de enlaces públicos; no aloja ni transmite contenido. La reproducción se realiza con fuentes de terceros y el uso es responsabilidad del usuario. Marcadores y escudos: ESPN. Canales: iptv-org.

Licencia MIT.
