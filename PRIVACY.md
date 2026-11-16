# TatoTV — Política técnica de privacidad

Última revisión: 13 de noviembre de 2026 · Versión del aviso legal: 2026-11

## Qué se guarda en tu dispositivo
- `localStorage`: deporte elegido, copia temporal de agendas, noticias y canales (con fecha para caducarlas), modo ligero y la aceptación del aviso legal.
- `sessionStorage`: la misma copia temporal, solo para la pestaña actual.
- Service Worker y Cache Storage: archivos de la app, escudos y respuestas recientes para funcionar sin conexión.
No hay cuentas ni base de datos de usuarios. Se borra todo desde los datos del sitio del navegador.

## Qué procesan los servidores
Las funciones Edge de Vercel atienden `/api/schedule`, `/api/news`, `/api/resolve` y `/api/hls` (agenda, noticias, resolución del enlace de video y proxy HLS). No guardan registros propios ni el video; el CDN conserva respuestas por segundos o minutos. Vercel y los sitios consultados pueden ver datos técnicos de la conexión (por ejemplo, la IP del servidor), según sus propias políticas.

## Lo que TatoTV no hace
Sin analítica, publicidad, telemetría, huellas digitales ni rastreadores propios; no vende datos. Los reproductores y sitios de terceros sí pueden usar cookies, anuncios y rastreadores: los iframes se cargan con `sandbox` (sin ventanas emergentes) y se recomienda un navegador con protección de rastreo, como Brave.

## Seguridad
`/api/resolve` y `/api/hls` solo aceptan llamadas del propio dominio y rechazan direcciones internas (anti-SSRF). No expongas ni reutilices el proxy como servicio público.

## Retiro de contenido
Los titulares de derechos pueden pedir el retiro de un enlace abriendo un *Issue* en el repositorio (https://github.com/r1h1/tatofutbol).
