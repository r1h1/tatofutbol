<div align="center">
  <h1>TatoCine</h1>
  <p><strong>Descubre. Explora. Organiza.</strong></p>
  <p>Catálogo web de películas y series con información de TMDB y una interfaz de streaming adaptable.</p>
  <p>
    <a href="https://github.com/r1h1/tatocine-streaming"><img src="https://img.shields.io/badge/Estado-Activo-success?style=for-the-badge" alt="Estado: Activo"></a>
    <img src="https://img.shields.io/badge/Versión-2.0.0-e50914?style=for-the-badge" alt="Versión 2.0.0">
    <img src="https://img.shields.io/badge/Stack-HTML5%20%7C%20CSS3%20%7C%20JavaScript-252525?style=for-the-badge" alt="HTML5, CSS3 y JavaScript">
    <img src="https://img.shields.io/badge/Licencia-MIT-blue?style=for-the-badge" alt="Licencia MIT">
  </p>
</div>

Acerca del proyecto
TatoCine es una aplicación web para explorar películas y series, consultar tendencias, descubrir próximos estrenos, buscar títulos y guardar favoritos desde una interfaz moderna y adaptable.

El catálogo utiliza la API de The Movie Database (TMDB) para obtener títulos, sinopsis, imágenes, fechas de estreno y calificaciones. La aplicación también dispone de una interfaz de reproducción que permite seleccionar entre las fuentes externas configuradas.

TatoCine está desarrollado con HTML5, CSS3 y JavaScript puro (Vanilla JavaScript). La versión estática se concentra en un único archivo index.html, por lo que no requiere un framework frontend, un proceso de compilación ni un backend propio para su ejecución básica.
Nota: los metadatos del catálogo y la reproducción son servicios distintos. TMDB proporciona información sobre las obras, pero no garantiza la disponibilidad de vídeo, el idioma del audio ni la calidad de las fuentes externas.

Contenido

- Características
- Tecnologías
- Requisitos
- Instalación y configuración
- Ejecución local
- Despliegue
- Estructura del proyecto
- Solución de problemas
- Capturas de pantalla
- Aviso legal y atribuciones
- Licencia
  Características
  Catálogo dinámico
- Tendencias cinematográficas.
- Próximos estrenos, con la región configurada para Guatemala cuando el endpoint lo admite.
- Películas populares y series populares.
- Portada principal con información del título destacado.
- Imágenes, sinopsis, fechas de estreno y calificaciones obtenidas de TMDB.
- Catálogo estático de respaldo para mostrar contenido cuando falla una consulta remota.
  Búsqueda de películas y series
- Búsqueda mediante la API de TMDB.
- Resultados de películas y series desde un único campo.
- Retardo controlado (debounce) para reducir solicitudes mientras se escribe.
- Actualización de resultados sin recargar la página.
- Mensajes para búsquedas sin coincidencias y errores de conexión.
  Mi Lista
- Guardar y quitar títulos favoritos.
- Acceso a los favoritos desde una sección independiente.
- Persistencia local mediante localStorage.
- Los elementos guardados se conservan entre visitas en el mismo navegador mientras no se borren los datos del sitio.
  Gestión de próximos estrenos
  La aplicación puede utilizar las fechas proporcionadas por TMDB para identificar títulos que todavía no se han estrenado. En las versiones que incorporan esta lógica, dichos títulos pueden mostrarse con un tratamiento visual diferenciado y deshabilitar la reproducción hasta la fecha correspondiente.

La fecha de estreno no garantiza que un título esté disponible en una fuente externa.
Reproductor y fuentes externas

- Interfaz de reproducción integrada mediante una ventana modal.
- Selector para cambiar entre fuentes configuradas.
- Indicador de carga durante la inicialización del reproductor.
- Rutas diferenciadas para películas y series, según la configuración de cada proveedor.
- Integración prevista con MovieMaster, TukiPlay, UnLimPlay y VidSrc, según la versión y la configuración del proyecto.
  La compatibilidad, la disponibilidad, el idioma y la calidad de reproducción dependen de cada proveedor. Los nombres o etiquetas de la interfaz no garantizan una pista de audio o una calidad determinada.
  Interfaz y experiencia de usuario
- Tema oscuro inspirado en plataformas de entretenimiento.
- Portada destacada con imagen de fondo y metadatos.
- Carruseles horizontales con controles de navegación.
- Tarjetas interactivas para los títulos.
- Diseño adaptable a computadoras, tabletas y teléfonos.
- Transiciones y animaciones discretas.
- Carga diferida de imágenes cuando corresponde.
- Indicadores visuales de carga, conexión y error.
- En las versiones que lo incluyen, rotación automática de la portada y desplazamiento automático de las filas.
  Manejo de errores y rendimiento
- Peticiones HTTP a TMDB mediante fetch.
- Renderizado dinámico de resultados.
- Almacenamiento local de favoritos.
- Datos de respaldo para fallos de conectividad.
- Mensajes de estado para facilitar el diagnóstico.
  Los datos de respaldo son estáticos y pueden no reflejar las tendencias ni los estrenos actuales.
  Tecnologías
  Tecnología Uso
  HTML5 Estructura de la aplicación.
  CSS3 Estilos, Flexbox, animaciones y diseño adaptable.
  JavaScript Eventos, peticiones HTTP y manipulación del DOM.
  TMDB API Tendencias, estrenos, búsqueda, metadatos e imágenes.
  localStorage Persistencia local de Mi Lista.
  Google Fonts Tipografía Inter.
  iframe Integración de reproductores externos compatibles.

Requisitos

- Navegador web moderno.
- Conexión a Internet.
- Clave API v3 válida de TMDB.
- Editor de código, como Visual Studio Code, recomendado para la configuración.
  La versión estática no requiere Node.js, npm install ni una base de datos.
  Instalación y configuración

1. Clonar el repositorio
   git clone https://github.com/r1h1/tatocine-streaming.git
   cd tatocine-streaming
   También puedes descargar el repositorio como ZIP desde GitHub y extraerlo localmente.
2. Obtener una clave API de TMDB
3. Crea una cuenta en The Movie Database.
4. Abre la configuración de tu cuenta.
5. Entra en la sección API.
6. Solicita las credenciales necesarias para la aplicación.
7. Revisa los términos de uso y los requisitos de atribución.
   Documentación oficial: TMDB API Documentation.
8. Configurar la clave API
   Abre index.html y localiza la declaración de la clave. El nombre exacto puede variar entre versiones:
   const TMDB_API_KEY = "TU_API_KEY_V3";
   Sustituye TU_API_KEY_V3 por una clave v3 válida.

Seguridad: una clave incluida en JavaScript del lado del cliente puede ser vista por cualquier visitante. No incluyas credenciales privadas ni tokens de acceso restringido en el repositorio. Si publicas el proyecto, revisa las recomendaciones de seguridad y las condiciones de TMDB. Para una aplicación con requisitos de protección más estrictos, gestiona las solicitudes desde un backend. 4. Comprobar la conexión con TMDB
Una consulta válida debe devolver una respuesta HTTP 200 y un objeto JSON con resultados. Si aparece 401, revisa la clave y el tipo de credencial. Si falla una solicitud de un proxy externo, comprueba si el código todavía está intentando utilizarlo; no es necesario depender de proxies públicos para consultar la API directamente cuando el acceso está disponible.
Ejecución local
Puedes utilizar la extensión Live Server de Visual Studio Code o iniciar un servidor HTTP con Python desde la carpeta del proyecto:
python3 -m http.server 5500
Abre la aplicación en:
http://localhost:5500
Asegúrate de que index.html se encuentre en la carpeta desde la que iniciaste el servidor. Para desarrollo, se recomienda usar HTTP local en lugar de abrir el archivo mediante file://.
Despliegue
TatoCine puede alojarse como sitio estático, sin compilación ni instalación de dependencias.
Netlify

1. Accede a Netlify.
2. Crea un sitio mediante despliegue manual o conecta el repositorio de GitHub.
3. Si haces un despliegue manual, arrastra la carpeta que contiene index.html.
4. Comprueba que el archivo principal esté en la raíz publicada.
5. Prueba la búsqueda, la carga del catálogo y la interfaz en el dominio final.
   Para automatizar las actualizaciones, conecta el repositorio de GitHub con Netlify. Los siguientes cambios podrán desplegarse según la configuración del sitio.
   Otras plataformas

- Vercel
- GitHub Pages
  El funcionamiento en localhost no garantiza que todos los servicios externos acepten solicitudes desde el dominio de producción. Verifica las credenciales, la conectividad y las políticas de integración después de publicar.
  Estructura del proyecto
  La versión de un solo archivo puede tener una estructura mínima como esta:
  tatocine-streaming/
  ├── index.html # Aplicación web: estructura, estilos y JavaScript
  ├── README.md # Documentación del proyecto
  └── LICENSE # Términos de distribución, si se incluye
  Si el proyecto incorpora imágenes, capturas u otros recursos, puedes organizarlos en una carpeta assets/.
  Solución de problemas
  El catálogo no carga
- Comprueba que la clave API v3 sea válida.
- Revisa la consola del navegador y la pestaña Network en las herramientas de desarrollo.
- Confirma si TMDB devuelve 401, 403 u otro estado HTTP.
- Verifica tu conexión a Internet.
- Comprueba que el navegador esté cargando el index.html que acabas de modificar y realiza una recarga forzada si parece estar mostrando una versión antigua.
  Aparece un error CORS o un proxy devuelve 403
  Un proxy público puede limitar, bloquear o dejar de admitir solicitudes. Comprueba qué URL aparece en la pestaña Network. Si la solicitud va a TMDB, diagnostica la respuesta de TMDB; si va a un proxy, el error puede corresponder al propio proxy. Evita depender de proxies públicos no controlados para un despliegue estable.
  La búsqueda no devuelve resultados
- Comprueba que el campo de búsqueda esté conectado al evento input.
- Revisa si la petición a /search/multi finaliza correctamente.
- Comprueba que el código no borre el contenido del campo al actualizar la vista.
- Distingue entre una respuesta válida sin coincidencias y un error de conexión.
  Una imagen no se muestra
  Comprueba que la ruta del póster o del fondo exista y que el código construya correctamente la URL de imagen de TMDB. Las rutas de imágenes pueden estar vacías en algunos resultados; conviene mostrar una imagen alternativa en esos casos.
  Un reproductor externo no funciona
  La fuente puede no estar disponible, rechazar la inserción en iframe, exigir permisos que no están habilitados o responder con errores HTTP. Estos problemas son independientes de la conexión del catálogo con TMDB y deben revisarse por separado. Utiliza fuentes que tengas autorización para integrar.
  Capturas de pantalla
  Añade capturas reales de la versión desplegada para mostrar la interfaz. Se recomiendan las siguientes vistas:
- Inicio: portada principal y carruseles del catálogo.
- Búsqueda: campo de búsqueda y resultados.
- Mi Lista: títulos guardados.
- Reproductor: ventana modal y selector de fuentes.
  Cuando guardes las imágenes en el repositorio, puedes mostrarlas con rutas relativas. Por ejemplo:
  ![Pantalla principal](assets/images/inicio.png)
  ![Resultados de búsqueda](assets/images/busqueda.png)
  ![Reproductor](assets/images/reproductor.png)
  Ajusta las rutas a la estructura real del proyecto. No dejes enlaces a capturas que todavía no estén incluidas, para evitar imágenes rotas en GitHub.
  Aviso legal y atribuciones
  TatoCine es una interfaz de catálogo que consulta información de películas y series y puede ofrecer acceso a reproductores externos configurados. La inclusión de un título o enlace no significa que el proyecto posea derechos de distribución sobre el contenido correspondiente.
- Los metadatos e imágenes de TMDB están sujetos a los términos de uso y requisitos de atribución del servicio.
- Los reproductores y proveedores externos mantienen sus propias condiciones, políticas de acceso y disponibilidad.
- Quien despliegue o distribuya una versión del proyecto debe verificar que las fuentes y los contenidos integrados cuenten con las autorizaciones necesarias y cumplan la legislación aplicable.
- TatoCine no está afiliado ni respaldado oficialmente por TMDB ni por los proveedores externos, salvo que exista un acuerdo expreso.
- Los reproductores externos pueden mostrar publicidad o recopilar datos según sus propias políticas.
- Este aviso es informativo y no sustituye asesoramiento jurídico ni las licencias que pudieran ser necesarias.
  Referencias:
- TMDB API Documentation
- TMDB API Terms of Use
  Licencia
  El proyecto indica la licencia MIT. Para que esa licencia sea aplicable de forma clara, incluye un archivo LICENSE con el texto correspondiente y confirma que tienes derecho a distribuir el código bajo esos términos.

La licencia del código no concede automáticamente derechos sobre marcas, imágenes, metadatos, vídeos, tipografías u otros recursos de terceros. Estos materiales continúan sujetos a sus propias licencias y condiciones.
Estado del proyecto
TatoCine es un proyecto independiente que puede evolucionar con nuevas funciones y mejoras de interfaz. Su funcionamiento depende de la configuración de TMDB, la conectividad, la validez de las credenciales y la disponibilidad y compatibilidad de los servicios externos.

<div align="center">
  <strong>TatoCine</strong><br>
  <sub>Proyecto independiente de desarrollo web</sub>
</div>
