 <div align="center">

# TatoTV

**Agregador local de deportes en vivo y canales M3U.**

Fútbol · Arquitectura multi-deporte · +2.500 canales M3U · Reproductor HLS integrado.

<br>

![Estado](https://img.shields.io/badge/Estado-LOCAL%20ONLY-brightgreen?style=for-the-badge)
![Versión](https://img.shields.io/badge/Versión-2.0.0-e50914?style=for-the-badge)
![Backend](https://img.shields.io/badge/Backend-FastAPI%20%2B%20Playwright-009485?style=for-the-badge)
![Frontend](https://img.shields.io/badge/Frontend-HTML5%20%7C%20CSS3%20%7C%20JS-252525?style=for-the-badge)
![Licencia](https://img.shields.io/badge/Licencia-MIT-blue?style=for-the-badge)

**Aplicación de escritorio ejecutada localmente. Sin cuentas, sin base de datos y sin infraestructura pública.**

</div>

---

## Contenido

- [Acerca de TatoTV](#acerca-de-tatotv)
- [Funcionamiento local](#funcionamiento-local)
- [Características](#características)
- [Arquitectura y tecnologías](#arquitectura-y-tecnologías)
- [Requisitos](#requisitos)
- [Instalación y ejecución](#instalación-y-ejecución)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Configuración](#configuración)
- [Personalización y extensibilidad](#personalización-y-extensibilidad)
- [Solución de problemas](#solución-de-problemas)
- [Privacidad y seguridad](#privacidad-y-seguridad)
- [Aviso legal y atribuciones](#aviso-legal-y-atribuciones)
- [Licencia](#licencia)

---

## Acerca de TatoTV

TatoTV es un proyecto personal que reúne información de eventos deportivos, fuentes de reproducción y listas públicas M3U en una sola interfaz.

Su objetivo es ofrecer una experiencia sencilla y centralizada para consultar partidos y acceder a canales deportivos mediante un reproductor integrado.

La aplicación combina un backend desarrollado con **FastAPI**, automatización de navegador mediante **Playwright** y una interfaz web construida con HTML, CSS y JavaScript nativo.

TatoTV está diseñado para ejecutarse en el equipo del usuario. El backend y el frontend funcionan localmente, mientras que las solicitudes a fuentes externas se realizan desde la conexión a Internet del propio usuario.

> **Importante:** TatoTV es un proyecto experimental y de uso local. La disponibilidad de partidos, canales, enlaces y servidores depende de servicios externos que no están bajo el control del proyecto.

## Funcionamiento local

<aside>

**TatoTV está diseñado para ejecutarse en localhost. No es una aplicación preparada ni soportada para despliegue público.**

</aside>

Esta decisión responde a las características técnicas de sus componentes.

### 1. Automatización con Chromium

La extracción de información de algunas fuentes requiere un navegador real. Playwright inicia Chromium en segundo plano, carga las páginas y procesa el contenido necesario para identificar los posibles enlaces de reproducción.

El consumo de memoria depende del sitio, las páginas abiertas y la concurrencia. Chromium puede utilizar varios cientos de megabytes por instancia, por lo que ejecutar varios procesos simultáneamente puede incrementar considerablemente el uso de RAM.

### 2. Restricciones de las fuentes externas

Algunos sitios utilizan Cloudflare, Akamai y otros sistemas de protección que pueden restringir solicitudes automatizadas o procedentes de direcciones IP de centros de datos.

Por este motivo, una fuente que funciona desde una conexión residencial podría no responder de la misma manera desde un servidor alojado en la nube.

### 3. Enlaces de reproducción temporales

Algunas fuentes generan enlaces de reproducción con tokens, parámetros de sesión o vencimientos temporales.

Obtener esos enlaces justo antes de utilizarlos reduce la posibilidad de trabajar con direcciones caducadas. Sin embargo, no garantiza que el servidor externo mantenga disponible el contenido.

### 4. Infraestructura y recursos

El scraping con navegador real, el procesamiento de listas M3U y el proxy HLS necesitan recursos y conectividad suficientes.

Los límites de memoria, CPU, almacenamiento y red de una plataforma de alojamiento pueden impedir que el proyecto funcione correctamente.

**La recomendación es ejecutar TatoTV desde tu propia computadora:**

- Aplicación: `http://localhost:5500`
- Backend: `http://localhost:8000`
- Documentación API: `http://localhost:8000/docs`

No se recomienda exponer estos servicios a Internet ni utilizar los archivos de configuración de alojamiento heredados como una indicación de soporte para producción.

---

## Características

### Deportes

TatoTV utiliza una arquitectura extensible para incorporar diferentes categorías deportivas.

| Deporte | Estado | Descripción |
|---|---|---|
| Fútbol | Disponible | Extracción de información desde fuentes configuradas. |
| Basketball | En preparación | Configuración disponible, deshabilitado en la interfaz actual. |
| Otros deportes | Extensible | Posibilidad de incorporar tenis, hockey, béisbol, MMA y otras categorías mediante nuevas fuentes. |

### Canales M3U

TatoTV agrega listas públicas de canales procedentes de diferentes proyectos.

Fuentes configuradas:

- [iptv-org/iptv](https://github.com/iptv-org/iptv)
- [Free-TV/IPTV](https://github.com/Free-TV/IPTV)

Características:

- Catálogo de aproximadamente 2.500 canales, sujeto a disponibilidad y cambios en las listas.
- Entradas manuales adicionales configuradas en `backend/m3u_sources.py`.
- Clasificación automática por palabras clave y categorías deportivas.
- Caché de una hora para reducir solicitudes repetitivas.
- Integración de diferentes fuentes M3U en un único catálogo.

La disponibilidad de cada canal depende de su proveedor y de las condiciones de acceso de la fuente original.

### Extracción de eventos deportivos

El sistema cuenta con cinco fuentes configuradas para fútbol:

- `rojadirectatvplay.org`
- `futbollibretvplus.org`
- `pelotalibrenvivo.com`
- `pirlotv.la`
- `pirlo-tv.club`

El proceso utiliza:

- Playwright y Chromium para cargar páginas con contenido dinámico.
- Resolución de múltiples servidores por evento.
- Extracción de enlaces HLS cuando están disponibles.
- Comprobaciones de respuesta y disponibilidad de los recursos.
- Detección de idioma a partir de metadatos `EXT-X-MEDIA`.
- Caché temporal de resultados para evitar ejecutar el scraping en cada solicitud.

Las fuentes son externas y pueden cambiar su estructura, requerir interacción adicional o dejar de estar disponibles.

### Reproductor HLS integrado

El reproductor utiliza [hls.js](https://github.com/video-dev/hls.js) para gestionar la reproducción HLS en navegadores compatibles.

Incluye:

- Reproducción mediante HLS.
- Proxy local `/api/proxy`.
- Reescritura de referencias a playlists, segmentos y claves para gestionar restricciones CORS.
- Selector de servidores disponibles.
- Agrupación de servidores por idioma.
- Ajuste de la ventana de segmentos en reproducción en vivo.
- Integración con el modal de reproducción de la interfaz.

La compatibilidad de reproducción depende del navegador, el códec, el dispositivo y las características del stream original.

### Interfaz de usuario

La experiencia visual está inspirada en plataformas modernas de streaming.

Incluye:

- Interfaz oscura.
- Hero principal con rotación automática cada ocho segundos.
- Filas horizontales con navegación por flechas.
- Desplazamiento táctil en dispositivos móviles.
- Skeleton loaders durante la carga de contenido.
- Diseño responsive para móviles, tablets y escritorio.
- Interfaz adaptable a navegadores de Smart TV.
- Miniaturas obtenidas mediante Wikipedia, con mecanismos de fallback.

La adaptación visual a una pantalla 4K no garantiza que todos los navegadores de Smart TV puedan reproducir cualquier formato de vídeo.

### Búsqueda

- Filtro en tiempo real por nombre del evento y liga.
- Procesamiento sobre los datos cargados en el frontend.
- Sin solicitudes adicionales al backend para cada cambio de búsqueda.

---

## Arquitectura y tecnologías

TatoTV utiliza una arquitectura ligera dividida en dos componentes principales.

```text
                    TATOTV
                       |
          +------------+------------+
          |                         |
       FRONTEND                  BACKEND
          |                         |
    HTML5 / CSS3               FastAPI
    JavaScript                  Uvicorn
          |                         |
    hls.js Player              Playwright
          |                    Chromium
          |                         |
          +---------- API ----------+
                       |
              Fuentes externas
                       |
        +--------------+--------------+
        |              |              |
       M3U          Scraping        Wikipedia
        |              |              |
        +--------------+--------------+
                       |
                 Reproductor HLS
```

### Stack tecnológico

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Backend | FastAPI | API REST y lógica de aplicación. |
| Backend | Uvicorn | Servidor ASGI. |
| Backend | httpx | Solicitudes HTTP asíncronas y proxy. |
| Backend | Playwright | Automatización del navegador. |
| Backend | Chromium | Carga de páginas dinámicas. |
| Backend | BeautifulSoup4 | Procesamiento HTML. |
| Backend | lxml | Parser HTML/XML. |
| Frontend | HTML5 | Estructura de la aplicación. |
| Frontend | CSS3 | Estilos, animaciones y diseño responsive. |
| Frontend | JavaScript Vanilla | Interacciones, DOM y peticiones API. |
| Reproducción | hls.js | Reproducción de streams HLS. |
| Datos | iptv-org | Listas M3U públicas. |
| Datos | Free-TV/IPTV | Listas M3U públicas. |
| Datos | Wikipedia API | Obtención de miniaturas. |
| Datos | ESPN API | Información de eventos, cuando está habilitada. |

### Flujo de funcionamiento

1. El usuario inicia TatoTV mediante el launcher de su sistema operativo.
2. El launcher prepara el entorno e inicia el backend y frontend.
3. El navegador accede a la interfaz en `localhost:5500`.
4. El frontend solicita los datos disponibles a FastAPI.
5. El backend consulta las fuentes configuradas y procesa la información.
6. Playwright interviene cuando es necesario cargar páginas dinámicas.
7. El frontend presenta los eventos, canales y servidores disponibles.
8. Cuando el usuario selecciona una reproducción, el reproductor gestiona el stream mediante hls.js y el proxy local cuando corresponde.

---

## Requisitos

### Requisitos de software

- Python 3.10 o superior.
- Chromium instalado mediante Playwright.
- Navegador web moderno.
- Conexión a Internet.

Versiones de Python probadas según la configuración del proyecto: 3.11, 3.12 y 3.13.

### Requisitos de hardware recomendados

| Recurso | Recomendación |
|---|---|
| RAM | 4 GB disponibles o más. |
| Almacenamiento | Reservar aproximadamente 2 GB o más. |
| Procesador | Cualquier CPU moderna con capacidad suficiente para ejecutar Chromium. |
| Red | Conexión estable a Internet. |

El consumo real depende del número de páginas abiertas, las fuentes consultadas, la cantidad de procesos concurrentes y el navegador utilizado.

### No necesitas

- Node.js.
- npm o yarn.
- Docker.
- Base de datos.
- Cuenta de usuario.
- API key de TMDB.
- Registro en una plataforma externa.

---

## Instalación y ejecución

### Linux

Clona el repositorio:

```bash
git clone URL_DEL_REPOSITORIO tatotv
cd tatotv
```

Concede permisos de ejecución al launcher:

```bash
chmod +x run.sh
```

Inicia la aplicación:

```bash
./run.sh
```

### macOS

Desde la terminal:

```bash
git clone URL_DEL_REPOSITORIO tatotv
cd tatotv
chmod +x run.sh
./run.sh
```

También puedes utilizar `run.command` desde Finder, haciendo doble clic si el archivo tiene los permisos correspondientes.

### Windows

Clona el repositorio y abre PowerShell dentro de la carpeta:

```powershell
git clone URL_DEL_REPOSITORIO tatotv
cd tatotv
```

Ejecuta:

```powershell
.\winrun.ps1
```

Si Windows bloquea la ejecución del script, puedes permitirla únicamente para el proceso actual de PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\winrun.ps1
```

También puedes iniciar TatoTV haciendo doble clic en:

```text
cmdrun.bat
```

> Sustituye `URL_DEL_REPOSITORIO` por la dirección real del repositorio Git. Si descargaste un archivo ZIP, simplemente descomprímelo y ejecuta el launcher correspondiente desde la carpeta del proyecto.

### ¿Qué hace el launcher?

Los launchers automatizan las tareas necesarias para iniciar el proyecto:

1. Detectan una instalación compatible de Python.
2. Crean el entorno virtual `venv/` cuando no existe.
3. Instalan las dependencias desde `backend/requirements.txt`.
4. Instalan Chromium mediante Playwright cuando es necesario.
5. Comprueban la compatibilidad entre Playwright y su navegador.
6. Inician FastAPI mediante Uvicorn.
7. Inician el servidor del frontend.
8. Abren la aplicación en el navegador predeterminado.
9. Gestionan la terminación de los procesos al cerrar la aplicación.

La primera instalación necesita descargar dependencias y Chromium. El tiempo depende de la conexión y del equipo.

### Acceso a la aplicación

Una vez iniciada:

| Servicio | Dirección |
|---|---|
| Aplicación | [http://localhost:5500](http://localhost:5500) |
| Backend | [http://localhost:8000](http://localhost:8000) |
| Documentación Swagger | [http://localhost:8000/docs](http://localhost:8000/docs) |
| Health check | [http://localhost:8000/health](http://localhost:8000/health) |

### Archivos de registro

Los launchers generan archivos de registro en la raíz del proyecto:

```text
backend.log
frontend.log
```

Consulta estos archivos cuando la aplicación no consiga iniciar, cargar eventos o reproducir contenido.

### Detener la aplicación

Utiliza:

```text
Ctrl + C
```

El launcher debería encargarse de detener los procesos que inició.

---

## Estructura del proyecto

```text
tatotv/
│
├── backend/
│   ├── __init__.py
│   ├── main.py                 # Aplicación FastAPI y endpoints
│   ├── scraper.py              # Extracción de eventos con Playwright
│   ├── sports_config.py        # Deportes y fuentes configuradas
│   ├── m3u_sources.py          # Integración de listas M3U
│   ├── thumbnails.py           # Obtención de miniaturas
│   └── requirements.txt        # Dependencias Python
│
├── frontend/
│   ├── index.html              # Interfaz, estilos y lógica JS
│   ├── offline.html             # Página para situaciones sin conexión
│   ├── sw.js                    # Service Worker
│   └── manifest.webmanifest     # Configuración PWA
│
├── run.sh                       # Launcher Linux / macOS
├── run.command                  # Launcher macOS mediante Finder
├── winrun.ps1                   # Launcher Windows PowerShell
├── cmdrun.bat                   # Launcher Windows CMD
│
├── Dockerfile                   # Configuración opcional no soportada
├── render.yaml                  # Configuración heredada de Render
├── netlify.toml                 # Configuración heredada de Netlify
│
├── README.md                    # Documentación del proyecto
└── LICENSE                      # Licencia MIT
```

Los directorios `venv/`, archivos `.log` y demás elementos generados durante la ejecución pueden aparecer después de iniciar la aplicación y no forman parte necesariamente del repositorio.

---

## Configuración

TatoTV permite modificar ciertos comportamientos mediante variables de entorno.

Todas son opcionales y utilizan los valores predeterminados definidos por el proyecto cuando no se especifican.

### Variables de entorno

| Variable | Valor predeterminado | Descripción |
|---|---|---|
| `HEADLESS` | `1` | `1` ejecuta Chromium en segundo plano; `0` permite visualizar el navegador. |
| `MATCH_VISIBLE_MINUTES` | `200` | Minutos hacia atrás considerados para mostrar eventos anteriores. |
| `LIVE_WINDOW_SEGMENTS` | `4` | Cantidad de segmentos HLS conservados en la ventana de reproducción en vivo. |
| `ALLOWED_ORIGINS` | Configuración del proyecto | Orígenes permitidos para CORS. |

### Ejemplo en Linux y macOS

Ejecutar con Chromium visible y ampliar el periodo de eventos:

```bash
HEADLESS=0 MATCH_VISIBLE_MINUTES=300 ./run.sh
```

### Ejemplo en Windows PowerShell

```powershell
$env:HEADLESS="0"
$env:MATCH_VISIBLE_MINUTES="300"
.\winrun.ps1
```

Las variables establecidas en la terminal se mantienen asociadas a esa sesión.

---

## Personalización y extensibilidad

La arquitectura de TatoTV permite añadir categorías deportivas y nuevas fuentes sin tener que reconstruir toda la aplicación.

### Añadir un deporte

Abre:

```text
backend/sports_config.py
```

Añade una entrada al diccionario `SPORTS` siguiendo la estructura utilizada por los deportes existentes.

Ejemplo ilustrativo:

```python
"tennis": {
    "display_name": "Tenis",
    "icon": "tennis",
    "accent": "#f4a261",
    "use_m3u": True,
    "available": True,
    "sources": [
        {
            "name": "fuente_tenis",
            "base_url": "https://ejemplo.com",
            "agenda_url": "https://ejemplo.com/agenda",
            "source_type": "generic",
            "min_title_len": 5,
        },
    ],
},
```

Después:

1. Añade el icono SVG `sport-tennis` en el bloque de definiciones de iconos de `frontend/index.html`.
2. Añade las palabras clave correspondientes en `SPORT_KEYWORDS`, dentro de `backend/m3u_sources.py`.
3. Verifica que las fuentes sean compatibles con el parser correspondiente.
4. Reinicia el backend.

La disponibilidad final en la interfaz depende de cómo el frontend gestione las categorías configuradas.

### Añadir una fuente de extracción

Las fuentes se configuran en:

```text
backend/sports_config.py
```

Dentro del deporte correspondiente, incorpora una entrada con la estructura utilizada por las fuentes existentes.

Ejemplo:

```python
"football": {
    "sources": [
        # Fuentes existentes
        {
            "name": "mi_fuente_nueva",
            "base_url": "https://mi-sitio.com",
            "agenda_url": "https://mi-sitio.com/agenda",
            "source_type": "generic",
            "min_title_len": 5,
        },
    ],
}
```

Para las fuentes compatibles con el parser genérico, `_generic_site_scraper` se encarga del procesamiento habitual.

No todas las páginas tienen la misma estructura. Una fuente que requiere selectores, interacciones o mecanismos especiales puede necesitar un scraper específico.

### Clasificación de canales M3U

Para incorporar términos de clasificación, modifica:

```text
backend/m3u_sources.py
```

Busca el diccionario `SPORT_KEYWORDS` y añade las palabras clave correspondientes a la categoría que deseas identificar.

---

## Solución de problemas

### No aparecen partidos: total de 0 eventos

**Causas posibles:**

- Chromium no está instalado.
- La versión instalada no coincide con Playwright.
- Las fuentes externas no responden.
- La estructura de los sitios ha cambiado.
- La conexión está restringiendo las solicitudes.

**Solución:**

```bash
./venv/bin/python -m playwright install chromium
```

Después, reinicia TatoTV y revisa `backend.log`.

Busca mensajes similares a:

```text
[SCRAPER:football:XXX] OK (N partidos)
```

También revisa los mensajes `FALLÓ`, que pueden mostrar la fuente responsable del error.

### `Executable doesn't exist at /ms-playwright/...`

**Causa:** Playwright no encuentra el navegador que necesita para ejecutar la automatización.

**Solución:**

```bash
./venv/bin/python -m playwright install chromium
```

Si actualizaste Playwright, vuelve a instalar el navegador asociado a la versión instalada.

### `ModuleNotFoundError: No module named 'backend'`

**Causa:** el backend se está ejecutando desde una ubicación o con un comando que no respeta la estructura del paquete.

**Solución:** utiliza el launcher del proyecto:

```bash
./run.sh
```

Evita ejecutar directamente:

```bash
python backend/main.py
```

### Los canales cargan, pero no aparece el video

**Causas posibles:**

- El enlace de reproducción expiró.
- El servidor no permite la reproducción desde el navegador.
- El formato del stream no es compatible.
- El servidor no entrega segmentos HLS correctamente.
- El proxy no consigue resolver una referencia del stream.

**Verificaciones:**

1. Revisa los errores en la consola del navegador.
2. Comprueba el estado de las solicitudes al proxy.
3. Verifica que la dirección de origen siga activa.
4. Comprueba que el modal `#player-modal` reciba la clase `open` al seleccionar un canal o servidor.

### Aparecen miniaturas de animales en vez de equipos

**Causa:** algunos nombres de equipos coinciden con artículos de animales en Wikipedia.

**Solución:** revisa `backend/thumbnails.py`. La función `_is_sports_team_page()` permite comprobar si el resultado corresponde a un equipo deportivo.

Cuando ocurra con un equipo nuevo, revisa y amplía `_TEAM_CATEGORY_KEYWORDS` según corresponda.

### Las miniaturas tardan en cargar

**Causas posibles:**

- Latencia de Wikipedia.
- Red lenta.
- Primera carga sin caché.
- Solicitudes externas que tardan en responder.

El frontend utiliza `Promise.all` para procesar las solicitudes de miniaturas en paralelo. Las cargas posteriores también pueden beneficiarse de la caché en memoria.

### Todas las fuentes terminan en timeout

**Causas posibles:**

- Conexión lenta.
- Restricciones de acceso.
- Cambios en los sitios externos.
- Protección contra automatización.
- Problemas temporales del proveedor.

**Solución:**

1. Comprueba que los sitios respondan desde el navegador.
2. Revisa `backend.log` para identificar la fuente concreta.
3. Verifica tu conexión a Internet.
4. Comprueba si el scraper está utilizando los selectores y tiempos adecuados.

Los tiempos de espera pueden ajustarse en la implementación del scraper, pero aumentarlos no garantiza que una fuente vuelva a funcionar.

### `Ctrl + C` no detiene los procesos

En Linux:

```bash
pkill -f "uvicorn backend.main:app"
pkill -f "http.server 5500"
```

Utiliza estos comandos únicamente si confirmaste que esos procesos pertenecen a TatoTV. También puedes revisar los procesos antes de terminarlos:

```bash
ps aux | grep -E "uvicorn|http.server"
```

### Puerto 8000 o 5500 ocupado

**Linux / macOS:**

```bash
lsof -i :8000
lsof -i :5500
```

Cuando identifiques el PID:

```bash
kill PID
```

**Windows:**

```powershell
netstat -ano | findstr :8000
netstat -ano | findstr :5500
```

Para detener un proceso específico:

```powershell
taskkill /PID NUMERO_PID /F
```

No termines procesos sin verificar previamente su identidad.

### Render, Netlify o Fly.io no funcionan

TatoTV no ofrece soporte para despliegue público.

Los archivos `Dockerfile`, `render.yaml` y `netlify.toml` son configuraciones auxiliares o heredadas y no constituyen una garantía de compatibilidad con esas plataformas.

El diseño actual depende de Chromium, automatización de navegador y fuentes externas que pueden aplicar restricciones de acceso. No se recomienda intentar convertir esta configuración en un servicio público sin rediseñar previamente su arquitectura, seguridad y condiciones de uso.

---

## Privacidad y seguridad

TatoTV está diseñado para funcionar en el equipo local del usuario.

Consideraciones importantes:

- No requiere crear una cuenta en TatoTV.
- No necesita una base de datos para su funcionamiento descrito.
- El backend y el frontend se utilizan desde direcciones locales.
- Las solicitudes a servicios externos se realizan a través de Internet.
- Las fuentes M3U, los sitios consultados y los servidores de reproducción son servicios independientes.
- Los archivos de registro pueden contener información técnica sobre solicitudes y errores.

**No expongas el backend ni el proxy HLS a Internet.**

El endpoint `/api/proxy` no debe tratarse como un proxy público. Exponerlo sin controles adecuados puede permitir que terceros utilicen recursos de tu equipo o de tu conexión.

Asimismo, CORS no sustituye la autenticación ni los controles de acceso. La configuración `ALLOWED_ORIGINS` no debe considerarse una medida suficiente para proteger un servicio expuesto públicamente.

---

## Aviso legal y atribuciones

### Naturaleza del proyecto

TatoTV es un proyecto personal de software que organiza información y referencias a recursos disponibles en servicios de terceros.

El código del proyecto no incorpora necesariamente los archivos multimedia originales ni aloja directamente el contenido audiovisual reproducido.

La disponibilidad de canales, enlaces, eventos y recursos depende de fuentes externas, sus políticas, su infraestructura y sus respectivas condiciones de uso.

### Responsabilidad del usuario

El usuario es responsable de utilizar TatoTV de conformidad con las leyes aplicables en su jurisdicción y con los derechos de los titulares del contenido.

Que un enlace sea accesible públicamente en Internet no significa necesariamente que el contenido esté autorizado para su reproducción, redistribución o difusión.

Los desarrolladores no garantizan la legalidad, disponibilidad, precisión, seguridad ni continuidad de las fuentes externas.

Nada de lo indicado en este documento debe interpretarse como autorización para acceder, reproducir o redistribuir material protegido sin los permisos correspondientes.

### Atribuciones

**Listas M3U**

TatoTV permite integrar listas provenientes de proyectos externos, entre ellos:

- [iptv-org/iptv](https://github.com/iptv-org/iptv)
- [Free-TV/IPTV](https://github.com/Free-TV/IPTV)

Cada proyecto, lista y canal puede estar sujeto a condiciones y derechos diferentes. Consulta sus repositorios y licencias vigentes antes de utilizar o redistribuir sus recursos.

**Miniaturas**

Las imágenes obtenidas mediante Wikipedia pueden estar sujetas a diferentes licencias, dependiendo de cada archivo y de su autor. Consulta la página original de cada imagen para conocer sus condiciones de uso.

**Información deportiva**

Cuando está habilitada, la integración con ESPN se utiliza para consultar información deportiva. Se trata de una integración no oficial, sujeta a cambios y sin garantía de disponibilidad.

**Reproductor**

- [hls.js](https://github.com/video-dev/hls.js) — MIT License.

**Tipografía**

- Inter — SIL Open Font License.

### Marcas y servicios de terceros

TatoTV no está afiliado, patrocinado ni respaldado oficialmente por ESPN, Wikipedia, iptv-org, Free-TV, Cloudflare, las competiciones deportivas, los clubes, las ligas ni los servicios externos mencionados.

Las marcas, nombres, imágenes, escudos y logotipos pertenecen a sus respectivos titulares.

### Distribución del proyecto

Quien redistribuya TatoTV debe conservar las atribuciones y licencias aplicables, además de informar a los destinatarios sobre las condiciones de uso de los recursos externos.

La licencia MIT del código fuente no concede derechos adicionales sobre:

- Marcas comerciales.
- Logotipos e identidades visuales.
- Imágenes y fotografías.
- Vídeos y transmisiones deportivas.
- Listas M3U de terceros.
- Metadatos y recursos externos.

Este apartado constituye una descripción informativa del proyecto y no sustituye asesoría jurídica.

---

## Licencia

TatoTV utiliza la licencia **MIT** para el código fuente del proyecto.

Consulta el archivo [`LICENSE`](LICENSE) para conocer el texto completo.

La licencia MIT permite utilizar, copiar, modificar, fusionar, publicar, distribuir, sublicenciar y vender copias del software, sujeto a sus condiciones.

Su alcance se limita al código cubierto por dicha licencia. Los recursos, contenidos y dependencias de terceros conservan sus respectivas licencias y condiciones.

---

<div align="center">

## TatoTV

**Deportes en vivo. Todo desde tu entorno local.**

Proyecto personal de desarrollo · Uso local · Código abierto.

<sub>Construido con FastAPI, Playwright, Chromium y JavaScript.</sub>

</div>