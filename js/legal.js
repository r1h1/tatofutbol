/* TatoTV · legal.js — descargo de responsabilidad, términos, privacidad y créditos.
   · Documento único (SECTIONS) que alimenta la puerta de aceptación, el centro «Legal» y legal.html.
   · Puerta obligatoria (como TatoCine): hasta pulsar «Aceptar y continuar» el resto de la página queda inerte y no se puede abrir ningún reproductor.
     Se vuelve a pedir cuando cambia VERSION. Límite honesto: es un control del lado del cliente (alguien con DevTools puede manipular su propio navegador).
   · Sitios de terceros: lista visible de todos los dominios que intervienen.
   Basado en los descargos de TatoCine y TatoSound, adaptado a TatoTV. Editable: ajusta REPO, OPERATOR y CONTACT antes de publicar. */
(function (w) {
  "use strict";
  var Lg = (w.Legal = {});
  var VERSION = "2026-11", REPO = "https://github.com/r1h1/tatofutbol", OPERATOR = "Ma. Ing. Daniel Rivas", AUTHOR_URL = "https://github.com/r1h1/";
  var CONTACT = ""; // p. ej. "derechos@tudominio.com" (si queda vacío, las solicitudes de retiro se hacen por «Issues» del repositorio)
  Lg.VERSION = VERSION; Lg.REPO = REPO;

  var INTRO = "PARA UTILIZAR ESTE APLICATIVO DEBE LEER Y ACEPTAR TODO SU CONTENIDO. SI NO ESTÁ DE ACUERDO, NO LO UTILICE. AL PULSAR «ACEPTAR Y CONTINUAR» USTED RECONOCE QUE LO HA LEÍDO Y COMPRENDIDO Y ACEPTA TODO LO ESTABLECIDO POR NUESTRO SERVICIO. NO BUSCAMOS FOMENTAR COMPORTAMIENTOS INDEBIDOS NI EL USO DE ESTE APLICATIVO PARA FINES ILEGALES. SI USTED ES MENOR DE EDAD, DEBE PEDIR PERMISO A SUS PADRES O TUTORES LEGALES. TATOTV NO SE HACE RESPONSABLE Y TIENE UN DESCARGO FUERTE DE RESPONSABILIDAD PORQUE ES UN PROYECTO GRATUITO PARA LA COMUNIDAD. LEA TODO ANTES DE CONTINUAR.";

  /** Dominios reales que intervienen, agrupados por función (se muestran en «Sitios de terceros»). */
  var THIRD = [
    { t: "Calendario, marcadores y escudos", h: ["site.api.espn.com", "a.espncdn.com"] },
    { t: "Agendas y enlaces de transmisión (sitios de terceros)", h: ["pirlotv.la", "futbollibretvplay.org", "api.wqxag.com", "agenda18.com", "pirllotv.hair", "pirlotvonoine.site", "cdn.strm-api.org / golygoals.com (futbolvivo.tv)", "rojadirectatvlive.me", "adstrim.quest", "streameast.cool", "gooz.aapmains.net (reproductor de StreamEast)"] },
    { t: "Reproductores incrustados (operados por terceros)", h: ["tvf90.com", "cdplay.live", "streamxhd.sbs", "sportsoonline.click", "embedsports.me", "y los que cada fuente publique"] },
    { t: "Canales 24/7 (listas públicas IPTV y canales de los sitios de agenda)", h: ["iptv-org.github.io", "raw.githubusercontent.com (Free-TV/IPTV)", "tvf90.com"] },
    { t: "Noticias (titulares RSS)", h: ["marca.com", "mundodeportivo.com", "ole.com.ar", "eluniverso.com", "espn.com", "sportsnet.ca", "cbssports.com"] },
    { t: "Alojamiento y red", h: ["vercel.com (funciones Edge y CDN)"] },
  ];
  Lg.third = THIRD;

  var SECTIONS = [
    { h: "1. Aceptación", p: [
      "Para usar TatoTV debes leer y aceptar este documento. Si no estás de acuerdo, no utilices la aplicación. Al pulsar «Aceptar y continuar» firmas digitalmente este acuerdo entre «TatoTV» («la app») y tú, confirmas que lo leíste y lo entiendes, y aceptas no accionar legalmente contra «TatoTV» ni sus autores ante cualquier inconveniente, pues es un proyecto libre y gratuito.",
      "Si eres menor de edad, necesitas el permiso de tus padres o tutores legales antes de usarla."] },
    { h: "2. Qué es (y qué no es) TatoTV", p: [
      "TatoTV es una agenda deportiva de código abierto, gratuita y sin fines de lucro. Muestra calendarios, marcadores y noticias, y organiza enlaces a servicios de terceros que cualquier persona puede encontrar en internet. No aloja, no origina, no retransmite por cuenta propia, no publica y no es titular de ningún evento, señal, video, imagen, escudo o marca.",
      "No es un servicio de suscripción, no cobra por nada, no muestra publicidad propia, no ofrece descargas y no busca que dejes de pagar los servicios oficiales: cada persona es libre de pagar lo que guste; aquí solo hay una herramienta gratuita de ordenamiento de enlaces públicos.",
      "No está afiliada, patrocinada ni respaldada por ESPN, las ligas, federaciones, clubes, canales, plataformas ni ningún sitio citado. Las marcas, nombres, escudos y logotipos pertenecen a sus respectivos titulares."] },
    { h: "3. Servicios y tecnologías de terceros que intervienen", p: [
      "• Fuentes de agenda y señales: sitios públicos de terceros (ver «Sitios de terceros»). TatoTV lee su información pública para mostrarla en una sola lista; no controla su contenido, disponibilidad, legalidad ni sus cambios.",
      "• Reproductores incrustados: se muestran dentro de un iframe y son operados por terceros. Insertar un iframe no es una verificación ni una garantía de que el contenido esté autorizado.",
      "• Puente técnico (Vercel): para evitar restricciones de navegador, funciones Edge del servidor del operador buscan el enlace de video de una página y, cuando hace falta, lo reenvían (proxy HLS). Los datos pasan en tránsito y se guardan en la caché del CDN por segundos o minutos; no se almacenan de forma permanente, no se registran ni se redistribuyen desde un archivo propio.",
      "• ESPN (API pública no oficial): horarios, marcadores y escudos. Sujeta a cambios y sin garantía de disponibilidad.",
      "• iptv-org y otros proyectos de listas M3U: se descargan directamente en tu navegador; cada canal depende de su proveedor.",
      "• Software de código abierto: hls.js (Apache-2.0) y las demás piezas de THIRD_PARTY_NOTICES.md, con sus licencias.",
      "• Tu navegador, tu sistema operativo y tu proveedor de internet procesan tráfico técnico (por ejemplo, la dirección IP) fuera del control de TatoTV."] },
    { h: "4. Derechos de autor y retiro de contenido", p: [
      "Las transmisiones, imágenes, escudos, marcas y demás obras pertenecen a sus titulares. TatoTV no concede licencia alguna sobre ellas. Que un enlace sea accesible públicamente no significa que el contenido esté autorizado para su reproducción o redistribución: tú eres el único responsable de comprobar que tienes derecho a ver cada contenido en tu país y de cumplir las leyes y los términos de cada servicio.",
      "TatoTV no se hace responsable de material indebido o protegido (copyright o DMCA) mostrado por reproductores o anuncios de terceros: ni los videos, ni los anuncios, ni las imágenes están en nuestro código fuente ni fueron programados para mostrarse; hacemos esta salvedad para evitar reclamos y demandas.",
      "Si eres titular de derechos y crees que algún enlace vulnera tus derechos, solicita su retiro a " + OPERATOR + (CONTACT ? " en " + CONTACT : " abriendo un «Issue» en el repositorio (" + REPO + ")") + ", indicando la obra, el enlace y tu titularidad. Se atenderán las solicitudes razonables y se bloqueará el enlace o la fuente señalada. Para retirar el video en sí, contacta también al operador del reproductor de terceros, que es quien lo aloja."] },
    { h: "5. Datos y privacidad", p: [
      "No hay cuentas ni base de datos de usuarios. En tu dispositivo se guardan, solo para que la app sea rápida y recuerde tus ajustes: deporte elegido, copia temporal de agendas, noticias y canales (localStorage y sessionStorage), el Service Worker y su caché (modo sin conexión) y esta aceptación. Puedes borrarlo todo desde los datos del sitio de tu navegador.",
      "Los servidores del operador (Vercel) procesan tus solicitudes a /api (agenda, noticias, resolución y proxy de video). Vercel y los orígenes consultados pueden ver datos técnicos de la conexión (como la IP del servidor y, en el proxy, la tuya o la del servidor), según sus propias políticas. TatoTV no incluye analítica, publicidad, telemetría, huellas digitales ni rastreadores propios, y no vende datos.",
      "Los reproductores y sitios de terceros sí pueden usar cookies, anuncios y rastreadores propios. Para limitarlos, los iframes se cargan con «sandbox» (sin ventanas emergentes ni redirecciones de la página) y puedes usar un navegador con protección contra rastreo de confianza, como Brave. «Sin analítica integrada» no significa que terceros no procesen datos técnicos de sus propias conexiones."] },
    { h: "6. Anuncios de terceros", p: [
      "Algunos reproductores y sitios muestran anuncios de terceros que no son nuestros ni de los que lucramos. TatoTV no controla, monetiza ni tiene injerencia alguna sobre ellos, y no garantiza la legitimidad del contenido incrustado. Si un anuncio o un sitio externo te pide instalar software, ingresar datos o pagar, ignóralo y ciérralo."] },
    { h: "7. Sin garantías", p: [
      "El servicio se ofrece «tal cual» y «según disponibilidad», sin garantías de continuidad, exactitud de horarios o marcadores, compatibilidad con todos los dispositivos, navegadores o televisores, ausencia de errores o de contenido inapropiado. Los enlaces pueden caducar, cambiar o desaparecer sin aviso.",
      "El operador puede modificar, limitar o suspender el servicio en cualquier momento. TatoTV no promueve ni facilita apuestas; no tomes decisiones económicas basadas en la información mostrada."] },
    { h: "8. Limitación de responsabilidad", p: [
      "En la máxima medida permitida por la ley aplicable, el operador y los autores no responden de daños directos o indirectos, pérdida de datos, interrupciones, problemas de conectividad, rendimiento, almacenamiento, seguridad o compatibilidad, ni del contenido de terceros, de los enlaces externos o de las decisiones que tomes con la información mostrada.",
      "Nada de lo anterior limita derechos que la ley no permita limitar (por ejemplo, los de los consumidores) ni la responsabilidad por dolo. Este documento no sustituye asesoría legal; si dudas de tu situación, consulta a un abogado."] },
    { h: "9. Lista de descargos", p: [
      "TatoTV no se hace responsable de: la pérdida de datos, daños o perjuicios derivados del uso de la app; la disponibilidad continua del servicio ni la exactitud de la información; los enlaces a sitios de terceros ni la calidad o legalidad de su contenido; la privacidad y seguridad de los datos personales compartidos con terceros; errores, fallos o interrupciones; decisiones tomadas con la información mostrada; problemas técnicos, de compatibilidad, conectividad, rendimiento, almacenamiento o actualización; vulnerabilidades, hackeos o inyección de código malicioso (TatoTV se compromete a velar por no dañar al usuario final, pero no garantiza estar libre de ataques); el uso indebido o ilegal de la app por parte de los usuarios; los problemas legales o de derechos de autor al acceder a contenido protegido; las imágenes, videos y señales mostrados, que provienen de fuentes externas fuera de nuestro control; la publicidad o el marketing de terceros; la adicción o los problemas de salud por uso excesivo; el uso que cada persona haga de los datos locales de su dispositivo o si otra persona accede a ellos.",
      "TatoTV no acudirá a demandas ni juicios por el uso de la app, ya que es un proyecto gratuito y de código abierto, y se compromete a dar mantenimiento, soporte y mejoras sin fines de lucro, sin violar leyes ni derechos de autor y sin causar daños a la industria."] },
    { h: "10. Uso indebido", p: [
      "No uses TatoTV para actividades ilegales, para saturar o atacar el servicio o a terceros, para eludir restricciones técnicas, ni como proxy abierto: el puente de video solo está destinado a la propia aplicación. El operador puede bloquear el acceso a quien lo haga."] },
    { h: "11. Licencia del software", p: [
      "El código de TatoTV se distribuye bajo licencia MIT (consulta LICENSE): puedes usarlo, copiarlo y modificarlo respetando sus términos. Las licencias de código abierto no te otorgan derechos sobre contenido, marcas, escudos, señales o listas de terceros."] },
    { h: "12. Cambios y versión", p: [
      "Este documento puede actualizarse. Cuando cambie de versión se te pedirá aceptarlo de nuevo. Versión: " + VERSION + ".",
      "Gracias por confiar en TatoTV y por leer este descargo. Fin. El equipo de TatoTV y su fundador."] },
  ];
  Lg.sections = SECTIONS;

  var DISCLAIMER_PLAYER = "TatoTV no controla, monetiza, muestra anuncios propios ni tiene injerencia alguna sobre el contenido mostrado por los reproductores de terceros. Los sitios integrados son servicios de terceros y sus políticas, contenidos, licencias y disponibilidad dependen de sus operadores. TatoTV no cobra por los anuncios de esos proveedores ni garantiza la legitimidad del contenido incrustado. Recomendamos revisar la privacidad del navegador y usar herramientas de protección de rastreo de confianza, como Brave, si así lo prefieres.";
  Lg.playerNotice = DISCLAIMER_PLAYER;

  /* ── almacenamiento de la aceptación ── */
  Lg.accepted = function () { var a = U.store.get("legal"); return !!(a && a.v === VERSION); };
  function accept() { U.store.set("legal", { v: VERSION, t: Date.now() }); }

  /* ── render del documento (misma fuente para la puerta, el centro Legal y legal.html) ── */
  Lg.docHTML = function (opts) {
    opts = opts || {};
    var h = opts.noIntro ? "" : '<p class="lg-caps">' + U.esc(INTRO) + "</p>", i, j, s;
    for (i = 0; i < SECTIONS.length; i++) {
      s = SECTIONS[i]; h += "<h3>" + U.esc(s.h) + "</h3>";
      for (j = 0; j < s.p.length; j++) h += "<p>" + U.esc(s.p[j]) + "</p>";
    }
    return h;
  };
  Lg.thirdHTML = function () {
    var h = "", i, j, g;
    for (i = 0; i < THIRD.length; i++) { g = THIRD[i]; h += '<div class="lg-group"><strong>' + U.esc(g.t) + "</strong><ul>"; for (j = 0; j < g.h.length; j++) h += "<li>" + U.esc(g.h[j]) + "</li>"; h += "</ul></div>"; }
    return h + "<p>Los reproductores y servicios externos son operados por terceros. TatoTV no controla sus servidores, disponibilidad, anuncios, privacidad, licencias ni el contenido que puedan mostrar. Antes de usar un servicio externo, revisa sus términos y la legislación aplicable. TatoTV no reclama derechos sobre contenido de terceros. Datos deportivos de ESPN (integración no oficial); este producto no está avalado ni certificado por ESPN.</p>";
  };

  /* ── puerta obligatoria ── */
  var gateOn = false, obs = null, timer = null;
  function el(id) { return document.getElementById(id); }
  function inert(on) {
    var kids = document.body.children, i, k, g = el("gate");
    for (i = 0; i < kids.length; i++) {
      k = kids[i];
      if (k === g || /^(SCRIPT|LINK|STYLE|NOSCRIPT)$/.test(k.tagName) || k.id === "toast") continue;
      if (on) { k.setAttribute("inert", ""); k.setAttribute("aria-hidden", "true"); k.setAttribute("data-gate", "1"); }
      else if (k.getAttribute("data-gate")) { k.removeAttribute("inert"); k.removeAttribute("aria-hidden"); k.removeAttribute("data-gate"); }
    }
  }
  function ensure() {
    if (!gateOn || Lg.accepted()) return;
    var g = el("gate"); if (!g) return;
    if (g.hidden) { g.hidden = false; var b = el("gate-body"); if (b) b.scrollTop = 0; }
    if (document.querySelectorAll("body > [data-gate]").length < 3) inert(true);
    var ok = el("gate-ok"); if (ok && !g.contains(document.activeElement)) ok.focus();
  }
  function release() {
    gateOn = false; clearInterval(timer); if (obs && obs.disconnect) obs.disconnect();
    inert(false); var g = el("gate"); if (g) g.hidden = true;
    document.body.style.overflow = "";
  }
  /** Muestra la puerta si hace falta. Se llama cuando el splash termina. */
  Lg.gate = function () {
    if (Lg.accepted() || gateOn) return;
    var g = el("gate"); if (!g) return;
    el("gate-body").innerHTML = Lg.docHTML();
    gateOn = true; document.body.style.overflow = "hidden"; ensure();
    el("gate-ok").onclick = function () { accept(); release(); if (Lg.afterAccept) Lg.afterAccept(); };
    el("gate-no").onclick = function () { try { w.close(); } catch (e) { /* nada */ } setTimeout(function () { location.replace(REPO); }, 250); };
    g.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); } });
    timer = setInterval(ensure, 800);
    if (w.MutationObserver) { obs = new MutationObserver(ensure); obs.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["hidden", "inert", "style"] }); }
  };

  /* ── centro «Legal» ── */
  function row(label, sub, control) { return '<div class="lg-row"><div><div class="lg-l">' + U.esc(label) + '</div><div class="lg-s">' + sub + "</div></div>" + control + "</div>"; }
  function hubHTML() {
    return row("Legal y no responsabilidad", "Aviso legal, descargo de responsabilidad y condiciones de uso.", '<button type="button" class="lg-btn" data-lg="doc">Leer</button>') +
      row("Privacidad", "Qué se guarda en tu dispositivo y qué procesan los servidores.", '<button type="button" class="lg-btn" data-lg="priv">Leer</button>') +
      row("Código fuente", "Proyecto de código abierto (MIT), gratuito y sin fines de lucro. Su autor no obtiene ingresos.", '<a class="lg-btn" href="' + REPO + '" target="_blank" rel="noopener noreferrer">Abrir</a>') +
      row("Créditos", U.esc(OPERATOR + ", creador de la idea, del código fuente y del mantenimiento gratuito de los servidores; no del material audiovisual ni escrito que aquí aparece."), '<a class="lg-btn" href="' + AUTHOR_URL + '" target="_blank" rel="noopener noreferrer">github.com/r1h1</a>') +
      row("Sitios de terceros", "Fuentes, reproductores y servicios que usa TatoTV.", '<button type="button" class="lg-btn" data-lg="third">Ver</button>') +
      row("Retiro de contenido", "¿Eres titular de derechos? Cómo solicitar el retiro de un enlace.", '<button type="button" class="lg-btn" data-lg="dmca">Ver</button>');
  }
  var privIdx = 4, dmcaIdx = 2;
  function show(view) {
    var b = el("l-body"), t = el("l-title"), back = el("l-back");
    if (!view) { t.textContent = "Legal"; b.innerHTML = hubHTML(); back.hidden = true; return; }
    back.hidden = false;
    if (view === "doc") { t.textContent = "Legal y no responsabilidad"; b.innerHTML = '<div class="lg-doc">' + Lg.docHTML() + "</div>"; }
    else if (view === "priv") { t.textContent = "Privacidad"; b.innerHTML = '<div class="lg-doc"><h3>' + U.esc(SECTIONS[privIdx].h) + "</h3><p>" + U.esc(SECTIONS[privIdx].p.join("\n\n")).replace(/\n\n/g, "</p><p>") + "</p><h3>" + U.esc(SECTIONS[privIdx + 1].h) + "</h3><p>" + U.esc(SECTIONS[privIdx + 1].p[0]) + "</p></div>"; }
    else if (view === "dmca") { t.textContent = "Retiro de contenido"; b.innerHTML = '<div class="lg-doc"><h3>' + U.esc(SECTIONS[dmcaIdx].h) + "</h3><p>" + U.esc(SECTIONS[dmcaIdx].p.join("\n\n")).replace(/\n\n/g, "</p><p>") + "</p></div>"; }
    else if (view === "third") { t.textContent = "Sitios de terceros"; b.innerHTML = '<div class="lg-doc">' + Lg.thirdHTML() + "</div>"; }
    b.scrollTop = 0;
  }
  Lg.open = function () { show(null); el("legal").hidden = false; var c = el("l-close"); if (c) c.focus(); };
  Lg.close = function () { el("legal").hidden = true; };

  /** Pie legal al final de la lista (siempre visible al terminar de hacer scroll) y aviso bajo el reproductor. */
  Lg.mount = function () {
    var main = el("main");
    if (main && !main.querySelector(".tc-footer")) main.insertAdjacentHTML("beforeend", '<footer class="tc-footer"><button type="button" class="btn-w sm" data-lg-open="1">Aviso legal y descargo de responsabilidad</button><span>TatoTV no aloja ni transmite contenido: organiza enlaces públicos de terceros. Proyecto gratuito y de código abierto.</span></footer>');
    var body = document.querySelector("#player .p-body");   // el aviso va AL FINAL del reproductor (después de las señales)
    if (body && !document.querySelector(".player-notice")) body.insertAdjacentHTML("afterend", '<aside class="player-notice" role="note">' + U.esc(DISCLAIMER_PLAYER) + "</aside>");
    document.addEventListener("click", function (e) {
      var t = e.target; if (!t.closest) return;
      if (t.closest("[data-lg-open]")) { Lg.open(); return; }
      var b = t.closest("[data-lg]"); if (b) show(b.getAttribute("data-lg"));
    });
    el("l-close").onclick = Lg.close; el("l-back").onclick = function () { show(null); };
    el("legal").addEventListener("click", function (e) { if (e.target === el("legal")) Lg.close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !el("legal").hidden) Lg.close(); });
  };
})(window);
