# Bitácora del loop: entradas anteriores

Las entradas de la bitácora de `IMPROVEMENTS.md` que ya no van allí, en orden: `node tools/loop.mjs --rotar`
deja en ese archivo las más recientes y trae aquí el resto. Es historia: no se edita, y una entrada nueva va
siempre al final de `IMPROVEMENTS.md`. `--siguiente`, `--check`, `--reclamar` y `--salud` leen las dos
bitácoras juntas (la rotación de los subtipos de mantenimiento, la numeración y las marcas del protocolo).

## Bitácora

### 2026-10-07 · Iteración 1

- **Red de pruebas.** `tools/smoke.mjs` abre la demo en Chromium sin ventana (WebGL por software) y
  recorre 3D, 2D, modo vuelo, Replay, ajustes, logros, cambio a árabe en vivo y la pantalla de celular;
  falla ante cualquier excepción o error de consola, si la demo consulta `api.github.com` o si la página
  desborda. Con `--langs`, los 40 idiomas. Se comprobó que detecta un error inyectado a propósito.
- **Pruebas de la fuente de GitHub.** `tools/github.test.mjs` (`node --test`) carga `github.js` en un
  contexto aislado con una API de GitHub simulada (ETag, 304, fallos de red a pedido).
- **Arreglo: un ciclo cortado ya no pierde actividad.** Los eventos se daban por vistos y el ETag del
  feed se guardaba antes de que el ciclo terminara; si algo fallaba después (red, cuota), el reintento
  recibía 304 o los saltaba como vistos. Pasaba en la carga inicial (el panel arrancaba vacío) y en el
  modo events (los pushes de ese ciclo nunca avisaban). Ahora los eventos se marcan vistos solo al
  terminar bien el ciclo, el feed se vuelve a pedir entero tras un fallo y `seenEvents` tiene tope.
  Validado: las dos pruebas nuevas fallaban antes del arreglo y pasan después; smoke e i18n en verde.
- **Siguiente:** pendiente 1 (`aria-live` del estado), luego 2 y 3.

### 2026-10-07 · Iteración 2

- **Sincronización.** Master trajo #13 (director de cámara y modo TV); se fusionó en la rama sin
  conflictos y las pruebas, el smoke y el chequeo de idiomas siguieron en verde.
- **Arreglo: el estado ya no se le anuncia al lector de pantalla cada segundo.** `aria-live` envolvía
  todo `#status`, incluida la línea "actualizado hace 5 s · próximo en 7 s" que se reescribe cada
  segundo; además el texto del estado se reescribía cada segundo aunque no cambiara. Ahora la región
  viva es solo `#status-text` y se escribe solo cuando cambia (al pasar a "Error", "Pausado"…).
- **Prueba nueva en el smoke:** observa la región viva del estado 3,5 s y falla si cambia más de una
  vez. Antes del arreglo marcaba 10 cambios; después, ninguno.
- **Siguiente:** pendiente 1 (filtro o fijada que se pierden durante un ciclo), luego 2 (datos del repo
  anterior al cambiar de repo).

### 2026-10-07 · Iteración 3

- **Arreglo: un filtro o una rama fijada que cambian a mitad de un ciclo ya no se pierden.** El ciclo
  en curso apagaba `reseed` al terminar aunque el cambio hubiera llegado durante él; el siguiente
  recibía 304 por la lista de ramas y no volvía a elegirlas, así que el filtro no se aplicaba hasta que
  alguna rama cambiara (modos lista y eventos; con la carga inicial, que hace más de diez consultas,
  pasaba seguido). Ahora `reseed` cuenta pedidos y cada ciclo da por atendido solo el que vio al
  empezar: un cambio a mitad de camino o un ciclo que falla dejan el pedido pendiente, y el siguiente
  ciclo corre enseguida.
- **Pruebas:** dos nuevas en `tools/github.test.mjs` (filtro y fijadas cambiados mientras el ciclo
  espera la lista de ramas). Fallaban antes del arreglo y pasan después; smoke e i18n en verde.
- **Siguiente:** pendiente 1 (datos del repo anterior al cambiar de repo), luego 2 (reloj adelantado).

### 2026-10-07 · Fusión de #15 antes de abrir el PR

- Master trajo #15 (todas las ramas, sin tope; carga por lotes). Hubo conflicto en
  `js/sources/github.js` con los arreglos de las iteraciones 1 y 3: se combinaron los dos lados y el
  nuevo `if (this.reseed) this.prune()` pasó a usar el contador de pedidos.
- Con #15 el modo lista recorre la lista completa de ramas en cada ciclo, así que allí el filtro
  cambiado a mitad de ciclo ya se aplicaba; en el modo events, no. Las pruebas de filtro y fijadas se
  rehicieron para la lógica nueva (ya no hay tope de ramas) y ahora cubren los dos modos: las de modo
  events fallan con el `github.js` de master y pasan con el arreglo; las de modo lista quedan como
  regresión.
- Validado: 7 pruebas, smoke (incluidos los 40 idiomas en celular) e i18n en verde.

### 2026-10-07 · Iteración 4

- **Sincronización.** El PR #16 sigue abierto. Master trajo #14 (mundo abierto en la vista 3D); se
  fusionó sin conflictos y todo siguió en verde.
- **Arreglo: cambiar de repo ya no deja datos del anterior.** `connect()` no limpiaba `lastRender` ni
  las cifras: al pasar a un repo que da 404 (o mientras el nuevo cargaba) se veían las ramas, commits y
  PRs del anterior, y el botón de Replay, o el Replay de ambiente del modo TV, reproducían el grafo del
  repo anterior. Ahora `connect()` olvida el último dibujo y deja las cifras en "–" hasta que el repo
  nuevo traiga las suyas.
- **Prueba nueva en el smoke:** tras la demo conecta a `nadie/no-existe` con la API respondiendo 404 y
  comprueba que las cifras quedan en "–" y que el Replay no arranca. Antes del arreglo mostraba las de la
  demo (5, 18, 3).
- **Siguiente:** pendiente 1 (auditar y probar lo que llegó con #13 y #14), luego 2 (reloj adelantado).

### 2026-10-07 · Iteración 5

- **Sincronización.** El PR #16 sigue abierto. Master trajo #17–#22 (modo galaxias, aristas finas y
  #19, que rehízo el loop de sondeo). Hubo conflictos con #19 en `github.js` y `app.js`: se tomó la
  estructura nueva y se reaplicaron los arreglos de esta rama (ETag del feed borrado al cortarse un
  ciclo, también por `stop()`; pedido de filtro o fijadas pendiente adelanta el ciclo; texto de la
  región viva del estado escrito solo si cambia). Los eventos vistos se recortan con el
  `forgetOldEvents()` de master, una vez y tras confirmarlos.
- **Arnés de pruebas** adaptado a #19 (`navigator`, `AbortController`, escuchas, respuestas con
  `text()`). Las 4 pruebas de los arreglos siguen fallando con el `github.js` de master y pasan con la
  rama.
- **#19 resolvió dos pendientes:** el sondeo cada 3 s con el reloj adelantado (`nextDelay` ya no baja
  de la base si el reinicio ya pasó) y `stop()` sin cortar la consulta en curso (ahora usa
  `AbortController`). Se quitaron de la lista.
- **Mejora: el smoke test cubre lo que llegó sin pruebas.** Nuevos pasos en 3D: modo galaxias, director
  de cámara y modo TV (entrar, unos segundos de director, salir y que la URL pierda `?tv`), y una carga
  directa con `?tv=1` a 1920×1080. Se comprobó que detectan un error inyectado en `setGalaxy` y en
  `setTV`. Todo en verde, también los 40 idiomas.
- **Siguiente:** pendiente 1 (auditar director, modo TV, mundo abierto y galaxias), luego 2 (efectos 3D
  acumulados mientras la vista no dibuja).

### 2026-10-08 · Iteración 6

- **Sincronización.** El PR #16 se fusionó; la rama se reinició desde master y luego avanzó hasta #28
  (vista 2D con efectos y minimapa, línea de tiempo 3D, pruebas e2e locales). Con `npm ci` se instaló
  Electron y las 11 pruebas e2e (sin la lenta) pasaron antes y después del cambio.
- **Auditoría** del código que había llegado sin revisar (director, modo TV, mundo abierto, galaxias y
  las vistas de #26 y #27): sin problemas de seguridad ni escuchas duplicadas; 7 hallazgos, 5 de ellos
  reproducidos en Chromium. Quedan como pendientes 1–6.
- **Arreglo: el director de cámara ya no le quita la nave al piloto.** Encenderlo en pleno vuelo lo
  dejaba al mando: sus cortes teletransportaban la nave y su deriva la movía cada cuadro. Entrar al modo
  TV volando dejaba la pantalla congelada en primera persona con la interfaz del vuelo. Además, en modo
  TV echaba del vuelo a quien pilotaba activamente, porque volar no contaba como interacción. Ahora el
  director se enciende a la espera si hay vuelo, el modo TV sale del vuelo al entrar y pilotar cuenta
  como usar la cámara.
- **Pruebas nuevas en el smoke:** encender el director volando (el botón debe quedar "a la espera") y
  entrar al modo TV volando (el vuelo debe terminar). Las dos fallaban antes del arreglo.
- **Herramientas:** el smoke acepta `PLAYWRIGHT_CHROMIUM_PATH`, como las e2e: con `node_modules`
  instalado toma el Playwright del proyecto, que busca otro Chromium.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (`readTheme` en cada movimiento del ratón en modo TV), luego 2 (campo de
  visión tras cortar un salto).

### 2026-10-08 · Iteración 7

- **Arreglo: en modo TV, mover el ratón ya no vuelve a leer el tema ni redibuja el grafo.** `wake()`
  quitaba la clase `tv-idle` de `<html>` en cada movimiento, aunque no estuviera, y los observadores de
  las vistas 3D y 2D releían todos los colores ante cualquier escritura de clase: cada movimiento
  marcaba los materiales 3D para subirlos de nuevo y reescribía cada nodo y arista del grafo 2D oculto.
  Ahora hay un solo observador del tema, `U.onThemeChange` (`util.js`), que usan las dos vistas: avisa
  solo si cambia `data-theme`, el tema del sistema o una clase de `<html>` que pueda cambiar colores
  (no `tv-idle`, que solo esconde el puntero y la barra). `wake()` toca la clase solo si está.
- **Prueba nueva en el smoke:** en modo TV cuenta las lecturas del tema durante 30 movimientos del
  ratón (antes 90, ahora 0) y comprueba que cambiar `data-theme` sí lo relee.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (campo de visión tras cortar un salto hiperespacial), luego 2 (rótulo de
  llegada a una galaxia para lectores de pantalla).

### 2026-10-08 · Iteración 8

- **Arreglo: cortar un salto hiperespacial ya no deja mal el campo de visión.** El túnel del salto abre
  el campo de visión hasta 70°, y solo el aterrizaje lo devolvía. Si se cortaba a mitad (pasar a 2D,
  apagar las galaxias, cambiar de repo), la cámara se quedaba así hasta salir del modo vuelo. Ahora lo
  restaura `endHyper()`, por donde pasan el aterrizaje y todos los cortes; y al desactivar la vista 3D
  el salto se corta antes de salir del vuelo, para que quede el campo de visión de la órbita.
- **Prueba nueva en el smoke** (página propia, toma la instancia 3D desde la prueba): salta a otra
  galaxia, pasa a 2D en pleno túnel, vuelve a 3D y compara el campo de visión. Antes del arreglo
  quedaba en 68,9° (era 46°); después, igual al de antes del salto.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (rótulo de llegada a una galaxia para lectores de pantalla), luego 2
  (foco al entrar y salir del modo TV).

### 2026-10-08 · Iteración 9

- **Arreglo: al llegar a una galaxia, el lector de pantalla ya no lee el nombre "descifrándose".** El
  rótulo de llegada era una región `role=status` (atómica) y su nombre se reescribía cada cuadro durante
  800 ms con glifos al azar: un lector podía anunciar "Entrando en m>\\▒" una y otra vez, en cada galaxia
  que recorre el director en modo TV. Ahora el rótulo visual es `aria-hidden` y un texto aparte, solo
  para lectores (`gx-arrive-say`, `role=status`), dice el rótulo entero ("Entrando en main. 5 commits ·
  hace 2 d") y se escribe solo cuando cambia.
- **Prueba nueva en el smoke:** en modo galaxias entra a otra galaxia y registra lo que puede leer un
  lector del rótulo durante 4 s: que no haya glifos del efecto, que cambie como mucho 3 veces y que
  incluya el nombre. Antes del arreglo leía versiones a medio descifrar.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (foco al entrar y salir del modo TV), luego 2 (zumbido del espacio en modo
  TV y con la pestaña oculta).

### 2026-10-08 · Iteración 10

- **Arreglo: el modo TV ya no pierde el foco del teclado, y `Esc` sale.** El botón TV está en la barra
  que el modo esconde y el de salir en la barra del modo, que se esconde al volver: al entrar o salir
  con el teclado el foco caía al `<body>`, y no había tecla para salir. Ahora, al entrar, el foco pasa
  al grafo (donde están los atajos: espacio, `F`, `Esc`); al salir con el botón de la barra, vuelve al
  botón TV; y `Esc` sale del modo. Si `Esc` cerró antes una ficha del grafo o aterrizó el vuelo, no
  hace nada más (esos manejadores ahora lo marcan con `preventDefault`). README: `Esc` en los controles
  del modo TV.
- **Prueba nueva en el smoke:** entra al modo TV con Enter sobre el botón (el foco debe quedar en el
  grafo), sale con `Esc`, y vuelve a entrar y sale con el botón de la barra (el foco debe volver al
  botón TV). Antes del arreglo el foco quedaba en `BODY`.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (zumbido del espacio en modo TV y con la pestaña oculta), luego 2
  (consulta de archivos del repo anterior en las galaxias del nuevo).

### 2026-10-08 · Iteración 11

- **Arreglo: los zumbidos se callan con la pestaña oculta y al entrar al modo TV.** El zumbido del
  espacio (galaxias) y el motor del vuelo solo bajan de volumen desde el cuadro a cuadro, que se detiene
  con la pestaña en segundo plano: quedaban sonando indefinidamente. Ahora, al ocultarse la pestaña, los
  dos se callan, y al volver se vuelven a pedir; los avisos de actividad siguen sonando en segundo
  plano. Además, el modo TV apaga el sonido pero no avisaba a las galaxias (sus botones de sonido sí):
  ahora llama a `pokeAmbience()`, así el zumbido sigue al sonido al instante y no recién cuando la
  cámara cambia de galaxia.
- **Prueba nueva en el smoke** (página propia, registra el volumen pedido al zumbido): con sonido y
  galaxias, ocultar la pestaña lo calla y volver lo recupera; entrar al modo TV lo calla y salir lo
  recupera. La parte de la pestaña oculta fallaba antes del arreglo. La del modo TV no alcanza a
  distinguirlo en la demo, porque el director mueve la cámara enseguida y eso ya vuelve a pedir el
  zumbido; queda como guarda.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (consulta de archivos del repo anterior en las galaxias del nuevo), luego 2
  (efectos 3D acumulados mientras la vista no dibuja).

### 2026-10-09 · Iteración 12

- **Arreglo: cambiar de repo mientras cargan los archivos de una galaxia ya no los deja en el nuevo.**
  La consulta pendiente guardaba sus archivos en `lastData` aunque `reset()` ya hubiera limpiado todo al
  cambiar de repo; y `lastData` es lo que se muestra mientras llegan los archivos nuevos. La rama del
  mismo nombre en el repo nuevo (típicamente `main`) mostraba los planetas y enlaces del anterior hasta
  que llegaran los suyos, o para siempre si su consulta fallaba (por ejemplo, un 403 sin token). Ahora
  `reset()` sube un contador de generación y las respuestas de una generación anterior no se guardan
  ni se muestran.
- **Prueba nueva en el smoke** (página de galaxias): retiene la respuesta de archivos de la demo, llama a
  `reset()` como hace `connect()` al cambiar de repo, la suelta y comprueba que no quede nada. Antes del
  arreglo quedaban los archivos de `main`.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (efectos 3D acumulados mientras la vista no dibuja), luego 2 (osciladores de
  los zumbidos que nunca se detienen).

### 2026-10-09 · Iteración 13

- **Arreglo: lo que llega mientras la vista 3D no se ve ya no se acumula para cuando vuelve.** En 2D o
  con la pestaña oculta, `update()` seguía preparando efectos de llegada (ondas y chispas en la cola
  `pending`, commits por desvanecer en `dying`). Esas colas solo se vacían cuadro a cuadro, que no corre
  en esos casos: al volver a la 3D salían todas juntas, cada una con su malla y su material. Ahora
  `update()` no prepara efectos si la vista no está activa o la pestaña está oculta (los commits
  aparecen ya en su lugar), y `stepFx` descarta los efectos programados que se atrasaron más de un
  segundo.
- **Prueba nueva en el smoke** (página propia, toma la instancia 3D): con la vista en 2D espera a que la
  demo traiga commits y comprueba que la 3D no dejó nada en cola. Antes del arreglo quedaba un efecto
  por cada tanda.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (osciladores de los zumbidos que nunca se detienen), luego 2 (contraste del
  texto secundario en el tema claro).

### 2026-10-09 · Iteración 14

- **Arreglo: los zumbidos apagados dejan de generar audio.** El motor del vuelo y el zumbido del
  espacio creaban sus osciladores la primera vez y después solo bajaban el volumen a 0: tras el primer
  vuelo o la primera visita a las galaxias quedaban 2 y 5 osciladores sonando en silencio para siempre,
  y el contexto de audio seguía trabajando. Ahora, cuando un zumbido queda en 0, al terminar de
  desvanecerse (1,5 s el motor, 4 s el espacio) se detienen sus osciladores y se suelta; si vuelve a
  sonar antes, sigue; si suena después, se crea de nuevo (`letGo`/`keep` en `sound.js`).
- **Pruebas nuevas en el smoke** (cuentan osciladores iniciados y detenidos): apagar las galaxias deja
  0 osciladores vivos a los 5 s, y aterrizar tras acelerar deja los del motor en 0. Sin el arreglo
  quedaban 5 y 2.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (contraste del texto secundario en el tema claro), luego 2 (avisos que no
  se pueden retener con el teclado).

### 2026-10-09 · Iteración 15

- **Arreglo: el texto secundario del tema claro ya se lee bien.** `--ink-3: #78837f` daba 3,45–3,82:1
  sobre los fondos del tema claro (WCAG AA pide 4,5:1 para texto normal), y es el color de etiquetas y
  cifras secundarias, la actividad (tipo, autor, hora), los chips, la ayuda y las teclas: 108 textos
  visibles en la demo quedaban por debajo. Ahora es `#636e6a` (4,65–5,14:1). El tema oscuro ya cumplía.
  Los valores de respaldo repetidos en `graph.js`, `graph3d.js` y `world.js` siguen al nuevo.
- **Prueba nueva en el smoke:** recorre todo el texto visible de la página, en tema claro y oscuro, y
  calcula su contraste contra el fondo efectivo (mezclando fondos semitransparentes): 4,5:1, o 3:1 si
  es grande. Quedan fuera los grafos (colores de cada rama sobre el lienzo) y lo escondido. Sin el
  arreglo marcaba los 108 textos; con él, ninguno en los dos temas.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (avisos que no se pueden retener con el teclado), luego 2 (sin GraphQL, una
  consulta por cada PR que sale de la página).

### 2026-10-09 · Iteración 16

- **Arreglo: los avisos se retienen también con el teclado y se anuncian una sola vez.** La pausa del
  aviso solo respondía al puntero: con el foco adentro se cerraba igual a los 6 s y el foco caía al
  `<body>`. Además cada aviso era `role=status`/`alert` dentro del contenedor `aria-live`: regiones
  vivas anidadas, que algunos lectores anuncian dos veces. Ahora el aviso espera con el puntero encima
  o con el foco adentro (un solo estado para los dos); si se cierra con el teclado, el foco pasa al
  aviso siguiente; cuando hay más de tres, se va el más viejo que no se esté leyendo; y la única región
  viva es el contenedor.
- **Prueba nueva en el smoke:** con un aviso en pantalla comprueba que no haya regiones vivas anidadas y
  que, con el foco adentro, siga ahí pasados 7 s. Las dos partes fallaban por separado sin el arreglo.
- Validado: 7 pruebas, smoke (40 idiomas), i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (sin GraphQL, una consulta por cada PR que sale de la página), luego 2 (un
  error 5xx suelto apaga funciones para toda la sesión).

### 2026-10-09 · Iteración 17

- **Arreglo: sin token, los PRs que solo salen de la página de abiertos ya no cuestan una consulta
  cada uno.** Se siguen los 50 PRs abiertos actualizados más recientemente; cuando otros se actualizan,
  algunos salen de esa página aunque sigan abiertos, y para saber si se cerraron se pedía cada uno
  (hasta 20 por ciclo, con una cuota de 60 por hora sin token). Ahora es una sola consulta a la página
  de PRs actualizados hace poco, abiertos o no (`pulls-all`, la misma que ya usaba el feed): uno que se
  fusionó o cerró acaba de actualizarse y está ahí; el que no está sigue abierto. Solo para los
  fusionados se pide el PR, porque la lista no dice quién lo fusionó.
- **Prueba nueva** en `tools/github.test.mjs` (la API simulada ahora sirve PRs como GitHub, sin
  `merged_by` en las listas): con 60 PRs abiertos, tres viejos se actualizan y desplazan a otros tres,
  uno se fusiona y otro se cierra. Se avisan la fusión (con quien fusionó) y el cierre, y solo se pide
  el PR fusionado. Antes del arreglo se pedían los cuatro que salieron de la página.
- Validado: 8 pruebas, smoke, i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (un error 5xx suelto apaga funciones para toda la sesión), luego 2 (el foco
  al pulsar **Fijar** en el detalle).

### 2026-10-10 · Iteración 18

- **Arreglo: un error pasajero del servidor ya no apaga funciones para toda la sesión.** Cualquier error
  que no fuera de red ni de cuota (un 502 suelto, por ejemplo) apagaba la API de actividad hasta
  recargar, y en la carga inicial cualquier error HTTP de GraphQL pasaba a REST para siempre: con token,
  la sesión entera quedaba con el modo más pobre por un tropiezo de GitHub. Ahora solo se degrada con
  errores que dicen que la función no está disponible (400, 403, 404, 410, 422 o un error propio de
  GraphQL); los demás cortan el ciclo o se saltan y se reintentan en el siguiente.
- **Pruebas nuevas** en `tools/github.test.mjs` (la API simulada responde a pedido): un 502 de la API de
  actividad no la apaga y un 403 sí; un 502 de GraphQL en la carga inicial falla el ciclo y sigue en
  GraphQL, y un error propio de GraphQL sí pasa a REST. Las dos fallaban antes del arreglo.
- Validado: 10 pruebas, smoke, i18n y 11 e2e en verde.
- **Siguiente:** pendiente 1 (el detalle pierde el foco al pulsar **Fijar**), luego 2 (con movimiento
  reducido, la ayuda del vuelo no se ve).

### 2026-10-10 · Iteración 19

- **Sincronización.** Master trajo #42 (varios repos a la vez, cada uno en su pestaña); la rama se
  adelantó a master y todo siguió en verde (11 pruebas, smoke, i18n y 12 e2e).
- **Arreglo: el botón Fijar de la ficha conserva el foco.** Al fijar o soltar una rama, el botón se
  reemplazaba con `outerHTML`: quien lo pulsaba con el teclado perdía el foco, que caía al `<body>`.
  Ahora se actualiza en su lugar (`aria-pressed` y el texto). Sirve para las dos vistas, que comparten
  el helper (`wirePinButton`). El pendiente queda en la otra mitad: que la ficha reciba el foco al
  abrirse con el teclado.
- **Prueba nueva en el smoke** (con el GitHub simulado de #42, porque en la demo no se puede fijar): en
  2D abre la ficha de una rama con Enter sobre su etiqueta, pulsa Fijar con Enter y comprueba que el
  foco sigue en el botón y que cambió de estado. Antes del arreglo quedaba en `BODY`.
- Validado: 11 pruebas, smoke (40 idiomas), i18n y 12 e2e en verde.
- **Siguiente:** pendiente 1 (foco a la ficha al abrirse con el teclado), luego 2 (con movimiento
  reducido, la ayuda del vuelo no se ve).

### 2026-10-10 · Cambio de objetivo: ampliar el alcance

- **Pedido de Benjamin:** que el loop amplíe lo más posible el alcance del proyecto. Las iteraciones
  pasan a ser de **expansión** (una capacidad nueva por PR) salvo una de cada cuatro, de
  mantenimiento. Las reglas están en [Directiva vigente](#directiva-vigente-ampliar-el-alcance); el
  punto de partida, en el [Mapa de alcance](#mapa-de-alcance) y la [Hoja de ruta](#hoja-de-ruta), que
  sale de recorrer lo que hay hoy (una sola fuente de datos, solo web y escritorio, hasta 10 repos, sin
  salidas fuera de la app) y de los huecos frente a herramientas parecidas.
- Los pendientes de mantenimiento quedan como estaban, con su orden.
- **Siguiente:** iteración 20, expansión: ítem 1 de la hoja de ruta (instalable y sin conexión). La
  21 y la 22 también son de expansión; la 23, de mantenimiento (pendiente 1).

### 2026-10-10 · Iteración 20 · Expansión · Plataformas

- **Capacidad nueva: la web se instala y abre sin red** (ítem 1 de la hoja de ruta). En el celular o
  el escritorio se instala como una app más, sin Electron, y después de la primera visita abre aunque
  no haya red: la demo entera, y los repos de GitHub con el aviso de que esperan la conexión (siguen
  solos cuando vuelve, como ya hacían).
  - `manifest.webmanifest`: nombre, colores e íconos de `icons/` (192 y 512, uno adaptable para
    Android y el de iOS), sacados de `electron/icon.png`. `index.html` suma `theme-color` para el tema
    claro y el oscuro.
  - `sw.js`: al instalarse guarda la página, el manifiesto, los íconos y todo `css/`, `js/` y
    `vendor/` (93 archivos, ~950 KB comprimidos, la mayoría ya en la caché HTTP). Con red pide primero
    a la red y pone al día la copia, así que quien está conectado siempre ve la última versión y
    publicar no exige subir un número de versión; sin red sirve la copia. La query string no cuenta
    (`?repo=` abre igual). Usa *navigation preload* para que el arranque del worker no demore la
    página. Nunca toca `api.github.com`, los avatares ni otro sitio: esas peticiones no pasan por él.
  - `js/pwa.js` lo registra después de cargar la página y solo por `http(s)` (en la práctica, https o
    localhost): ni `file://` ni `app://` de la app de escritorio.
  - CSP: `manifest-src 'self'`, `worker-src 'self'` e `img-src 'self'`. Lo último no estaba previsto:
    Chromium carga los íconos del manifiesto como imágenes de la página y, sin `'self'`, el CSP los
    bloqueaba y la página dejaba de ser instalable (`no-acceptable-icon`).
- **Pruebas que fallan sin la capacidad:**
  - `tools/pwa.test.mjs` (8 pruebas, `node --test`): `sw.js` en un contexto aislado con caché y red
    falsas. `FILES` coincide con los archivos de `icons/`, `css/`, `js/` y `vendor/` (si alguien suma
    un archivo y no lo agrega, falla); la instalación guarda todo revalidando; nunca responde por la
    API, los avatares, otro sitio, un POST ni el propio worker; con red pone al día la copia y sin red
    la sirve; un 404 no pisa la copia buena; al activarse borra lo que ya no está. Además, el
    manifiesto (tamaños reales de los PNG) y las directivas del CSP. Comprobado que fallan quitando el
    filtro de origen o un archivo de la lista.
  - e2e web: con un servidor propio carga la página, espera a que el worker la controle, pregunta a
    Chromium si es instalable (`Page.getInstallabilityErrors`: ningún error, salvo el de incógnito
    propio de las pruebas), apaga el servidor, pasa a sin conexión, recarga y ve la demo con sus
    librerías y fuentes, abre `?repo=` y ve el aviso de sin conexión, y comprueba que en la caché no
    hay nada de otro sitio. Sin `js/pwa.js`, falla.
  - `e2e/serve.mjs` exporta `serve(port)` para esa prueba y sirve `.webmanifest` y `.txt` con su tipo.
- README: la función en la lista, cómo se instala, la lista `FILES` al publicar, la estructura,
  Límites conocidos (solo https o localhost, la primera visita necesita red, sin red solo la demo) y
  Seguridad (qué guarda el worker y qué no, y las directivas nuevas del CSP).
- Validado: 19 pruebas (`node --test`), smoke, i18n (sin textos nuevos) y 13 e2e en verde.
- **Siguiente:** iteración 21, expansión: ítem 2 (exportar imagen y video, eje Salidas). La 22 también
  es de expansión; la 23, de mantenimiento (pendiente 1).

### 2026-10-10 · Iteración 21 · Expansión · Salidas

- **Capacidad nueva: guardar la vista como imagen** (primera entrega del ítem 2 de la hoja de ruta; la
  segunda, grabar el Replay en video, queda como ítem 3). Un botón con una cámara de fotos en la barra
  del grafo descarga un PNG de la vista tal como se ve, en 3D o en 2D y en cualquier modo (galaxias,
  vuelo, tema claro u oscuro), con una franja abajo con el repo, la fecha y el nombre de la app. Un
  aviso dice el nombre del archivo, también al lector de pantalla.
  - `js/snapshot.js` arma la imagen en un canvas. En 3D, `Graph3D.renderNow()` dibuja la escena y se
    copia en la misma tarea (WebGL no conserva el cuadro). En 2D, el SVG se clona con sus estilos ya
    resueltos y se pasa a imagen por tandas de grupos, en el orden en que se pintan, a 2× de
    resolución. Los textos (del SVG y de las etiquetas HTML) se escriben con el canvas de la página,
    porque un SVG convertido en imagen no puede cargar las fuentes de la página. Las etiquetas,
    paneles y el minimapa se pintan como cajas con fondo, borde, radio y texto, ordenadas por
    `z-index` y con su opacidad (las etiquetas tapadas salen atenuadas, como se ven). Cada línea de
    texto se ubica por las cajas de sus letras y se escribe en su dirección: probado con la interfaz
    en árabe en modo vuelo (la ayuda del teclado, la brújula y los indicadores) y en el Replay.
  - Sin `foreignObject` (Safari deja el canvas sin poder exportarse) y sin imágenes de otros sitios
    (los avatares harían lo mismo en cualquier navegador). El CSP no cambia: la imagen del SVG va como
    `data:`, que `img-src` ya permite, y la descarga es un enlace `blob:`.
  - App de escritorio: `will-download` guarda la imagen en la carpeta de descargas sin preguntar y sin
    pisar otra (`… (1).png`); solo acepta `.png` que vengan de `blob:app://graphbranch/`.
- **Pruebas que fallan sin la capacidad:**
  - Smoke: en 2D, con la demo en pausa, guarda la imagen y comprueba el PNG (firma, proporciones de la
    vista más la franja, nombre del archivo, el aviso) y que en el centro de cada commit a la vista la
    imagen tenga el color de su rama. En 3D, que la imagen tenga la escena: con ella salen más de
    1.000 colores; leyendo el canvas fuera de la tarea en que se dibujó, solo el fondo y las
    etiquetas, unos 125 (medido); el umbral es 500.
  - e2e de escritorio: dos clics dejan dos PNG en la carpeta de descargas (el segundo con `(1)`), y la
    ventana no navega. Sin el manejador de descargas, Electron abre un diálogo y la prueba falla
    (comprobado).
- README: la función en la lista y en Controles, la estructura, las pruebas, Límites conocidos (qué no
  se copia) y Seguridad (nada sale de la página; qué descargas acepta la app de escritorio).
- `sw.js` suma `js/snapshot.js` a lo que guarda para abrir sin red (la prueba de #45 lo pidió).
- Validado: 19 pruebas (`node --test`), smoke (40 idiomas), i18n (4 textos nuevos en los 40 idiomas)
  y 14 e2e en verde.
- **Siguiente:** iteración 22, expansión. El primer ítem sin hacer es el 3 (video del Replay), del
  mismo eje que esta (Salidas), y entre los tres primeros hay otros ejes: toca el 4, **GitLab**
  (Fuentes). La 23 es de mantenimiento (pendiente 1).

### 2026-10-10 · Iteración 22 · Expansión · Fuentes

- **Capacidad nueva: proyectos de GitLab** (ítem 4 de la hoja de ruta, primera entrega). Se pega la
  URL de un proyecto público de gitlab.com (con subgrupos, también la de una rama o un archivo, o
  ssh) o se escribe `gitlab:grupo/proyecto`, y se ve como un repo de GitHub: ramas, commits y merge
  requests en vivo, con sus efectos, el sonido, las galaxias con sus archivos y la Replay. Se sigue
  junto a los repos de GitHub, en su pestaña; la URL y lo guardado lo llevan con `gitlab:` delante.
  - Antes de construir: la API de gitlab.com responde con CORS abierto, expone ETag y `X-Next-Page`
    (no su cuota) y el preflight acepta `authorization` e `if-none-match`. Pero el **listado de
    commits** sin token responde con un desafío de Cloudflare (403 "Just a moment…"), que una página
    no puede resolver; el commit suelto, `compare`, `merge_base`, `sequence`, las MRs, el árbol y los
    eventos sí responden. Por eso la historia sale de `repository/compare`: la rama por defecto,
    desde `sha~N` (cuántos pasos hay lo dice `commits/:sha/sequence`, así nunca se pide uno que no
    existe); una rama nueva, desde la rama por defecto (solo lo suyo); una rama que se movió, desde
    su cabeza anterior. Un force-push se nota con `merge_base`.
  - `js/sources/gitlab.js`: `GitLabSource` extiende `GitHubSource` y cambia solo lo de GitLab
    (consultas, forma de los datos, URLs con `/-/`, MRs `!12`, textos). `github.js` gana tres
    ganchos sin cambiar su comportamiento: `term()` (los textos que nombran al servicio),
    `applyBranchList()` (comparar un listado de ramas, separado de traerlo) y `ApiError` expuesto.
  - Ramas: de a 100, las actualizadas más recientemente primero; con más de 100, la primera página
    en cada ciclo y el listado entero (hasta 1.000) cada 3 minutos, que es cuando se nota una rama
    borrada. Ritmo fijo de 15 s (GitLab no deja leer su cuota); un 429 espera un minuto.
  - App: `U.parseRepo` reconoce GitLab; `sourceFor` arma la fuente que toca; la cuota se reparte
    entre los repos de cada servicio; la etiqueta **GitLab** junto al título; sin el aviso del token
    de GitHub ni el botón de Ajustes en sus errores. Vistas: `!12` y los textos de MR en etiquetas,
    fichas y lector de pantalla. La Replay reconoce los merges de GitLab ("See merge request …!12").
  - CSP: `connect-src` y `img-src` suman `https://gitlab.com` (de los avatares, solo los alojados
    ahí; los de Gravatar no se cargan).
  - 22 textos nuevos o cambiados en los 40 idiomas: los de MR salen de los de PR (todos los idiomas
    escriben "PR #{num}") y los errores de GitLab, de los de GitHub (GitHub y GitLab se declinan
    igual: "GitLabu", "GitLabiin", "GitLabhoz"); a mano, la etiqueta y el error del campo, el de
    proyecto no encontrado y el de 429.
- **Pruebas que fallan sin la capacidad:**
  - `tools/gitlab.test.mjs` (7, `node --test`): una API de gitlab.com simulada que, como la real,
    bloquea el listado de commits. Carga con subgrupos, en vivo (push, rama nueva, MR abierta y
    fusionada, force-push, rama borrada), proyecto inexistente (no insiste), 429 (un minuto),
    historia corta (sin consultas que den 404), más de 100 ramas (páginas y borradas) y archivos.
  - Smoke: un GitLab simulado en el navegador: conecta `gitlab:g/sub/p`, se recuerda, la etiqueta
    `!5` en 2D, un push y la MR fusionada llegan al panel, y un proyecto inexistente lo dice sin
    mandar a Ajustes.
  - e2e de escritorio: sin red, un proyecto de GitLab avisa que no llega a gitlab.com.
  - Contra gitlab.com de verdad (gitlab-org/gitlab-runner, 387 ramas): en Node y en la página, en
    vivo, con la historia, sus MRs y el árbol de 1.452 archivos, sin errores en la consola.
- README: la función, el uso, la estructura, las pruebas, Límites conocidos (qué no trae GitLab
  todavía y por qué) y Seguridad (CSP, avatares, cada token a su servicio).
- Validado: 26 pruebas (`node --test`), smoke (40 idiomas), i18n y 15 e2e en verde.
- **Siguiente:** iteración 23, de **mantenimiento**: pendiente 1 (la ficha no recibe el foco al
  abrirse con el teclado). La 24 vuelve a expansión: el primer ítem sin hacer es el 3 (video del
  Replay, Salidas), de otro eje que esta (Fuentes).

### 2026-10-10 · Iteración 23 · Mantenimiento

- **Arreglo: la ficha abierta con el teclado recibe el foco** (pendiente 1). Con Enter o Espacio en
  la etiqueta de una rama se abría su ficha, pero el foco se quedaba en la etiqueta: para llegar a
  sus botones (Fijar, ver en GitHub, Recorrer la rama…) había que pasar con Tab por todas las demás
  etiquetas del grafo. Ahora la ficha (un `role=dialog` con su nombre) toma el foco, sus botones
  quedan a un Tab, y al cerrarla (Esc) el foco vuelve a la etiqueta que la abrió, o al grafo si esa
  etiqueta ya no está. Sirve para las dos vistas: un par de ayudantes compartidos (`focusTip`,
  `returnFocus` en `GB.graphShared`); en 3D, las etiquetas son botones y se distingue el teclado por
  `detail === 0` del clic. Con el ratón no cambia nada: el foco se queda en el grafo y las flechas
  siguen moviéndolo. La ficha enfocada se marca con el mismo contorno que los demás controles.
- **Prueba nueva en el smoke** (con el GitHub simulado, junto a la de Fijar): en 2D y en 3D, Enter en
  una etiqueta deja el foco en la ficha, Tab llega a uno de sus botones y Esc lo devuelve a la
  etiqueta. Antes del arreglo fallaba en las dos ("el foco quedó en g" y "en BUTTON").
- Validado: 26 pruebas (`node --test`), smoke, i18n (sin textos nuevos) y 15 e2e en verde.
- **Siguiente:** iteración 24, expansión: el primer ítem sin hacer es el 3 (grabar el Replay en
  video, eje Salidas), de otro eje que la última expansión (Fuentes).

### 2026-10-12 · Iteración 24 · Expansión · Salidas

- **Antes de empezar:** entre el 11 y el 12 de octubre, con el entorno reiniciándose, quedaron en cola
  nueve disparos de la rutina. Se tomaron como una sola iteración: nueve seguidas sobre el mismo
  estado habrían sido la misma.
- **Capacidad nueva: grabar el Replay en video** (ítem 3 de la hoja de ruta). En la barra del Replay,
  un botón con un punto rojo vuelve la historia al principio y la graba tal como se ve, en 3D o en
  2D, con la fecha grande, los rótulos de los hitos y abajo la franja con el repo. Mientras graba el
  punto late en rojo (quieto con movimiento reducido) y el botón pasa a **Detener y guardar el
  video**; se puede pausar o cambiar la velocidad. Al llegar al final el video se guarda solo; otro
  clic o **Volver al presente** lo termina antes. Un aviso dice el nombre del archivo
  (`graphbranch-owner-repo-replay-2026-10-12-0830.webm`), también al lector de pantalla.
  - `js/snapshot.js`: `record()` repite cuadro a cuadro la misma captura de Guardar imagen (a 1 px
    por px de CSS, con elementos extra: la fecha y los rótulos del Replay, que la imagen deja fuera)
    sobre un canvas de medidas pares, cuyo `captureStream()` graba `MediaRecorder` a 6 Mb/s.
    `videoFormat()` elige VP9, VP8, WebM o MP4 (Safari); sin ninguno, el botón no aparece.
  - MediaRecorder escribe el WebM mientras graba y no anota cuánto dura: con ffprobe, el archivo de
    Chromium decía `duration=N/A`, y sin ese dato muchos reproductores no muestran la duración ni
    dejan adelantar. `webmDuration()` la agrega al bloque Info del segmento (lee el EBML, respeta la
    escala de tiempo del archivo y, si el segmento tiene tamaño conocido, lo agranda). Chromium no
    escribe índice de saltos (SeekHead), así que no hay desplazamientos que corregir. Con el parche,
    ffprobe lee la duración y decodifica el video entero.
  - `js/replay.js`: `restart()`, desde el principio y andando. `js/app.js` termina la grabación al
    llegar al final o al salir del Replay.
  - App de escritorio: las descargas aceptan `.webm` y `.mp4` además de `.png`, siempre que vengan de
    `blob:app://graphbranch/`.
  - CSP sin cambios: el video nunca se reproduce en la página, solo se descarga.
  - 5 textos nuevos en los 40 idiomas.
- **Medido:** sin GPU (SwiftShader, 1280×800), grabar baja la 3D de 7,7 a 3,3 cuadros por segundo y
  la 2D de 26 a 10, porque cada cuadro se arma como una imagen entera; el Replay limita cada paso a
  0,1 s, así que en un equipo así la historia avanza más despacio y el video dura más. Con GPU la
  captura cuesta mucho menos. Si hiciera falta, lo siguiente sería copiar la escena 3D después del
  dibujo de cada cuadro en vez de dibujarla otra vez.
- **Pruebas que fallan sin la capacidad:**
  - `tools/snapshot.test.mjs` (5, `node --test`): WebM armados a mano con la forma de los de Chrome
    (segmento y cuadros de tamaño desconocido). La duración llega en la escala del archivo, las
    pistas y los cuadros quedan byte a byte, un segmento de tamaño conocido crece lo mismo, y un
    archivo que ya la tiene, un MP4 o uno cortado vuelven tal cual. Además, los nombres de archivo.
  - Smoke: entra al Replay a 4×, graba (el botón queda encendido y la historia vuelve al principio),
    salta casi al final y espera a que el video se guarde solo; después, otro grabado de 2,5 s
    parado a mano. Cada video se abre en una pestaña en blanco (el CSP de la app no deja reproducir):
    firma EBML, que diga su duración apenas se abre, que dure lo que se grabó, que mida lo que la
    vista más la franja y que tenga dibujo a la mitad.
  - e2e de escritorio: grabar y parar deja en la carpeta de descargas un `.webm` con la firma EBML y
    la duración. Sin aceptar `.webm` en `electron/main.js`, falla (comprobado).
- README: la función en la lista y en Controles, la estructura, las pruebas, Límites conocidos (en
  tiempo real, sin sonido, menos cuadros en equipos lentos, la pestaña a la vista) y Seguridad (qué
  descargas acepta la app de escritorio).
- Validado: 31 pruebas (`node --test`), smoke (40 idiomas), i18n y 16 e2e en verde.
- **Siguiente:** iteración 25, expansión: el primer ítem sin hacer es el 5 (GitLab, segunda entrega:
  token, eventos y GitLab propio, eje Fuentes), de otro eje que esta (Salidas). La 26 también es de
  expansión; la 27, de mantenimiento (pendiente 1).

### 2026-10-12 · Iteración 25 · Expansión · Fuentes

- **Capacidad nueva: proyectos privados de GitLab** (ítem 5 de la hoja de ruta, partido: esta es la
  primera entrega; los eventos del proyecto y un GitLab propio quedan como ítem 6, justo debajo).
  Ajustes tiene un campo **Token de GitLab** (permiso `read_api`) y con él se ven los proyectos
  privados de gitlab.com igual que los públicos: ramas, commits, MRs en vivo, galaxias y Replay. La
  etiqueta del título dice **GitLab · privado**.
  - Antes de construir, contra gitlab.com: el preflight CORS acepta `authorization` y un token que
    no existe responde 401 (`{"message":"401 Unauthorized"}`) con CORS, así que la página lo puede
    leer. Un proyecto privado sin token responde 404, como uno que no existe.
  - `js/sources/gitlab.js`: el token va como `Authorization: Bearer` en cada consulta (todas pasan por
    `api()`). Se guarda aparte (`gitlabToken`), no en `this.token`, que es el de GitHub y decide cosas
    de GitHub. 401, o 403 con `insufficient_scope` (sin `read_api`), es un error de token
    (`err.authGitlab`) y no insiste; el aviso de 404 ahora dice que, si es privado, hace falta el
    token. La historia sigue saliendo de las comparaciones: igual para públicos y privados.
  - App: cada fuente recibe solo el token de su servicio. Los errores de proyecto o token de GitLab
    también ofrecen **Abrir Ajustes**, y Ajustes abre con el foco en el campo de GitLab. Al guardar
    se reconectan solo los repos del servicio cuyo token cambió: un token de GitLab nuevo no gasta
    cuota de GitHub (si no cambió nada, todo, como dice el botón). **Borrar los tokens** borra los dos.
  - App de escritorio: `electron/token.js` guarda un token por servicio (`github-token.enc`,
    `gitlab-token.enc`), cifrados con el llavero; el puente (`getToken`, `setToken`) suma el servicio
    sin funciones nuevas, y el proceso principal rechaza un servicio que no conoce.
  - 7 textos nuevos (uno reemplaza a «Borrar token») y uno cambiado en los 40 idiomas; los avisos de dónde se guarda y el nombre del
    campo salen de los de GitHub (`api.github.com` → `gitlab.com`), así que dicen lo mismo en cada uno.
- **Pruebas que fallan sin la capacidad:**
  - `tools/gitlab.test.mjs` (+2, 9 en total): la API simulada, como gitlab.com, esconde un proyecto
    privado sin token (404), responde 401 a un token que no existe y 403 `insufficient_scope` a uno
    sin `read_api`, y comprueba en cada consulta que el encabezado sea exactamente el del token (o
    ninguno). Con token el privado carga entero; con uno vencido o corto, `err.authGitlab` y se detiene.
  - Smoke: un proyecto privado da el aviso con **Abrir Ajustes**, el foco cae en el campo de GitLab,
    con el token se abre y lleva la etiqueta de privado, y todas sus consultas llevan el token.
    Después, con un repo de GitHub al lado: a GitHub solo llega el token de GitHub y a GitLab solo el
    de GitLab. Comprobado que falla si la fuente de GitLab recibe el de GitHub. El GitHub simulado
    aprendió `/activity` y un GraphQL que responde con error (con token, la fuente prueba ambos).
  - e2e: en escritorio, los dos tokens quedan cifrados en archivos separados, fuera de
    `localStorage`, vuelven al reabrir y borrar el de GitLab deja el de GitHub; en la web, el de
    GitLab queda en el navegador y Ajustes dice que va solo a gitlab.com.
- README: la función, cómo crear el token de GitLab (sección Token), las pruebas, la estructura,
  Límites conocidos (solo gitlab.com; los privados piden `read_api`) y Seguridad (cada token a su
  servicio, cada uno en su archivo cifrado).
- Validado: 33 pruebas (`node --test`), smoke (40 idiomas), i18n y 17 e2e en verde.
- **Siguiente:** iteración 26, expansión. El primer ítem sin hacer es el 6 (GitLab, tercera entrega),
  del mismo eje que esta (Fuentes), y entre los tres primeros hay otro eje: toca el 7, **una
  organización o un usuario entero** (Escala). La 27 es de mantenimiento (pendiente 1).

### 2026-10-12 · Iteración 26 · Expansión · Escala

- **Capacidad nueva: los repos de una organización o un usuario entero** (ítem 7 de la hoja de ruta,
  partido: esta es la primera entrega; seguir la organización con su lista al día, sus eventos, los
  grupos de GitLab y la constelación quedan como ítem 8). En el campo del repo, `org:nombre`,
  `user:nombre`, `@nombre` o la URL de un perfil (`github.com/nombre`, `github.com/orgs/nombre`)
  siguen sus repos con push más reciente, sin forks ni archivados ni los que ya se seguían, cada uno
  en su pestaña, hasta llenar las 10. Se muestra el de push más reciente y un aviso nombra los que se
  sumaron (y dice si quedaron otros fuera por el tope). `?repo=org:nombre` hace lo mismo al abrir.
  - `U.parseOwner` (en `js/util.js`) reconoce esas formas con las reglas de nombres de GitHub (letras,
    números y guiones sueltos, hasta 39); un nombre suelto no cuenta, para no confundirlo con un repo
    mal escrito.
  - `GitHubSource.ownerRepos`: `/orgs/{org}/repos?sort=pushed&direction=desc&type=all` (con token,
    también los privados de la organización que el token ve) y, si da 404, `/users/{u}/repos` con
    `type=owner`. Una consulta para una organización, dos para un usuario; si ninguna existe,
    `err.ownerNotFound`. Usa el mismo `api()` que las fuentes: los mismos errores de token y de cuota.
  - App: `connectOwner` vuelve a mirar el tope después de la consulta (mientras llegaba la lista
    pudieron sumarse otros repos); lo que se guarda y comparte son los repos, uno por uno. Los errores
    van al aviso del campo, como los de un repo mal escrito.
  - No se pudo comprobar contra la API real: el proxy de esta sesión solo deja consultar la API del
    propio repositorio. Los parámetros siguen la documentación de GitHub (`sort`, `direction`, `type`,
    y el 404 de `/orgs/` para un usuario).
  - 4 textos nuevos y `repo.invalid` con una frase más (cómo escribir una organización), en los 40
    idiomas. El aviso nombra los repos en vez de contarlos: sin plurales nuevos.
- **Pruebas que fallan sin la capacidad:**
  - `tools/github.test.mjs` (+4, 15 en total): `parseOwner` con lo que acepta y lo que no; la lista de
    una organización en una sola consulta, ordenada por push y sin forks ni archivados; un usuario
    (404 como organización, después la de usuario) y uno que no existe (`err.ownerNotFound`, dos
    consultas); y que la consulta lleve el token. Las cuatro fallaban antes de escribir el código.
  - Smoke, sección nueva con el GitHub simulado (que aprendió organizaciones, usuarios y el orden por
    push): `org:acme` abre `acme/api*`, `acme/web` y `acme/viejo` (sin el fork ni el archivado), con
    una sola consulta de lista, el aviso con sus nombres y lo guardado; `@nadie` lo dice en el campo
    sin tocar las pestañas; y `?repo=@ana` en la URL sigue el repo de ese usuario.
- README: la función (en la lista y en Varios repos a la vez), el uso y la URL, las pruebas y Límites
  conocidos (la lista se arma al conectar; de un usuario, solo sus públicos; solo GitHub por ahora).
- Validado: 37 pruebas (`node --test`), smoke (40 idiomas), i18n y 17 e2e en verde.
- **Siguiente:** iteración 27, de **mantenimiento**: pendiente 1 (con movimiento reducido, la ayuda
  del modo vuelo y el combo no se ven nunca). La 28 vuelve a expansión: el primer ítem sin hacer es el
  6 (GitLab, tercera entrega, Fuentes), de otro eje que esta (Escala).

### 2026-10-12 · Iteración 27 · Mantenimiento

- **Disparo fuera de programa:** la rutina se disparó a las 16:40, 26 minutos después de la iteración 26
  y sin la marca de ejecución programada (la siguiente programada era a las 20:03): alguien la lanzó a
  mano, así que se hizo la iteración que tocaba.
- **Arreglo: con movimiento reducido, el combo, la ayuda del modo vuelo y sus avisos no se veían
  nunca** (pendiente 1). La regla general de movimiento reducido acorta toda animación a 0,01 ms, y
  estas tres solo existen mientras dura la suya, que termina en opacidad 0 con `forwards`: saltaban
  directo al final, invisibles. Quien pide menos movimiento se quedaba sin la ayuda de los controles al
  entrar al vuelo, sin avisos como «no hay a dónde saltar» y sin el combo. Ahora, con movimiento
  reducido, se muestran quietos el mismo tiempo (2,2 s, 8 s y 2,6 s) con una animación de un solo paso
  (`step-end`) y se van de golpe, sin escalas ni giros. Las demás animaciones que terminan invisibles
  son decorativas (trazos, ondas, destellos) o sirven para ocultar, y quedan como estaban.
- **Prueba nueva en el smoke** («Movimiento reducido»): con `reducedMotion: 'reduce'` entra al modo
  vuelo (la ayuda aparece por su camino de siempre), enciende el aviso y el combo como los enciende la
  app, y a los 0,6 s exige que los tres tengan opacidad 1, sin transformación, y que su animación dure
  lo de siempre (así se siguen yendo). Sin el arreglo falla: «.combo tiene opacidad 0». Fuera del vuelo
  la ayuda está en un contenedor oculto, donde no corre ninguna animación: por eso la prueba entra al
  vuelo en vez de mirar el estilo calculado.
- **Al validar:** en la primera corrida completa del smoke falló una vez «graba el Replay en video»: el
  cuadro de la mitad del video salió de un solo color. No tiene que ver con este cambio (esa sección
  corre sin movimiento reducido) y aparte no se repitió en dos corridas, con muestras de 550 a 3.400
  colores en cada cuadro. La comprobación ahora espera a que cada cuadro esté decodificado, mira tres
  puntos y pide dibujo en dos, y dice los tres números si falla; queda como pendiente 13 para ver,
  si vuelve, si es el grabador o la lectura.
- Validado: 37 pruebas (`node --test`), smoke (40 idiomas), i18n (sin textos nuevos) y 17 e2e en verde.
- **Siguiente:** iteración 28, expansión: el primer ítem sin hacer es el 6 (GitLab, tercera entrega:
  los eventos del proyecto en el panel, eje Fuentes), de otro eje que la última expansión (Escala).

### 2026-10-12 · Cambio de maquinaria: el loop se elige, se reclama, se valida y se mide solo

- **Qué cambió:** la Routine pasa a una sesión nueva por disparo; el «cómo iterar» vive en
  `.claude/skills/iteracion/SKILL.md` y el prompt solo apunta ahí. `tools/loop.mjs` elige la iteración
  (`--siguiente`), vigila este archivo (`--check`, se corre antes de cada PR), reclama la rama `loop/N`
  con un commit vacío (`--reclamar`: el push es el candado; a las 6 h sin commits se releva) y mide la
  web publicada (`--publicado`). `npm run check` es la única puerta: elige Chromium y Electron solo y
  corre las e2e cuando el cambio toca la página o el escritorio. `.claude/settings.json` permite lo que
  la skill usa y un hook instala dependencias en sesiones cloud.
- **Por qué:** el prompt de la Routine (2026-10-08) contradecía la directiva de #44, fijaba
  `claude/epic-curie-upah71` y una ruta de Chromium que el Playwright del proyecto ya no usa; los
  «Siguiente» se calculaban a mano; la web de GitHub Pages responde 404 (`has_pages=false`) aunque el
  README mandaba un flujo de Actions que en esta cuenta no corre: se quita el flujo, se sirve desde la
  rama con `.nojekyll` y el loop lo comprueba en cada iteración.
- Mantenimiento: los pendientes 1, 2 y 16 a 21 son lo que esta sesión dejó para después (herramienta
  de i18n, rotar la bitácora, cadencia, issues, changelog, auditorías, limpieza de ramas y guarda de
  las cifras de «Validado»).
- Web publicada: Web sin publicar: https://bfigueroa99.github.io/GraphBranch/ responde 404 y el repo
  tiene has_pages=false. Benjamin: Settings → Pages → Build and deployment → Source: Deploy from a
  branch → master, /(root). Pages despliega con un flujo interno de GitHub Actions: la cuenta tiene
  que poder correr jobs de Actions.
- Al validar: el smoke falló una vez en «Zumbido del espacio: se calla con la pestaña oculta» (el
  zumbido seguía sonando con la pestaña oculta) y pasó entero al repetirlo; este cambio no toca `js/`.
  Queda anotado en el pendiente 19 (primer caso de la auditoría de QA).
- Validado: 87 pruebas (`node --test`), smoke, i18n (0 errores) y 17 e2e en verde.
- PR: #53 (desde la rama de la sesión; no es una iteración numerada).
- **Siguiente:** iteración 28, expansión: ítem 6 (GitLab, tercera entrega, Fuentes)

### 2026-10-13 · Iteración 28 · Expansión · Fuentes

- **Capacidad nueva: los eventos de un proyecto de GitLab en el panel de actividad** (ítem 6 de la hoja
  de ruta, partido: esta es la tercera entrega; el GitLab propio queda como ítem 25). `GitLabSource`
  consulta `/projects/:id/events` al abrir (el historial reciente) y cada minuto (ETag), y muestra
  issues abiertos, reabiertos y cerrados, comentarios en issues, MRs y commits, tags, aprobaciones de
  MRs y miembros nuevos. Los pushes, las ramas y las MRs abiertas, fusionadas o cerradas no se repiten:
  ya los da la comparación entre ciclos. Un fallo del feed que no es de red, cuota ni token no corta el
  ciclo. Textos nuevos: `act.mrApproved` y `act.commentMr` (40 idiomas, derivados de los de PR).
- **Pruebas que fallan sin la capacidad:** en `tools/gitlab.test.mjs`, «eventos del proyecto: issues,
  comentarios y tags…» (historial, no repetir lo ya visto, no duplicar pushes ni MRs) y «si el feed no se
  puede leer, el resto del ciclo sigue; un 429 sí se respeta».
- README: la función de GitLab, y Límites conocidos (el panel ya trae issues y comentarios; sin
  estrellas ni forks; solo los últimos 50 eventos).
- Reclamo: relevo de loop/28 (23d47dd)
- Web publicada: Web sin publicar: https://bfigueroa99.github.io/GraphBranch/ responde 404 y el repo tiene has_pages=false (Benjamin: Settings → Pages → Deploy from a branch → master, /(root)).
- Validado: 89 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores) y 17 e2e en verde.
- **Siguiente:** iteración 29, expansión: ítem 8 (Una organización entera, segunda entrega, Escala)

### 2026-10-13 · Iteración 29 · Expansión · Escala

- **Capacidad nueva: seguir la organización, con su lista al día** (ítem 8 de la hoja de ruta,
  partido: esta es la segunda entrega; los eventos de la organización, los grupos de GitLab y la
  constelación pasan al ítem 26). `org:nombre` / `@usuario` queda guardado en `graphbranch:owners`
  con los nombres de repos que ya vio su lista; cada 30 minutos (con la pestaña a la vista y sin
  pausa) se vuelve a pedir y los repos que no se habían visto se suman solos, hasta el tope de 10, con
  el aviso de siempre. Un repo cerrado no regresa y al cerrar el último de una organización deja de
  seguirse. Sin textos nuevos (reusa `owner.followed`).
- **Pruebas que fallan sin la capacidad:** smoke, dos pasos nuevos en la sección de la organización
  (con la renovación acortada a 1,5 s): lo guardado en `owners`, el repo nuevo que se suma solo con su
  aviso, el cerrado que no vuelve, y la organización que se olvida al cerrar su último repo.
- README: la función, el apartado de la organización, la prueba de humo y Límites conocidos.
- Reclamo: loop/29, sin colisión
- Web publicada: Web sin publicar: https://bfigueroa99.github.io/GraphBranch/ responde 404 y el repo tiene has_pages=false (Benjamin: Settings → Pages → Deploy from a branch → master, /(root)).
- Validado: 89 pruebas (`node --test`), smoke, i18n (0 errores) y 17 e2e en verde.
- **Siguiente:** iteración 30, expansión: ítem 9 (CI en el grafo, Datos)

### 2026-10-13 · Iteración 30 · Expansión · Datos

- **Capacidad nueva: CI en el grafo** (ítem 9 de la hoja de ruta). El estado de los checks de la cabeza
  de la rama por defecto, las fijadas, las que acaban de moverse y los PRs sale en la etiqueta
  (✓ ✗ ●, en 2D y 3D), en el detalle y en el texto accesible; con token viene en la misma consulta
  GraphQL (`statusCheckRollup`) y sin token por check-runs, una consulta por commit nuevo de la rama
  por defecto y las fijadas. Cuando la rama por defecto pasa a rojo, el panel avisa una vez («CI
  fallido»). La demo simula checks que corren y terminan. Quedan fuera: el listado completo de ramas,
  los commit statuses sin token y GitLab.
- **Pruebas que fallan sin la capacidad:** `node --test` con un GraphQL simulado (estado de la rama y
  del PR, aviso único al ponerse en rojo, sin estado cuando no hay checks) y con check-runs simulados
  (un commit no se vuelve a preguntar, lo que sigue en curso sí, API ausente sin errores); un paso del
  smoke con la marca de CI en el grafo.
- README: la función en la lista, Límites conocidos y Seguridad.
- Reclamo: loop/30, sin colisión
- Web publicada: pendiente de `--publicado`
- Validado: 92 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores) y 17 e2e en verde.
- **Siguiente:** iteración 31, mantenimiento: pendiente 1 (`tools/i18n-add.mjs`)

### 2026-10-13 · Cambio de maquinaria: protocolo de QA, mantenimiento rotativo, investigación y salud del loop

- **Pedido de Benjamin:** loops lo más completos y autónomos posible (QA detallista, investigación de
  mercado, solución de errores). La directiva no cambia; no es una iteración numerada.
- **Medido antes:** 10 iteraciones (20 a 29) para 18 disparos esperados desde la directiva (56 %), con un
  hueco de 36,5 h (10 al 12 de octubre) y un reclamo perdido (`loop/28`, relevado a las 6 h). Ejes de las
  8 expansiones: Fuentes 3, Escala 2, Salidas 2, Plataformas 1; Datos, Análisis y Público, 0. Desde la
  iteración 6, ninguna QA exploratoria, seguridad, rendimiento ni investigación; 8 de 21 pendientes eran
  del propio loop. `npm run check -- --e2e` sobre f7749bd, rojo por el zumbido intermitente; el desborde
  del smoke en celular no podía fallar (con `isMobile`, `innerWidth` crece con el contenido: 532 = 532
  con una barra de 520 px en 390). Ningún issue; 23 ramas ajenas fusionadas o contenidas sin borrar.
- **Lo nuevo:** el Protocolo de QA (y `- QA:` en cada entrada siguiente, R5); `tools/audit.mjs` (19 tipos
  de hallazgo y medidas, sin red ni dependencias nuevas; `--puerta` en `npm run check` con
  `tools/audit-base.json`: 24 conocidos, todos del pendiente 5); los seis subtipos de mantenimiento que
  rotan por necesidad (regla 2, R7, protocolos en la skill, R8); `docs/investigacion.md` con 15 fuentes
  fechadas y puntajes en la hoja (regla 5, R10); fallos con reproducción y triaje de issues (regla 7);
  `--salud` (cadencia, reclamos, ramas, issues, Alta, Para Benjamin); Para Benjamin (regla 8, R12) y
  `audit:<tipo>` en los pendientes (R11). El smoke mide el desborde contra `clientWidth`.
- **Comprobado inyectando cada violación:** la puerta de la auditoría falla con un botón sin nombre e id
  repetido, un `fetch` a otro sitio (`csp`), una consulta de la demo a GitHub (`externa`), tres consultas
  de más (`cuota`: 8 frente a 5 + 2), `dir=ltr` en árabe y una barra de 520 px en el celular (142 px de
  más); el smoke, con esa barra, falla en sus tres idiomas y en las tres pestañas, y sin ella pasa. Cada
  regla nueva de `--check` tiene su prueba con la violación.
  Simulada la rotación sobre esta lista: 31 Deuda (el zumbido), 35 Errores (el `localStorage`,
  *reproducido*: el repo queda en «Cargando»), 39 QA, 43 Deuda, 47 Seguridad, 51 Rendimiento, 55
  Accesibilidad.
- **Al fusionar #56 (iteración 30)** la puerta de la auditoría falló dos veces con un error de consola nuevo
  en `cuota-sin-token`: el CI sin token pide `/commits/:sha/check-runs`, y la API simulada respondía 404
  (GitHub responde 200 en un repo público). La API simulada aprendió ese camino y la base pasó de 5 a 8
  consultas (las check-runs de #56 y la historia de las otras ramas, que a veces cae en la ventana).
- **Pendientes:** de 21 sin prioridad ni subtipo a 18 (4 Media, 14 Baja). Salen porque esto los cumple:
  cadencia y caudal, issues como fuente, auditoría rotativa y limpieza de ramas (`--salud`, reglas 7 y 2,
  Para Benjamin 3 y 4). Entra el zumbido intermitente (1). El 5 pierde el botón de pausa del Replay: ya
  tiene nombre (`replay.js:369`).
- **Pruebas que fallan sin el cambio:** `tools/loop.test.mjs` (de 50 a 73) y `tools/audit.test.mjs` (10).
- README: la auditoría en Pruebas y en la estructura, `--salud` y `docs/investigacion.md`.
- Validado: 125 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 17 e2e en verde.
- **Siguiente:** iteración 31, mantenimiento · Deuda: pendiente 1 (Smoke intermitente «Zumbido del espacio: se calla con la pestaña oculta»: falló…)

### 2026-10-13 · Iteración 31 · Mantenimiento · Deuda

- **Arreglo: el zumbido del espacio ya no se reanuda con la pestaña oculta** (pendiente 1). Al ocultarse
  la pestaña, `app.js` apaga el zumbido, pero `stepAmbience` (`galaxy.js`), que corre en cada cuadro,
  volvía a pedirlo cuando cambiaba su nivel y pisaba ese silencio. Ahora no pide nada con
  `document.hidden`; al volver, `pokeAmbience` lo vuelve a pedir como antes.
- **Reproducción:** la sección «Zumbido del espacio» del smoke sola, 20 corridas → 1 falla («con la
  pestaña oculta el zumbido sigue sonando»), 19 en verde. Después del arreglo: 40 corridas, 40 en verde.
- **Pruebas que fallan sin el arreglo:** el paso del smoke «se calla con la pestaña oculta…» ahora espera
  800 ms (varios turnos de `stepAmbience`) y vuelve a comprobar el silencio, en vez de mirarlo una vez.
- README: sin cambios (no cambia lo que hace la app).
- QA: contraste, 320 px, teclado y temas no se tocan; sonido y modo TV, por el mismo paso del smoke; auditoría: no toca la página más que un guardia en `stepAmbience`.
- Reclamo: loop/31, sin colisión
- Validado: 125 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 17 e2e en verde.
- **Siguiente:** iteración 32, expansión: ítem 10 (Repos locales en la app de escritorio, Fuentes)

### 2026-10-13 · Iteración 32 · Expansión · Fuentes

- **Capacidad nueva: repos locales en la app de escritorio** (ítem 10 de la hoja de ruta). **Abrir carpeta…**
  elige un repositorio git con el diálogo del sistema (o `npm start -- --local=ruta`) y se sigue como
  cualquier otro, en su pestaña con la etiqueta *local*. `electron/git.js` lee ramas, commits, ancestros y
  archivos con `git` (`execFile`, sin shell, `core.fsmonitor` apagado, commits validados) y vigila
  `.git/refs`, `packed-refs` y `HEAD`; `js/sources/local.js` (`LocalGitSource`, hereda de la de GitHub como
  la de GitLab) arma el grafo y las actividades. La página solo conoce el id de la carpeta elegida
  (`GBDesktop.git`); las carpetas se recuerdan en la carpeta de datos. Sin red y sin cuota. No entra en la
  demo ni en la web: leer carpetas solo puede hacerlo el escritorio, y la web avisa si se abre un `local:`.
- **Pruebas que fallan sin la capacidad:** `tools/local-git.test.mjs` (6) y `tools/local.test.mjs` (7) con
  repos git reales; en `e2e/desktop.spec.mjs`, el repo local que ve llegar un commit y una rama sin
  esperar al sondeo y se recuerda al reabrir, el `--local` que no es un repo, y el puente que rechaza
  carpetas no elegidas; en `e2e/web.spec.mjs`, que la web no muestra el botón y avisa de un `local:`.
- README: la función en la lista, la sección de la app de escritorio, Pruebas, Estructura, Límites conocidos
  y Seguridad.
- QA: web y escritorio (las e2e nuevas de ambos); sin conexión e instalable (`local.js` va a `FILES` de
  `sw.js`, lo comprueba `tools/pwa.test.mjs`); 40 idiomas (8 textos nuevos, `check-i18n`); consola y CSP
  (el CSP no cambia, e2e web sin errores); cuota de GitHub (no gasta nada: el `fetch` de la prueba falla si
  la fuente lo toca). Sin mirar a mano en esta iteración: el recorrido solo con teclado del botón nuevo,
  320 px con el botón extra en la barra, 1.000 ramas locales y la etiqueta en árabe y tamil (pendiente 18); auditoría: 0 hallazgos nuevos.
- Reclamo: loop/32, sin colisión
- Validado: 138 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 21 e2e en verde.
- **Siguiente:** iteración 33, expansión: ítem 11 (Widget embebible y capa para streaming, Plataformas)

### 2026-10-13 · Iteración 33 · Expansión · Plataformas

- **Capacidad nueva: widget embebible y capa para streaming** (ítem 11 de la hoja de ruta). `?embed=1` deja
  solo el grafo y los avisos, sin barras, para un iframe en documentación, wikis o Notion; `&bg=transparent`
  deja el fondo transparente (fuente de navegador de OBS). `js/i18n.js` marca `<html class="embed">` antes
  de pintar (sin parpadeo; la CSP prohíbe scripts en línea) y `css/styles.css` esconde el resto. El título
  del repo sigue para lectores de pantalla. En embed no se leen ni se escriben los repos seguidos
  (`saveTabs` no hace nada) y no entra en modo TV. Sin textos nuevos: no hay interfaz nueva que traducir.
- **Pruebas que fallan sin la capacidad:** paso nuevo del smoke «solo el grafo y los avisos, sin barras ni
  desborde» (640×400: nada de topbar, resumen, actividad ni barra; sin desborde; el grafo llena el marco;
  fondo transparente; sin modo TV).
- README: la función en la lista, el código para pegar, Límites conocidos (token y sin `frame-ancestors`)
  y Seguridad.
- QA: filas del protocolo tocadas: 320 px y tema claro/oscuro, cubiertas por el mismo CSS que no depende
  del ancho; la demo (sin API) en el smoke; consola y CSP sin cambios (el smoke falla con errores). Sin
  mirar a mano: solo teclado dentro del iframe y árabe; auditoría: 0 hallazgos nuevos. El paso del smoke cazó un fallo real a medio camino (el grafo medía 0 px: `height:100%` no resuelve en `html`), arreglado con altura explícita.
- Reclamo: loop/33, sin colisión
- Validado: 138 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 21 e2e en verde.
- **Siguiente:** iteración 34, expansión: ítem 12 (Salud del repo, Análisis)

### 2026-10-13 · Iteración 34 · Expansión · Análisis

- **Capacidad nueva: salud del repo** (ítem 12 de la hoja de ruta). El botón del pulso en la barra abre un
  diálogo con lo que el grafo ya tiene: ramas sin actividad hace más de 30 días y sin PR, PRs abiertos por
  edad, tiempo de abierto a fusionado de los últimos 20 PRs fusionados y ritmo de merges (7 y 30 días) y
  releases (30 días). Cada fila lleva a su rama. Cálculos puros en `js/health.js`; los PRs fusionados traen
  ahora `openedAt` (GitHub y GitLab, por sondeo y por eventos, y la demo) y `U`/`i18n.fmtSpan` da los lapsos
  en cada idioma. No hace consultas nuevas ni guarda nada; cuenta el repo, no personas.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` (5 pruebas con datos fijos) y el paso
  del smoke «salud del repo: listas y ritmo de lo ya cargado, y cada fila lleva a su rama» (que cazó un
  índice mal calculado cuando una lista vacía no dibuja su `<ul>`).
- README: la función en la lista, el botón en Controles, `js/health.js` en la estructura, Límites conocidos
  (qué cuenta el ritmo) y Seguridad.
- QA: filas del protocolo tocadas: demo sin token (el smoke abre el panel en la demo, sin API); 40 idiomas
  (10 textos nuevos, `check-i18n`); sin conexión (`js/health.js` en `FILES` de `sw.js`); consola y CSP sin
  cambios; cuota de GitHub (no gasta nada). Sin mirar a mano: solo teclado, árabe y tamil, 320 px y el
  panel en la app de escritorio; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/34, sin colisión
- Validado: 143 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 21 e2e en verde.
- **Siguiente:** iteración 35, mantenimiento · QA: pendiente 18 (Repos locales sin mirar a mano (iteración 32): el botón **Abrir carpeta…** solo…)

### 2026-10-13 · Iteración 35 · Mantenimiento · QA

- **Arreglo: la barra a 320 px desbordaba en la app de escritorio** (pendiente 18, el botón **Abrir carpeta…**
  a 320 px). Con el botón de más, `.repo-form` no cabía en tamil (370 px de ancho en una ventana de 305) ni en
  alemán (332): a ≤ 560 px el formulario ahora pasa a dos filas (el campo ocupa la primera, los botones la segunda).
- **Reproducción:** `xvfb-run npx playwright test e2e/desktop.spec.mjs -g "320 px"` → «scrollWidth - clientWidth ≤ 0» sin cumplirse (tamil 65 px, alemán 27 px).
- **Hallazgos:** 3 nuevos (pendientes 18, 19 y 20), 0 a la base de la auditoría. Repo local de 1.000 ramas en tamil y árabe sin errores de consola, foco visible en 4 Tab sin caer a `<body>`, árabe en `rtl`; la auditoría `--langs` (137 hallazgos, 0 Alta) solo repite los de `objetivo-chico` por idioma y dos medidas de rendimiento sobre el presupuesto de esta máquina.
- **Pruebas que fallan sin el arreglo:** la e2e «a 320 px la barra con Abrir carpeta no desborda, ni en los idiomas de textos largos» (tamil y alemán).
- README: sin cambios (no cambia ninguna función).
- QA: filas tocadas: solo teclado (Tab llega al botón con foco visible), 320 px (el hallazgo), árabe y tamil, 1.000 ramas, consola; smoke 3 veces en verde (sin intermitencias); auditoría completa `--langs` (sin tipos nuevos). Sin mirar: Replay y modo TV con un repo local.
- Reclamo: loop/35, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 143 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 22 e2e en verde.
- **Siguiente:** iteración 36, expansión: ítem 13 (GitHub Enterprise Server, Fuentes)

### 2026-10-13 · Iteración 36 · Expansión · Fuentes

- **Capacidad nueva: GitHub Enterprise Server** (ítem 13 de la hoja de ruta). `GitHubSource` acepta `apiUrl`
  (`https://host/api/v3`): REST ahí, GraphQL en `https://host/api/graphql`, enlaces a `https://host`; una URL que
  no sea https (o con usuario) se ignora. En la web se activa con `?api=`; en la app de escritorio con
  `--api-url=`, que suma ese host, y solo él, al `connect-src` del CSP al servir `index.html`. Sin textos nuevos
  en la interfaz (nada que traducir).
- **Pruebas que fallan sin la capacidad:** en `tools/github.test.mjs`, la API simulada ahora responde solo en su
  `base` (cualquier otro host falla): «GHE sin token» (modo events y su paginación), «GHE con token» (GraphQL en
  `/api/graphql` y token solo al host) y «una URL de API que no es https no se usa»; y la e2e de escritorio
  «--api-url suma solo ese host al CSP».
- README: la función en la lista, `--api-url` en la app de escritorio, Límites conocidos (un servidor por sesión,
  claves compartidas, token único, sin probar contra un servidor real) y Seguridad (CSP y token).
- QA: filas tocadas: CSP (la web no cambia; `pwa.test.mjs` sigue exigiendo `connect-src` cerrado), cada token a su
  API (prueba del token solo al host), sin red (el error sigue siendo de red). Sin mirar a mano: un servidor real
  de Enterprise; el mensaje de «no se pudo conectar» nombra api.github.com (anotado en Límites).
- Reclamo: loop/36, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 146 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 23 e2e en verde. El primer `check` falló en tres pasos del smoke ajenos al cambio y pasó al repetirlo: pendiente nuevo [Deuda] (Media, 4).
- **Siguiente:** iteración 37, expansión: ítem 14 (Choques entre ramas, Análisis)

### 2026-10-13 · Iteración 37 · Expansión · Análisis

- **Capacidad nueva: choques entre ramas** (ítem 14 de la hoja de ruta). El panel de salud suma «Buscar choques»:
  compara con la rama por defecto cada rama con PR abierto del mismo repo (hasta 20) y lista los archivos que
  tocan dos o más a la vez, con sus ramas; cada fila lleva a una de ellas. Reusa `source.files` (GitHub, GitLab,
  demo y repos locales), así que no hay API nueva. Corre solo al pulsar el botón: abrir el panel no gasta cuota.
  Cálculos puros (`clashes`, `clashCandidates`) en `js/health.js`. Queda fuera el aviso automático al aparecer un
  choque nuevo (requeriría comparar sin que se pida).
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` (2 pruebas nuevas: choques ordenados y sin
  repetir ramas; candidatas sin la rama por defecto ni forks) y el paso del smoke de salud, que ahora pulsa
  «Buscar choques» y espera el resultado.
- README: la función en la lista, Controles, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (el smoke la ejerce con la API de la demo); 40 idiomas (6 textos nuevos,
  `check-i18n`); cuota de GitHub (solo al pedirlo, una consulta por rama, tope 20); error de la API (mensaje
  «no se pudieron comparar»); resultado en región `role="status"`. Sin mirar a mano: solo teclado, árabe y
  tamil, 320 px y la app de escritorio; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/37, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 148 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 23 e2e en verde.
- **Siguiente:** iteración 38, expansión: ítem 15 (Avisos a Slack y Discord, Salidas)

### 2026-10-13 · Iteración 38 · Expansión · Salidas

- **Capacidad nueva: avisos a Slack y Discord** (ítem 15 de la hoja de ruta). En la app de escritorio, Ajustes
  suma por servicio una URL de webhook (guardada cifrada, en su archivo, como un token), los cuatro eventos que
  recibe (release, merge a la rama por defecto, CI en rojo, force-push en la por defecto) y «Enviar prueba».
  `js/hooks.js` decide qué actividad en vivo va a qué webhook (un PR fusionado cuenta una vez; como mucho 5
  avisos por lote); `electron/webhooks.js` valida que la URL sea del servicio, arma el cuerpo (sin menciones ni
  enlaces ajenos) y lo envía desde el proceso principal, sin seguir redirecciones. La CSP no cambia.
  Queda fuera: cola y reintentos, y avisar de un squash sin PR como merge.
- **Pruebas que fallan sin la capacidad:** `tools/webhooks.test.mjs` (6 pruebas: URL aceptadas y rechazadas,
  cuerpo escapado, envío contra un servidor local sin redirecciones, evento por actividad y enrutado) y la e2e
  de escritorio «los avisos a Slack y Discord» (URL cifrada, prueba que llega al webhook local, URL ajena que
  no sale, eventos que se recuerdan), además del puente `GBDesktop.webhook` en la primera e2e.
- README: la función en la lista, Pruebas, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: 40 idiomas (7 textos nuevos, `check-i18n`); app de escritorio (e2e); web (la sección de
  Ajustes queda oculta sin `GBDesktop`, la ejerce el smoke); token fuera de `localStorage` y de errores.
  Sin mirar a mano: solo teclado, árabe y tamil, 320 px del diálogo con las filas nuevas; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/38, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 154 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 39, mantenimiento · Deuda: pendiente 1 (Smoke: el paso de contraste de las pestañas (varios repos) mide 500 ms fijos de…)

### 2026-10-13 · Iteración 39 · Mantenimiento · Deuda

- **Arreglo: el paso de contraste de las pestañas espera a las transiciones, no 500 ms fijos** (pendiente 1). `tools/smoke.mjs` ahora usa `transitionsDone` (`document.getAnimations()` hasta que terminan las finitas) tras cambiar de tema.
- **Reproducción:** `node tools/smoke.mjs` con la espera en 0 ms (como un equipo que no alcanza los 600 ms de la transición) → `dark: 8 textos con poco contraste, como 1.02:1 «Conectar»`, 3 corridas de 3 en rojo; con el arreglo el paso pasa.
- **Pruebas que fallan sin el arreglo:** el paso del smoke «las pestañas y el repo de cada aviso se leen (contraste, tema claro y oscuro)».
- README: sin cambios (herramienta interna).
- QA: smoke (contraste en tema claro y oscuro); auditoría: no toca la página.
- Reclamo: loop/39, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 154 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 40, expansión: ítem 16 (Aprender git, Público)

### 2026-10-13 · Iteración 40 · Expansión · Público

- **Capacidad nueva: aprender git** (ítem 16 de la hoja de ruta). El botón «Practicar git» abre un repo de práctica
  (pestaña como la demo, sin red) con una terminal bajo el grafo. `js/gitsim.js` es un intérprete puro (commit,
  branch, checkout/switch, merge con avance rápido o commit de fusión, rebase, reset, log, status, help) con
  shas deterministas y cuatro ejercicios que se resuelven solos (rama y commits, fusionar, rebase, deshacer);
  `js/sources/practice.js` pasa su estado a la forma de datos del grafo y emite actividades con los textos que ya
  existían; `js/practice-ui.js` es la terminal (historial con flechas, salida con `textContent`). Queda fuera:
  `stash`, `cherry-pick`, `tag`, `remote`, el área de preparación y los conflictos.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (11 pruebas: cada comando, errores, shas
  deterministas, ejercicios que parten sin resolver y no se resuelven con el atajo equivocado) y el paso del smoke
  «la práctica de git responde a los comandos en el grafo» (nodos nuevos en el 2D, HTML escapado, error de un
  comando desconocido, ejercicio resuelto y cambio de ejercicio).
- README: la función en la lista, Pruebas, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (la práctica no consulta ninguna API: el smoke falla si lo hace); sin conexión
  (los tres archivos nuevos en `FILES` de `sw.js`, `tools/pwa.test.mjs`); 40 idiomas (16 textos, `check-i18n`);
  teclado (la terminal recibe el foco al abrirse, Enter ejecuta, flechas recorren el historial); consola y CSP
  (sin cambios, ningún servidor nuevo). Sin mirar a mano: árabe y tamil de la terminal, 320 px, solo teclado en
  el selector de ejercicios, 3D (el grafo es el mismo); auditoría: 0 hallazgos nuevos.
- Reclamo: loop/40, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 165 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde (a la segunda corrida: la primera falló en el paso de `?repo=@ana`, ajeno al cambio, anotado en el pendiente 3).
- **Siguiente:** iteración 41, expansión: ítem 17 (Tags y despliegues, Datos)

### 2026-10-13 · Iteración 41 · Expansión · Datos

- **Capacidad nueva: tags y despliegues** (ítem 17 de la hoja de ruta). `GitHubSource.syncMarks` lee `/tags` (50) y
  `/deployments` (30) con ETag al abrir el repo y cada 15 minutos; `data.tags` (commit → nombres) y `data.deploys`
  (entorno → commit). `app.js` los junta por commit (`marksBySha`) y el grafo 2D dibuja un banderín (nombre del
  tag, «+n» si hay más) y una placa con el entorno; el 3D, un obelisco y una losa verde instanciados; la ficha
  del commit los nombra. Interruptor en Ajustes (apagado: ninguna consulta). La demo trae tags y entornos
  (staging sigue a `develop`).
- **Pruebas que fallan sin la capacidad:** `tools/github.test.mjs` (tags al commit, despliegue más nuevo por entorno,
  sin repetir antes de 15 min, 404 y apagado sin gasto) y el paso del smoke «tags y despliegues: banderín en el
  commit con tag y placa en el de cada entorno».
- README: la función en la lista, Pruebas, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (sin consultas a la API); 40 idiomas (4 textos, `check-i18n`); CSP (sin cambios);
  XSS (nombres con `textContent` y `U.esc`); cuota (2 consultas, apagable). Sin mirar a mano: 320 px, árabe,
  solo teclado (el banderín es decorativo, `aria-hidden`; los nombres van en la ficha); auditoría: 0 hallazgos nuevos (el interruptor de Ajustes salió con 19 px de alto y se arregló con `.marks-toggle`).
- Reclamo: loop/41, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 167 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 42, expansión: ítem 18 (Vista de texto accesible, Público)

### 2026-10-13 · Iteración 42 · Expansión · Público

- **Capacidad nueva: vista de texto accesible** (ítem 18 de la hoja de ruta). El botón de las líneas abre un diálogo
  con las ramas (la por defecto primero, luego las más movidas, hasta 200) y sus últimos 10 commits por primer padre
  como un árbol `role="tree"` (`js/textview.js`: `build` puro y `mount` con el teclado). ↑ ↓ recorren lo visible,
  → abre o baja al primer commit, ← cierra o sube, Inicio y Fin, Enter lleva al grafo (2D o 3D). Cada nodo tiene
  nombre accesible (mensaje, autor, antigüedad, merge, tags); todo entra con `textContent`. Sin consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` (orden de ramas, primer padre, límites, ciclo) y el
  paso del smoke «vista de texto: árbol con teclado, nombres accesibles y Enter lleva al grafo» (que además midió un
  desborde de 6 px en el diálogo, corregido con `.tv-body { min-width: 0 }` y filas que envuelven).
- README: la función en la lista, Controles, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (sin consultas); 40 idiomas (6 textos, `check-i18n`); teclado (↑ ↓ → ← Enter en el
  smoke, foco dentro del árbol al abrir); desborde en escritorio (smoke); CSP (sin cambios); XSS (`textContent`).
  Sin mirar a mano: 320 px, árabe, 3D, lector de pantalla real; auditoría: 0 hallazgos nuevos (la e2e de 320 px midió 29 px de desborde en tamil con el botón nuevo y se arregló con `.controls { flex-wrap: wrap }`).
- Reclamo: loop/42, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 170 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 43, mantenimiento · Errores: pendiente 2 (Valores guardados sin validar el tipo (`pins`, `filter`): un `localStorage` cor…)

### 2026-10-13 · Iteración 43 · Mantenimiento · Errores

- **Arreglo: valores guardados con el tipo equivocado** (pendiente 2). `U.store.get` ahora devuelve el valor por defecto cuando lo guardado no es del tipo de éste (lista, texto, número, booleano), así que `pins` y `filter` corruptos ya no dejan el repo en «Cargando». Mismo patrón en el resto del código: todos los `U.store.get` con valor por defecto pasan por la misma guarda; `owners` (defecto `null`) ya se validaba a mano.
- **Reproducción:** `node --test tools/util.test.mjs` → sin el arreglo, `pins:a/b` = `{}` sale como objeto (no como lista) y `filter:a/b` = `{"a":1}` como objeto (no como texto).
- **Pruebas que fallan sin el arreglo:** `tools/util.test.mjs` (pins, filter, depth y marks corruptos; valor válido y ausente intactos).
- README: sin cambios (no cambia ninguna función visible).
- QA: filas tocadas: valores guardados (prueba unitaria sobre `util.js`); no toca la interfaz; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/43, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 171 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 44, expansión: ítem 19 (Búsqueda y filtro por autor, Análisis)

### 2026-10-13 · Iteración 44 · Expansión · Análisis

- **Capacidad nueva: búsqueda de commits y filtro por autor** (ítem 19 de la hoja de ruta). La lupa de la barra superior abre un cuadro que busca entre los commits ya cargados por mensaje, SHA o autor (`@ana`, por nombre o usuario; todas las palabras tienen que aparecer), con un selector de autor con la cuenta de cada uno. ↓ baja a los resultados, Enter o un clic vuela al commit en el grafo (2D o 3D) y Esc cierra. Lista los 50 más nuevos y dice el total. Sin consultas nuevas; en la demo funciona igual. Lo de esconder del grafo las ramas de otros autores queda como ítem 34.
- **Pruebas que fallan sin la capacidad:** `tools/search.test.mjs` (mensaje, SHA, autor con y sin `@`, filtro por clave, límite, cuenta de autores) y el paso del smoke «búsqueda de commits: por mensaje y por autor, con teclado, y Enter vuela al commit».
- README: la función en la lista, Controles, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (sin consultas); 40 idiomas (8 textos, `check-i18n`); teclado (foco en el campo al abrir, ↓ y Enter en el smoke); desborde en escritorio (smoke); CSP (sin cambios); XSS (`textContent`). Sin mirar a mano: 320 px, árabe, tamil, 3D, lector de pantalla real; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/44, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 177 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 45, expansión: ítem 21 (Gitea, Forgejo y Codeberg, Fuentes)

### 2026-10-13 · Iteración 45 · Expansión · Fuentes

- **Capacidad nueva: Codeberg como fuente** (ítem 21 de la hoja de ruta). `codeberg:dueño/repo` o la URL de codeberg.org abre un repo público de Codeberg como una pestaña más: `js/sources/codeberg.js` hereda de la fuente de GitHub (la API de Forgejo se parece) y cambia lo propio: página con `limit` (50), ramas listadas enteras en cada ciclo (hasta 500), historia con `commits?sha=`, force-push distinguido con dos comparaciones `a...b`, PRs con título `WIP:`/`Draft:` como borrador y árbol de archivos para las galaxias. CORS de codeberg.org comprobado con `curl` (`access-control-allow-origin: *`, `Link` y `X-Total-Count` expuestos): sirve desde la web, sin pasar por escritorio. La CSP suma `https://codeberg.org` a `connect-src` e `img-src` (solo avatares de ahí) y nada más; no hay token de Codeberg, así que nada sensible sale. 7 textos nuevos en los 40 idiomas (los de red, límite y HTTP derivados de los de GitLab; el de «no encontrado» escrito aparte porque no hay token que sugerir). Sin hacer: otros servidores de Gitea/Forgejo, token para repos privados, eventos y CI.
- **Pruebas que fallan sin la capacidad:** `tools/codeberg.test.mjs` (parseo de URL, carga, vivo con push/rama/PR/force/borrado, 404, 429 con `Retry-After`, más de 50 ramas, árbol) y el paso del smoke «Codeberg» (etiqueta, sin `Authorization`, PR `#3`, aviso de no encontrado).
- README: la función en la lista, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: CSP (`tools/pwa.test.mjs` con la directiva nueva); XSS (nada nuevo en `innerHTML`; textos por `textContent`); 40 idiomas (`check-i18n`); token solo a su API (Codeberg no lleva ninguno, el smoke lo comprueba); 404 y sin red (prueba y smoke). Sin mirar a mano: 320 px, 3D, repos de más de 500 ramas contra el servidor real; auditoría: no toca la interfaz más allá de la etiqueta.
- Reclamo: loop/45, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 184 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde. (La primera pasada falló dos e2e: la CSP de escritorio, mía y corregida, y «grabar el Replay», intermitente bajo carga, que pasó sola y en la segunda pasada.)
- **Siguiente:** iteración 46, expansión: ítem 20 (Comparar dos ramas, Análisis)

### 2026-10-14 · Iteración 46 · Expansión · Análisis

- **Capacidad nueva: comparar dos ramas** (ítem 20 de la hoja de ruta). El panel de salud suma «Comparar dos ramas»: dos selectores (por defecto, la rama por defecto y otra), y al pulsar «Comparar» dice cuántos commits lleva cada rama por delante de la otra y el commit desde donde se separaron (el ancestro común más nuevo), calculado con los commits ya cargados y sin consultas; avisa si falta historia y las cuentas pueden quedar cortas. Cada línea lleva a la rama o al commit en el grafo. Después lista los archivos que cambió solo una, solo la otra o las dos (hasta 8 por grupo), con `source.files` de cada rama contra la por defecto: dos consultas, solo al pulsar. Lógica pura en `js/health.js` (`compare`, `splitFiles`); 15 textos nuevos en los 40 idiomas. Sin hacer: resaltar en el grafo el tramo de cada rama y la comparación directa A...B por API.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` (por delante, punto de separación con merge, rama contenida, historia incompleta, archivos en una o en las dos) y el paso del smoke «salud del repo» (selectores y filas del resultado con la demo).
- README: la función en la lista, Controles, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (smoke); 40 idiomas (`check-i18n`); XSS (filas con `textContent`, selectores con `new Option`); desborde del panel (smoke). Sin mirar a mano: 320 px, árabe, 3D, lector de pantalla; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/46, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 188 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 47, mantenimiento · Rendimiento: pendiente 10 (Durante Replay se actualizan las dos vistas aunque una esté oculta)

### 2026-10-14 · Iteración 47 · Mantenimiento · Rendimiento

- **Arreglo: durante el Replay solo se actualiza la vista a la vista** (pendiente 10). `onFrame` dibujaba y festejaba en 2D y 3D aunque una estuviera oculta; ahora solo lo hace `graph`, y `setView` pone al día la vista que se muestra con el último cuadro (`replayFrame`). Medida: cuentas de `Graph3D.update` en el smoke, no tiempos (no se corrió `audit.mjs --repetir` antes y después; queda sin medir).
- **Reproducción:** `node tools/smoke.mjs` sin el arreglo → `✗ replay: solo se actualiza la vista a la vista`.
- **Pruebas que fallan sin el arreglo:** el paso del smoke «replay: solo se actualiza la vista a la vista» (con la vista 2D, cuenta las llamadas a `Graph3D.update`; al pasar a 3D mientras corre el Replay, debe actualizarse).
- README: sin cambios (comportamiento interno).
- QA: Replay con 2D y 3D en el smoke; auditoría: no toca la interfaz.
- Reclamo: loop/47, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 188 pruebas (`node --test`), smoke (73 pasos), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 48, expansión: ítem 22 (Bitbucket Cloud, Fuentes)

### 2026-10-14 · Iteración 48 · Expansión · Fuentes

- **Capacidad nueva: Bitbucket Cloud como fuente** (ítem 22 de la hoja de ruta). `bitbucket:espacio/repo` o la URL de bitbucket.org abre un repo público de Bitbucket como una pestaña más: `js/sources/bitbucket.js` hereda de la fuente de GitHub y cambia lo propio: páginas con `pagelen` (100) y `next`, ramas ordenadas por fecha (hasta 300, con el total de `size`), historia con `commits/{hash}`, force-push distinguido con `exclude`, PRs con `draft` y estado `MERGED`/`DECLINED`, y árbol de `src` para las galaxias. La API real da solo 60 consultas por hora por IP sin token (`x-ratelimit-limit: 60, 60;w=3600`) y no expone el encabezado al navegador, así que la fuente lleva su propia cuenta de la última hora (48 de tope, repartido entre repos de Bitbucket; cargar historia gasta como mucho el 60 %; ciclos de 90 s o más según lo que cuesten). CORS comprobado con `curl` (`access-control-allow-origin: *`) y la fuente probada contra `atlassian/aui` real, solo lectura. La CSP suma `https://api.bitbucket.org` a `connect-src` y nada a `img-src` (sin avatares: sus hosts no están). 7 textos nuevos en los 40 idiomas (derivados de los de Codeberg, que ya están traducidos). Sin hacer: token de Bitbucket, repos privados, pipelines.
- **Pruebas que fallan sin la capacidad:** `tools/bitbucket.test.mjs` (parseo de URL, carga, vivo con push/rama/PR/force/borrado, PR rechazado, 404, 429, más de 100 ramas con `next`, la cuota por hora y el árbol) y el paso del smoke «Bitbucket» (etiqueta, sin `Authorization`, PR `#3`, aviso de no encontrado).
- README: la función en la lista, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: CSP (`tools/pwa.test.mjs` con la directiva nueva; sin `img-src` nuevo); XSS (nada nuevo en `innerHTML`; textos por `textContent`); 40 idiomas (`check-i18n`); token solo a su API (Bitbucket no lleva ninguno, la prueba y el smoke lo comprueban); 404 y sin red (prueba y smoke); cuota (prueba). Sin mirar a mano: 320 px, 3D, repos de más de 300 ramas contra el servidor real; auditoría: no toca la interfaz más allá de la etiqueta.
- Reclamo: loop/48, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 197 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde.
- **Siguiente:** iteración 49, expansión: ítem 23 (Resumen de la semana, Salidas)

### 2026-10-14 · Iteración 49 · Expansión · Salidas

- **Capacidad nueva: resumen de la semana** (ítem 23 de la hoja de ruta). El panel de salud suma «Resumen de la semana»: los últimos 7 días con lo ya cargado y sin consultas (commits, PRs fusionados y releases de la actividad, quién aportó con hasta 5 personas por commits, y la rama más activa), con vista previa en Markdown y los botones «Copiar Markdown» (si no hay permiso del portapapeles, deja el texto seleccionado) y «Guardar .md» (enlace `blob:`). Lógica pura en `js/digest.js`; el Markdown escapa el texto de afuera y solo enlaza URL http(s); 11 textos nuevos en los 40 idiomas. Sin hacer: guardarlo como imagen y juntar varios repos.
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` (ventana de 7 días, personas, rama más activa, semana vacía, escapes y esquemas raros) y el paso del smoke «salud del repo» (Markdown con formato y descarga `.md`).
- README: la función en la lista, Controles, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (smoke); 40 idiomas (`check-i18n`); XSS (vista previa con `textContent`; Markdown escapado y probado); desborde del panel (smoke). Sin mirar a mano: 320 px, árabe, lector de pantalla; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/49, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 217 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 24 e2e en verde. (La primera pasada del smoke falló en el panel de salud: el resumen mostraba `#undefined` y `[object Object]` con los títulos de la demo; corregido pasando los títulos por `i18n.text` y con prueba.)
- **Siguiente:** iteración 50, expansión: ítem 24 (Extensión de VS Code, Plataformas)

### 2026-10-14 · Iteración 50 · Expansión · Plataformas

- **Capacidad nueva: extensión de VS Code** (ítem 24 de la hoja de ruta). `vscode/` es una extensión sin compilación: `extension.js` abre un panel con la app, `server.js` la sirve en 127.0.0.1 (puerto al azar) bajo una clave al azar y le entrega el token de la sesión de GitHub de VS Code en `vscode-session.js` (que se suma a `index.html` solo al servir; la CSP de la página no cambia), y el repo sale del `origin` de `.git/config`. `tools/vscode.mjs` deja el paquete listo (`vscode/app/`); publicarlo es de Benjamin.
- **Pruebas que fallan sin la capacidad:** `tools/vscode.test.mjs` (repo desde `.git/config` en https, ssh y otros servicios; token entregado como JSON dentro de `localStorage`; 404 sin la clave, con otra, para `sw.js`, `package.json` y rutas con `..`; claves distintas por arranque; comandos del manifiesto registrados). A mano, con Playwright contra el servidor de la extensión: la página lee el token, lo manda solo a `api.github.com`, sin errores de consola y sin service worker.
- README: la función en la lista, su sección, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: CSP (`index.html` sin cambios; el panel de VS Code solo enmarca el servidor local); token solo a su API (mirado a mano) y nunca en una URL ni en el service worker (la prueba); XSS (sin `innerHTML` nuevo en la página); 40 idiomas (la página no cambia; la extensión trae textos en inglés y español, dicho en Límites conocidos). Sin mirar: el panel dentro de VS Code (no hay VS Code en la sesión); auditoría: no toca la página.
- Reclamo: loop/50, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 221 pruebas (`node --test`), smoke (77 pasos), i18n (0 errores) en verde; e2e y auditoría no corridas (el cambio no toca la página ni el escritorio).
- **Siguiente:** iteración 51, mantenimiento · QA: pendiente 16 (Repo local de 1.000 ramas en árabe (iteración 35): el primer arranque en frío t…)

### 2026-10-14 · Iteración 51 · Mantenimiento · QA

- **Auditoría de QA: el pendiente 16 no era un fallo y el 17 se arregló** (pendientes 16 y 17 de entonces). Repo local de 1.000 ramas con `--lang=es`, `ar` y `ta` en la app de escritorio: `#status` sale de «cargando» con 40 ramas (el presupuesto de un ciclo) y llega a 1.001 entre 0,3 y 0,5 s después, igual que en GitHub; el 22 s del pendiente era el primer arranque en frío de Electron (14,7 s la primera vez, 1,3–1,6 s las siguientes, en los tres idiomas), no el repo ni el idioma. Se quitó de la lista y el arranque en frío quedó como pendiente 18. Arreglo: la auditoría completa con `--langs` contaba como nuevo cada control ya conocido en otro idioma (`conocido()` en `tools/audit.mjs`): de 135 fuera de la base pasó a 3.
- **Reproducción:** `node --test tools/audit.test.mjs` sin el arreglo → `SyntaxError: The requested module './audit.mjs' does not provide an export named 'conocido'`; en la auditoría, `node tools/audit.mjs --langs` → `135 hallazgos (0 Alta), 111 fuera de la base`.
- **Hallazgos:** 3 nuevos (pendientes 17, 18 y 19), 0 a la base de la auditoría
- **Pruebas que fallan sin el arreglo:** `tools/audit.test.mjs` («--langs: un control conocido en un idioma de celular es conocido en los demás, pero no en otro escenario»).
- README: sin cambios (herramienta del loop).
- QA: auditoría completa con `--langs` (solo `objetivo-chico`, ya conocidos; medidas dentro de presupuesto); smoke tres veces en verde (con `PLAYWRIGHT_CHROMIUM_PATH`, ver pendiente 19); 1.000 ramas locales en es, ar y ta en escritorio. Sin mirar a mano esta vez: sin red, cuota agotada, 3D, Replay y modo TV a 320 px; auditoría: 3 `objetivo-chico` de `celular-320` fuera de la base (pendiente 17).
- Reclamo: loop/51, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 222 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 52, expansión: ítem 25 (GitLab propio, Fuentes)

### 2026-10-14 · Iteración 52 · Expansión · Fuentes

- **Capacidad nueva: GitLab propio** (ítem 25 de la hoja de ruta, partido: esta es la primera entrega; el reconocimiento de URLs y los avatares quedan como ítem 35). `GitLabSource` toma `webUrl` (`?gitlab=` en la web, `--gitlab-url=` en escritorio, solo https y sin usuario): la API, los enlaces y el token van a esa instancia; una dirección inválida vuelve a gitlab.com. La app de escritorio suma solo ese host a `connect-src`; el CSP de la web no cambia.
- **Pruebas que fallan sin la capacidad:** `tools/gitlab.test.mjs` («un GitLab propio: todo sale de su host…» y «…no muestra avatares…»); e2e de escritorio «--gitlab-url suma solo ese host al CSP…».
- README: la función en la lista, el comando de ejemplo, Límites conocidos y Seguridad (CSP y tokens).
- QA: filas de fuentes, token y CSP: lo cubren las pruebas con API simulada (subruta incluida) y la e2e de escritorio; sin mirar a mano esta vez: tema, 320 px, 3D, Replay (no cambia la interfaz); auditoría: no toca la página visible.
- Reclamo: loop/52, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 224 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 53, expansión: ítem 26 (Una organización entera, tercera entrega, Escala)

### 2026-10-14 · Iteración 53 · Expansión · Escala

- **Capacidad nueva: los eventos de la organización en el panel** (ítem 26 de la hoja de ruta, partido: esta es la primera parte; los grupos de GitLab y la constelación pasan al ítem 41). `GitHubSource.orgFeed(owner)` pide `/orgs/{org}/events` (una consulta con ETag, cada 5 minutos, con la pestaña a la vista y sin pausa) y devuelve solo lo nuevo; la app lo suma al panel con el nombre de su repo, solo para repos sin pestaña propia. Un usuario (404) no da nada. Sin textos nuevos (reusa los de los eventos): i18n sin cambios. No está en la demo (no tiene organización).
- **Pruebas que fallan sin la capacidad:** `tools/github.test.mjs` («eventos de una organización…», dos pruebas); smoke, paso «los eventos de la organización llegan al panel…».
- README: la función, el apartado de la organización seguida, Límites conocidos.
- QA: filas de token (va solo a su API, mismo `api()`), XSS (el panel escapa todo con `U.esc`; sin `innerHTML` nuevo), CSP sin cambios; sin mirar a mano: 320 px, 3D, Replay (no cambia la interfaz); auditoría: 0 hallazgos nuevos.
- Reclamo: loop/53, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 226 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde. La primera corrida falló una e2e de escritorio sin relación (repo local); la repetición pasó y quedó como pendiente 3 `[Deuda]`.
- **Siguiente:** iteración 54, expansión: ítem 27 (Replay por tramo de fechas y con rótulos propios, Salidas)

### 2026-10-14 · Iteración 54 · Expansión · Salidas

- **Capacidad nueva: el Replay por tramo de fechas y con rótulos propios** (ítem 27 de la hoja de ruta). Un botón de calendario en la barra del Replay abre un formulario con Desde, Hasta, Título y Pie de foto: el Replay (y su video) cubre solo los commits del tramo, con la línea de tiempo y las marcas ajustadas a él, y el título y el pie se ven sobre el grafo y entran al video (`extra` de la grabación). Un tramo sin commits avisa y deja el Replay como estaba; «Toda la historia» lo quita. La lógica del tramo es `Replay.rangeOf` (pura). Sin consultas nuevas a la API; visible en la demo.
- **Pruebas que fallan sin la capacidad:** `tools/replay.test.mjs` (3 pruebas del recorte por fechas); smoke, paso «replay: tramo de fechas y rótulos propios».
- README: la función (Replay y su botón), la lista de controles, Límites conocidos y la lista de pruebas.
- QA: filas de XSS (título y pie van con `textContent`, sin `innerHTML` nuevo), CSP sin cambios, teclado (Esc cierra el formulario y devuelve el foco al botón), i18n (8 textos en los 40 idiomas); sin mirar a mano: 320 px, tema claro/oscuro, RTL, 3D; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/54, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 229 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde. La primera corrida falló un paso del smoke sin relación (cambios de un commit); la repetición pasó y quedó anotado en el pendiente 2 `[Deuda]`.
- **Siguiente:** iteración 55, mantenimiento · Deuda: pendiente 1 (Smoke: una vez (iteración 27, corrida completa con `--langs`) el cuadro de la m…)

### 2026-10-14 · Iteración 55 · Mantenimiento · Deuda

- **Arreglo: medida y causa probable de la intermitente del video del Replay** (pendiente 1, sigue abierto: no se mostró el arreglo, así que no se toca el código). Cinco corridas simultáneas de `node tools/smoke.mjs --langs`: el paso «graba el Replay en video, de principio a fin» falló 1 de 5 con 1, 1, 1 colores (video liso); la causa probable queda anotada en el pendiente. Se probó una prueba con `Emulation.setCPUThrottlingRate` (20×, 60×, 200×): no falla sin el arreglo, y se descartó.
- **Reproducción:** `for i in 1 2 3 4 5; do node tools/smoke.mjs --langs & done; wait` → `✗ graba el Replay en video, de principio a fin: el video casi no tiene dibujo: 1, 1, 1 colores al 25, 50 y 75 %`.
- **Pruebas que fallan sin el arreglo:** ninguna todavía (ver el pendiente 1).
- README: sin cambios.
- QA: no toca la página; auditoría: no toca la página.
- Reclamo: loop/55, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: solo documentación; `node --test` (230) y `node tools/loop.mjs --check` en verde.
- **Siguiente:** iteración 56, expansión: ítem 28 (Ejercicios de Aprender git compartidos por URL, Público)

### 2026-10-14 · Iteración 56 · Expansión · Público

- **Capacidad nueva: ejercicios de Aprender git compartidos por URL** (ítem 28 de la hoja de ruta). La práctica de git abre con `?practice=<código>`: un ejercicio propio (título, meta, comandos de partida y condiciones de una lista cerrada) va entero en la URL, sin servidor, y se vuelve a validar al abrirlo (`cleanExercise`; nunca se evalúa como código). «Crear un ejercicio para compartir» lo arma desde la propia terminal y «Copiar enlace del ejercicio» da el enlace; `?practice=1` a `4` abre uno de la lista. Un código inválido se descarta y abre la demo. Aviso para quien toque la terminal: con más de un campo, el formulario ya no envía solo al pulsar Enter; la línea de comandos lo hace explícito.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (4 pruebas: ida y vuelta por la URL, parte sin resolver y no se resuelve con el atajo equivocado, números de la lista y basura, ejercicios mal hechos); smoke, paso «un ejercicio propio se crea, se comparte por URL y la URL lo abre y se resuelve».
- README: la función, Límites conocidos, Seguridad y la lista de pruebas.
- QA: filas de XSS (título y meta con `textContent`; una `<b>` en el título no se interpreta, el smoke lo mira), CSP sin cambios, teclado (la línea de comandos sigue enviando con Enter), i18n (16 textos en los 40 idiomas); sin mirar a mano: 320 px, 3D, Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/56, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 234 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde. La primera corrida del smoke falló los pasos de la práctica: con más de un campo el formulario no enviaba con Enter, y el enlace pasaba el ejercicio en vez de su especificación; los dos arreglados en esta rama.
- **Siguiente:** iteración 57, expansión: ítem 29 (Filtrar el grafo por ruta de archivo, Análisis)

### 2026-10-14 · Iteración 57 · Expansión · Análisis

- **Capacidad nueva: filtrar el grafo por ruta de archivo** (ítem 29 de la hoja de ruta). En el cuadro de la lupa, un campo de ruta y «Filtrar grafo» (o Enter): `GitHubSource.commitsByPath` hace una consulta `/commits?path=` por cabeza (la rama por defecto primero, 5 como mucho) y los commits cargados que la tocaron quedan a plena luz mientras el resto del grafo 2D se atenúa (`Graph.setPathFilter`, clase `pfx`). La lupa se marca mientras hay filtro; «Quitar filtro» y cambiar de pestaña o de repo lo deshacen. La demo compara la ruta con el mensaje del commit (no tiene archivos); las demás fuentes dicen que no pueden. Sin filtro no hay ninguna consulta nueva.
- **Pruebas que fallan sin la capacidad:** `tools/github.test.mjs` (`commitsByPath`: una consulta por cabeza con la ruta codificada, solo commits cargados, ruta vacía sin gasto); smoke, paso «filtro por ruta: atenúa los commits que no la tocaron, lo dice y se quita».
- README: la función, Límites conocidos y Seguridad.
- QA: filas de XSS (la ruta solo va a la URL codificada y a `textContent`), cuota (≤ 5 consultas por filtro, solo al pedirlo), teclado (Enter aplica; los botones se alcanzan con Tab), i18n (8 textos en los 40 idiomas); sin mirar a mano: 320 px, 3D (el filtro es solo 2D), Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/57, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 235 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 58, expansión: ítem 30 (Los forks en el grafo, Datos)

### 2026-10-14 · Iteración 58 · Expansión · Datos

- **Capacidad nueva: los forks activos** (ítem 30 de la hoja de ruta). `GitHubSource.syncForks` pide `/forks` solo al abrir el panel de salud (una consulta, no más de una cada 15 minutos; la auditoría de cuota la dejó fuera de la carga) y `data.forks` guarda los de push propio en los últimos 90 días (hasta 30, el más nuevo primero; sin archivados ni URL que no sea https). El panel de salud abre con la lista (`health.compute` → `forks`), cada fila un enlace al fork con `rel="noopener noreferrer"`; la demo trae 2. Primera entrega: el dibujo de los forks como ramas atenuadas en el grafo queda fuera (pediría la historia de cada fork), dicho en el README y en la hoja.
- **Pruebas que fallan sin la capacidad:** `tools/github.test.mjs` (2: filtro de actividad, orden, archivados y URL mala, una consulta por 15 minutos; sin la API); `tools/health.test.mjs` (forks y su tiempo); smoke, paso «salud del repo» (2 forks con enlace https).
- README: la función, Límites conocidos y Seguridad.
- QA: filas de XSS (nombre y URL escapados, solo https), cuota (0 al cargar; 1 al abrir el panel, cada 15 min como mucho), i18n (1 texto en los 40 idiomas); sin mirar a mano: 320 px, 3D, Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/58, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 238 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde. La primera corrida de la puerta falló: el smoke y la auditoría contaron la consulta `/forks` de más al cargar; pasó a pedirse solo al abrir el panel.
- **Siguiente:** iteración 59, mantenimiento · Seguridad: pendiente 9 (`parseRepo` acepta `..` como owner o nombre de un repo de GitHub (`util.js:39`;…)

### 2026-10-14 · Iteración 59 · Mantenimiento · Seguridad

- **Arreglo: `parseRepo` rechaza `.` y `..` como owner o nombre de un repo de GitHub** (pendiente 9). Antes `../x` o `x/..` pasaban y llegaban a la ruta `/repos/<owner>/<name>` de la API; ahora devuelven `null`, como ya hacían GitLab, Bitbucket y Codeberg. Nombres con puntos válidos (`.github/.github`, `a.b/c-d.js`) siguen igual. Mismo patrón en el resto: los demás `parseRepo` ya lo filtraban.
- **Reproducción:** `node --test tools/local.test.mjs` → `not ok 8 - parseRepo rechaza owner o nombre hechos solo de puntos (.., .) en GitHub` (`../x`).
- **Pruebas que fallan sin el arreglo:** `tools/local.test.mjs` (parseRepo con `..`, `.`, URL y ssh de GitHub).
- README: sin cambios (comportamiento interno de validación).
- QA: fila de XSS/entrada: la entrada se valida antes de tocar la red; auditoría: no toca la página más que `util.js`, ver Validado.
- Reclamo: loop/59, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 239 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 60, expansión: ítem 31 (Ensayar un comando sobre el repo real, Público)

### 2026-10-14 · Iteración 60 · Expansión · Público

- **Capacidad nueva: ensayar un comando sobre el repo real** (ítem 31 de la hoja de ruta). Con un repo real cargado aparece «Ensayar un comando»: abre la terminal de práctica sobre `gitsim.fromData`, una copia en memoria de las ramas y commits que el grafo ya tiene (los padres no cargados se descartan, las ramas sin commit cargado no entran). `merge`, `rebase`, `reset`, etc. se ven en el grafo 2D y 3D; el repo real no se toca, no hay consultas a la API y al volver a su pestaña el ensayo se cierra. «Reiniciar» rehace la copia; no ofrece crear ni compartir ejercicios.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (`fromData: copia un repo real…`) y el paso del smoke «ensayar un comando: la copia del repo real cambia sin tocar al original ni gastar cuota».
- README: función en la lista de «Aprender git», pruebas, Límites conocidos (solo lo cargado) y Seguridad (no guarda nada ni usa el token). Mapa de alcance: fila Público. Hoja de ruta repuesta a 15 (ítem 78).
- QA: fila de XSS/entrada (el mensaje con HTML entra con `textContent`, lo mira el smoke), repo sin ramas (el botón se esconde) y demo (no aparece); 40 idiomas por `check-i18n`; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/60, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 240 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 61, expansión: ítem 32 (Ramas apiladas, Datos)

### 2026-10-14 · Iteración 61 · Expansión · Datos

- **Capacidad nueva: ramas apiladas** (ítem 32 de la hoja de ruta). `Layout.stackedPulls` detecta los PRs abiertos del mismo repo cuya base es la rama de otro PR (los ciclos no apilan) y `compute` ordena los carriles para que cada rama quede justo debajo de la de su base, en el orden de la pila (`L.stacks`). El detalle de la rama dice «Apilada sobre el PR #N» (`tip.stacked`, 40 idiomas) y la demo trae una pila (`feature/dark-mode` sobre `feature/login`).
- **Pruebas que fallan sin la capacidad:** `tools/layout.test.mjs` (4: sin pila, pila de tres contigua y en orden, ciclo de bases, base sin PR propio); sin `stackedPulls` fallan las 4.
- README: la función en la lista y Límites conocidos (solo orden y detalle, sin línea entre ramas). Mapa de alcance: fila Datos.
- QA: fila de XSS (el nombre de la rama entra por `i18n.html` escapado), cuota (0 consultas nuevas: usa los PRs ya cargados) y i18n (1 texto en los 40 idiomas); sin mirar a mano: 320 px, 3D, Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/61, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 244 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 62, expansión: ítem 33 (Vista de texto, segunda entrega, Público)

### 2026-10-14 · Iteración 62 · Expansión · Público

- **Capacidad nueva: vista de texto, segunda entrega** (ítem 33 de la hoja de ruta). Con la vista de texto abierta, cada actualización en vivo redibuja el árbol sin perder el foco ni las ramas abiertas y una región `role="status"` (`aria-live="polite"`) anuncia «Novedades: n ramas, m commits» solo de lo que no se había leído (`textview.news` lleva las ramas y los SHA ya vistos). Un campo «Filtrar ramas…» (↓ pasa al árbol) deja las ramas cuyo nombre contiene el texto y anuncia cuántas quedan, sin anunciar cada tecla. 2 textos nuevos en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` (`news solo cuenta…`, `filter deja…`) y el paso del smoke «vista de texto: filtra por rama y avisa en la región viva de lo nuevo sin repetir» (con un commit en vivo de la demo).
- README: función en la lista, Límites conocidos (cómo se probó: solo ARIA y teclado con Playwright, ningún lector real) y Seguridad. Mapa de alcance: fila Público.
- QA: filas de XSS (todo con `textContent`), foco (se conserva al actualizar), teclado (filtro y ↓) y 40 idiomas por `check-i18n`; sin mirar a mano: 320 px, tema claro, movimiento reducido; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/62, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 246 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 24 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 63, mantenimiento · Accesibilidad: pendiente 4 (Objetivos chicos y estados confusos. `audit:objetivo-chico` (24 hallazgos conoc…)

### 2026-10-14 · Iteración 63 · Mantenimiento · Accesibilidad

- **Auditoría de Accesibilidad: objetivos táctiles del filtro de ramas y de la casilla de los logros** (pendiente 4, parte). `#branch-filter` y la etiqueta de `#game-enable` (`.tr-toggle`) tenían 19 px de alto; ahora `min-height: 24px` (WCAG 2.5.8). Salen 8 hallazgos `objetivo-chico` de la base (24 → 16); el pendiente 4 sigue con las etiquetas de rama, la barra del Replay y la brújula.
- **Reproducción:** `node tools/audit.mjs --puerta` → `objetivo-chico|…|#branch-filter` y `|dialogos|#game-enable` a 19 px antes del arreglo; después, «8 ya no aparecen».
- **Pruebas que fallan sin el arreglo:** la puerta de la auditoría (`tools/audit.mjs --puerta`, dentro de `npm run check`): la base ya no tolera esos 8 hallazgos.
- README: sin cambios (no cambia ninguna función).
- QA: fila de accesibilidad/objetivos táctiles por la auditoría en escritorio, 320 px y diálogos; sin mirar a mano: lector de pantalla real; auditoría: 0 hallazgos nuevos, 16 conocidos.
- Reclamo: loop/63, sin colisión
- Nota: el smoke falló 4 pasos en una corrida sobre `master` (Replay en video, vista de texto, búsqueda de commits, filtro por ruta: esperas agotadas) y pasó en las siguientes; es la intermitencia de la Deuda ya anotada, sin cambio de código aquí.
- Validado: 246 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 64, expansión: ítem 34 (Filtrar el grafo por autor, Análisis)

### 2026-10-15 · Iteración 64 · Expansión · Análisis

- **Capacidad nueva: filtrar el grafo por autor** (ítem 34 de la hoja de ruta). En el cuadro de búsqueda, «Mostrar solo las ramas de…» deja en el grafo (2D y 3D) y en la vista de texto la rama por defecto y las ramas con algún commit de esa persona que la rama por defecto no tiene (`GB.search.byAuthor`, sobre los datos ya cargados, sin consultas); los PR de las ramas quitadas se van con ellas. Se guarda por repo, avisa cuántas ramas quedan (región viva) y subraya la lupa mientras hay filtro.
- **Pruebas que fallan sin la capacidad:** `tools/search.test.mjs` (2: `byAuthor`) y una prueba por fuente en `tools/gitlab.test.mjs`, `tools/bitbucket.test.mjs` y `tools/codeberg.test.mjs`; el paso del smoke «filtro por autor: el grafo y el árbol de texto muestran solo sus ramas, lo dice y se quita».
- README: función en la lista (Búsqueda de commits), Límites conocidos y Seguridad. Mapa de alcance: fila Análisis. Textos en los 40 idiomas (2 claves).
- QA: filas de XSS (nombres de autor con `textContent`), cuota (0 consultas nuevas), teclado (selector con etiqueta) y 40 idiomas por `check-i18n`; GitHub y local usan los mismos datos normalizados (sin prueba propia); sin mirar a mano: 320 px, tema claro, movimiento reducido; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/64, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 251 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 65, expansión: ítem 35 (GitLab propio, segunda entrega, Fuentes)

### 2026-10-15 · Iteración 65 · Expansión · Fuentes

- **Capacidad nueva: GitLab propio, segunda entrega** (ítem 35 de la hoja de ruta). `U.parseRepo` reconoce las URL de la instancia de `?gitlab=`/`--gitlab-url=` (https y `git@host:`, con ruta y `/-/tree/…`), solo ese host y por prefijo exacto; las claves guardadas de un GitLab propio llevan su host (`gitlab@host:`), aparte de las de gitlab.com; y en escritorio los avatares de ese host salen (`avatars: true` y su `img-src`).
- **Pruebas que fallan sin la capacidad:** `tools/gitlab.test.mjs` («parseRepo reconoce las URL de un GitLab propio…» y «…avatares solo si se piden…»); e2e de escritorio «--gitlab-url suma solo ese host al CSP…» (ahora también `img-src`).
- README: la función en la lista, Límites conocidos y Seguridad (CSP). Mapa de alcance: fila Fuentes. Hoja de ruta repuesta a 15 con ideas de partes de ítems ya hechos y de la investigación del 2026-10-13 (ítems 45–50).
- QA: filas de XSS (el texto de la URL solo entra a parseRepo, que lo valida), CSP (el escritorio suma solo el host elegido) y tokens (sin cambios); sin mirar a mano: tema, 320 px, 3D, Replay (no cambia la interfaz); auditoría: 0 hallazgos nuevos.
- Reclamo: loop/65, sin colisión
- Nota: `git push origin --delete loop/52` falló con «unexpected disconnect» del proxy; las `loop/52`–`loop/64` fusionadas siguen en origin (ya en Para Benjamin).
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 253 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 66, expansión: ítem 38 (Vocabulario DORA en la salud, Análisis)

### 2026-10-15 · Iteración 66 · Expansión · Análisis

- **Capacidad nueva: vocabulario DORA en la salud** (ítem 38 de la hoja de ruta). El panel de salud suma «Entrega (DORA)»: despliegues en 30 días (cada release cuenta como uno), mediana entre los últimos 10 releases y tiempo de entrega (mediana de abierto a fusionado), con lo ya cargado y sin consultas (`GB.health.compute(...).dora`). El tiempo va de la apertura del PR a su fusión, no desde su primer commit (pediría una consulta por PR); dicho en Límites conocidos.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («DORA: despliegues en 30 días…») y el paso del smoke de salud (dos líneas de entrega en la demo).
- README: función en la lista (Salud del repo), mapa de archivos y Límites conocidos. Mapa de alcance: fila Análisis. Textos en los 40 idiomas (3 claves).
- QA: filas de XSS (solo cifras y duraciones formateadas, sin texto de afuera), cuota (0 consultas nuevas) y 40 idiomas por `check-i18n`; sin mirar a mano: 320 px, tema claro, movimiento reducido; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/66, sin colisión
- Nota: `git push origin --delete loop/53` falló con «the remote end hung up unexpectedly» (proxy); las `loop/28`–`loop/65` fusionadas siguen en origin (ya en Para Benjamin).
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 254 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 67, mantenimiento · Deuda: pendiente 1 (Smoke: una vez (iteración 27, corrida completa con `--langs`) el cuadro de la m…)

### 2026-10-15 · Iteración 67 · Mantenimiento · Deuda

- **Arreglo: el grabador del Replay arranca con el primer cuadro dibujado** (pendiente 1). `snapshot.record` llamaba a `rec.start` antes de que `capture` armara el primer cuadro, así que el canvas de salida estaba liso del color del fondo y, con la máquina cargada, el video podía salir con un tramo vacío (`1, 1, 1 colores al 25, 50 y 75 %`). Ahora `rec.start` corre al dibujarse el primer cuadro, y la duración se mide desde ese momento.
- **Reproducción:** `node tools/smoke.mjs` (con `js/snapshot.js` sin el arreglo) → `✗ graba el Replay en video, de principio a fin: el grabador arrancó con el canvas vacío: 1 colores al empezar`.
- **Pruebas que fallan sin el arreglo:** el paso del smoke «graba el Replay en video, de principio a fin» ahora mide los colores del canvas en el instante en que arranca `MediaRecorder` (pide al menos 100).
- README: sin cambios (no cambia lo que hace la función).
- QA: fila de Replay en video (los dos pasos de grabación del smoke); sin mirar a mano: 320 px, tema claro; auditoría: 0 hallazgos nuevos.
- Nota: una corrida del smoke falló una vez en «lo que llega mientras se ve la 2D no se acumula para la 3D» (`waitForFunction` de 30 s) y no se repitió; sin relación con el cambio.
- Reclamo: loop/67, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 254 pruebas (`node --test`), smoke (84 pasos), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 25 e2e en verde.
- **Siguiente:** iteración 68, expansión: ítem 36 (Gitea y Forgejo propios, Fuentes)

### 2026-10-15 · Iteración 68 · Expansión · Fuentes

- **Capacidad nueva: Forgejo y Gitea propios** (ítem 36 de la hoja de ruta). `?forge=https://host` (o `--forge-url=` en escritorio) deja seguir repos de un servidor propio con la fuente de Codeberg (`CodebergSource({ webUrl })`, `endpoints`): API v1 en `host/api/v1`, enlaces al host, repos como `forgejo:dueño/repo` o por su URL (https o `git@host:`, por prefijo exacto), claves `forgejo@host:…` aparte de las de codeberg.org, etiqueta Forgejo. Sin token, solo ese host; el `html_url` que dé el servidor solo se acepta si cuelga de él. En escritorio el CSP suma solo ese host a `connect-src` y `img-src` (con sus avatares); en la web, sin avatares. Avisos propios sin nombrar a Codeberg (7 claves nuevas).
- **Pruebas que fallan sin la capacidad:** `tools/codeberg.test.mjs` (la API simulada con otra URL base: `endpoints`, `parseRepo`, carga solo contra ese host, avatares, html_url ajeno, textos de error) y la e2e de escritorio «--forge-url suma solo ese host al CSP…».
- README: función en la lista, comando de escritorio, Límites conocidos (Codeberg y propios), CSP y token. Mapa de alcance: fila Fuentes. Textos en los 40 idiomas (7 claves).
- QA: filas de XSS (nada de afuera entra sin escapar; el host solo pasa por `new URL`), token (ninguna consulta lleva `Authorization`), CSP (`pwa.test` sigue cerrado; la e2e comprueba el host elegido y que sin https se ignora) y 40 idiomas por `check-i18n`; sin mirar a mano contra un servidor real, 320 px ni tema claro (no cambia la interfaz); auditoría: 0 hallazgos nuevos.
- Nota: `git push origin --delete loop/55` (y siguientes) lo negó el clasificador de permisos de la sesión; las `loop/28`–`loop/67` fusionadas siguen en origin (ya en Para Benjamin). El clon de la sesión venía superficial (`--depth`) y R3 de `--check` falló hasta `git fetch --unshallow`.
- Reclamo: loop/68, sin colisión
- Web publicada: 404, has_pages=false (Pages sin activar, ya en Para Benjamin)
- Validado: 261 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 69, expansión: ítem 39 (PRs por estado, Análisis)

### 2026-10-15 · Iteración 69 · Expansión · Análisis

- **Capacidad nueva: PRs por estado en la salud** (ítem 39 de la hoja de ruta). El panel de salud agrupa los PRs abiertos en borrador, con los checks en rojo, aprobados y esperando revisión (precedencia en ese orden; el rojo sale de `pull.ci` o del estado de su rama), cada fila con su salto al grafo. GitHub con token trae `reviewDecision` en la misma consulta GraphQL (sin consultas nuevas); la demo muestra los tres primeros estados. 5 claves nuevas en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («PRs por estado…») y un paso nuevo en el smoke del panel de salud de la demo.
- README: función en la lista, mapa de archivos y Límites conocidos (sin token o en otras fuentes, nada queda «aprobado»). Mapa de alcance: fila Análisis.
- QA: filas de XSS (los títulos entran por `U.esc`), token (la consulta es la misma, solo suma un campo) y 40 idiomas por `check-i18n`; sin mirar a mano 320 px ni tema claro.
- Nota: el clon de la sesión venía superficial; R3 y 2 pruebas de `loop.test.mjs` fallaban hasta `git fetch --unshallow`.
- Reclamo: loop/69, sin colisión
- Nota: el paso «cambios de un commit» del smoke falló en 2 de 5 corridas de `npm run check` con el cambio (y otros pasos en cascada cuando mi primer paso nuevo lanzaba con el diálogo abierto, ya corregido); el smoke suelto pasó 6 de 6 y la corrida final de la puerta salió en verde. Intermitencia a vigilar.
- Validado: 262 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 70, expansión: ítem 37 (Tokens para Codeberg y Bitbucket, Fuentes)

### 2026-10-15 · Iteración 70 · Expansión · Fuentes

- **Capacidad nueva: tokens para Codeberg y Bitbucket** (ítem 37 de la hoja de ruta). Dos campos nuevos en Ajustes (token de Codeberg con `Authorization: token …`, token de Bitbucket con `Authorization: Bearer …`), guardados como los demás (localStorage en la web; en escritorio cifrados con el llavero, servicios `codeberg` y `bitbucket` de `electron/token.js`). Cada token va en cada consulta (también la del diff) y solo a su host; un Forgejo/Gitea propio no recibe el de Codeberg. Con él se abren repos privados; guardar un token reconecta solo los repos de esa fuente.
- **Pruebas que fallan sin la capacidad:** `tools/codeberg.test.mjs` y `tools/bitbucket.test.mjs` (privado sin token → 404; con token, todas las consultas llevan la cabecera; el servidor propio no la recibe) y un paso nuevo del smoke por fuente (Ajustes → reconexión con la cabecera, y localStorage).
- README: lista de funciones, Límites conocidos (Codeberg/Bitbucket; sin aviso propio de «token rechazado»; propio sin token) y Seguridad (cada token a su servicio). Mapa de alcance: fila Fuentes. Textos en los 40 idiomas (10 claves, derivadas de las de GitLab; la ayuda de es y en, escrita aparte).
- QA: filas de token (el smoke comprueba cabecera y que el de GitHub no se mezcla), XSS (sin texto de afuera nuevo en el DOM) y 40 idiomas por `check-i18n`; sin mirar a mano 320 px ni tema claro.
- Nota: el clon de la sesión venía superficial; R3 y 2 pruebas fallaban hasta `git fetch --unshallow`.
- Reclamo: loop/70, sin colisión
- Validado: 264 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 71, mantenimiento · Errores: pendiente 4 (Replay: `wasPlaying` no se reinicia (`replay.js:79`), y la barra espaciadora so…)

### 2026-10-15 · Iteración 71 · Mantenimiento · Errores

- **Arreglo: Replay, `wasPlaying` y la barra espaciadora** (pendiente 4). `wasPlaying` se limpia al soltar la barra de posición y al salir del Replay: un cambio con las flechas del teclado ya no reanuda un Replay que el usuario había pausado. Y el espacio del panel del grafo no pausa el Replay si una etiqueta de rama ya lo gestionó (`ev.defaultPrevented`, `js/app.js`). Búsqueda del mismo patrón: los demás `keydown` de `app.js` ya miran `defaultPrevented` o excluyen controles.
- **Reproducción:** `node --test tools/replay.test.mjs` → `not ok 4 - un cambio de la barra con el teclado no reanuda un Replay en pausa` (sin el arreglo de `replay.js`).
- **Pruebas que fallan sin el arreglo:** `tools/replay.test.mjs` («un cambio de la barra con el teclado…»). El espacio sobre una etiqueta queda sin prueba propia (cambio de una condición).
- README: sin cambios (arreglo interno).
- QA: filas de Replay y de teclado; auditoría: 0 hallazgos nuevos (la puerta). Sin mirar a mano 320 px ni tema claro.
- Nota: el clon de la sesión venía superficial; R3 y 2 pruebas fallaban hasta `git fetch --unshallow`. El paso «cambios de un commit» del smoke falló en la primera corrida de `npm run check` y pasó al repetirla (anotado en el pendiente 1 `[Deuda]`). `git push origin --delete loop/58` falló por el proxy.
- Reclamo: loop/71, sin colisión
- Validado: 265 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 72, expansión: ítem 40 (Resaltar el tramo de cada rama comparada, Análisis)

### 2026-10-15 · Iteración 72 · Expansión · Análisis

- **Capacidad nueva: resaltar el tramo de cada rama comparada** (ítem 40 de la hoja de ruta). Al pulsar «Comparar» en el panel de salud, el grafo (2D y 3D) deja a la luz los commits que lleva cada rama por delante (anillo continuo la A, punteado la B) y el punto de separación más grande, y atenúa el resto; «Quitar el resaltado del grafo» lo apaga y cambiar de repo también. `health.compare` devuelve ahora los SHA de cada tramo; `Graph.setCompareMarks` y `Graph3D.setCompareMarks` los pintan.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («comparar dos ramas…», los `shas` de cada tramo) y un paso del smoke en la demo (nodos `cmp-a`/`cmp-b`, un único `cmp-base`, el resto atenuado, y «Quitar el resaltado» los deja en cero).
- README: la comparación y sus Límites conocidos (solo los commits ya dibujados).
- QA: comparar ramas en la demo (2D) por el smoke y a mano con Playwright; el 3D sin mirar a mano (sin GPU en la sesión); auditoría: 0 hallazgos nuevos.
- Nota: «Quitar el resaltado» no cierra el panel de salud (lo cerraba como las demás filas). El paso «cambios de un commit» del smoke falló una vez sin relación con el cambio y pasó al repetir `npm run check` (pendiente `[Deuda]` ya abierto).
- Nota: el clon de la sesión venía superficial; R3 y 2 pruebas fallaban hasta `git fetch --unshallow`. Chromium del smoke: `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- Reclamo: loop/72, sin colisión
- Validado: 265 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 73, expansión: ítem 41 (Una organización entera, cuarta entrega, Escala)

### 2026-10-15 · Iteración 73 · Expansión · Escala

- **Capacidad nueva: un grupo de GitLab entero** (ítem 41 de la hoja de ruta, cuarta entrega). `group:ruta` (con subgrupos) o la URL `gitlab.com/groups/ruta` (o la del GitLab propio) sigue los proyectos de actividad más reciente del grupo, en una consulta (`/groups/:id/projects`, `include_subgroups`), sin forks ni archivados, cada uno en su pestaña; también `?repo=group:ruta`. No queda seguido (sin renovación ni eventos del grupo). `U.parseGroup`, `GitLabSource.groupProjects` y `connectGroup`. La constelación pasa al ítem 52.
- **Pruebas que fallan sin la capacidad:** `tools/gitlab.test.mjs` («un grupo de GitLab entero…», «parseGroup…») y un paso del smoke (`group:g` con un fork y un archivado fuera, una sola consulta, se guarda `gitlab:g/sub/p`).
- README: la función en la lista, su uso y Límites conocidos (sin renovación ni eventos; constelación sin hacer).
- QA: conexión por grupo en el smoke con GitLab simulado y token solo a GitLab (la prueba del fake lo exige); auditoría: 0 hallazgos nuevos. Sin textos nuevos (reusa los avisos de organización).
- Nota: el clon de la sesión venía superficial; hizo falta `git fetch --unshallow`. Chromium: `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` con `xvfb-run`.
- Reclamo: loop/73, sin colisión
- Validado: 267 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 74, expansión: ítem 42 (Replay por tramo, segunda entrega, Salidas)

### 2026-10-15 · Iteración 74 · Expansión · Salidas

- **Capacidad nueva: el Replay por tramo, desde la URL** (ítem 42 de la hoja de ruta, segunda entrega). `?replay=2026-09-01..2026-09-14&title=Sprint%2012&footer=…` abre el repo y arranca el Replay con ese tramo y esos rótulos en cuanto llega la primera historia (una sola vez); cualquiera de las dos fechas puede faltar, `replay=1` es toda la historia, una fecha mal escrita se ignora y un tramo sin commits avisa. El formulario de la barra queda con los valores del enlace. La lectura es `Replay.paramsOf` (pura); título y pie se cortan a 80 y 120 y entran al DOM como texto, como antes. Sin consultas nuevas a la API.
- **Pruebas que fallan sin la capacidad:** `tools/replay.test.mjs` («la URL pide el Replay…», «el tramo de la URL admite un solo extremo…») y un paso del smoke con el enlace (el Replay arranca solo, con título, pie y tramo en el formulario).
- README: el Replay (el enlace y su ejemplo), la lista de pruebas y Límites conocidos (formato `AAAA-MM-DD`).
- QA: el enlace en la demo por el smoke; auditoría: 0 hallazgos nuevos. Sin textos nuevos.
- Nota: el clon de la sesión venía superficial; hizo falta `git fetch --unshallow`. El borrado de `loop/61` falló por el proxy (desconexión); las ramas `loop/*` fusionadas siguen en Para Benjamin.
- Reclamo: loop/74, sin colisión
- Validado: 269 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 16 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 75, mantenimiento · QA: pendiente 15 (La auditoría completa con `--langs` marca 3 `objetivo-chico` en `celular-320` q…)

### 2026-10-15 · Iteración 75 · Mantenimiento · QA

- **Auditoría de QA: la auditoría completa con `--langs`, de la que se arregla lo peor** (pendiente 15). `#branch-filter` ya medía 24 px desde antes; lo que quedaba en `celular-320` eran las etiquetas de rama 3D (22 px). Ahora miden 24 px: salen 12 hallazgos de la base (en los 40 idiomas, `escritorio-3d` y `galaxias-vuelo`). Además, `node tools/audit.mjs --json <ruta>` fallaba con `ENOENT` si la carpeta no existía (en una sesión nueva no hay `test-results/`): `guardarInforme` la crea.
- **Reproducción:** `node tools/audit.mjs --langs --json test-results/auditoria.json` → `ERROR: ENOENT: no such file or directory, open 'test-results/auditoria.json'` (sin la carpeta, tras ~145 s de auditoría).
- **Hallazgos:** 3 nuevos (pendientes 17, 18, 19), 0 a la base de la auditoría (la base baja de 16 a 4 hallazgos conocidos).
- **Pruebas que fallan sin el arreglo:** `tools/audit.test.mjs` («--json crea la carpeta del informe…»); las etiquetas 3D las vigila la auditoría de la puerta contra la base de 4.
- README: sin cambios (no hay función nueva).
- QA: auditoría completa `--langs` (solo `objetivo-chico`); etiquetas 3D a 24 px por la auditoría en los 40 idiomas y en vuelo; sin mirar a mano 1.000 ramas a 320 px (pendiente 19); auditoría: 0 hallazgos nuevos tras el arreglo.
- Reclamo: loop/75, sin colisión
- Validado: 270 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde (la primera corrida falló dos pasos del smoke sin relación con el cambio —pendiente 1—; la repetición salió 0).
- Nota: el clon venía superficial (`git fetch --unshallow`); `npm run check` borra `test-results/` al correr las e2e, así que su salida no puede ir ahí.
- **Siguiente:** iteración 76, expansión: ítem 43 (Ejercicios compartidos, segunda entrega, Público)

### 2026-10-15 · Iteración 76 · Expansión · Público

- **Capacidad nueva: ejercicios compartidos con pistas y condiciones más finas** (ítem 43 de la hoja de ruta). Un ejercicio propio admite hasta 3 pistas (160 caracteres cada una, en la URL como `h`): con pistas aparece el botón «Pista», que las muestra de una en una (con `textContent`). Dos condiciones nuevas en la lista cerrada: `tip:rama~texto` (el mensaje del último commit de la rama contiene el texto, sin distinguir mayúsculas) y `unmerged:a>b` (la rama tiene commits que la otra no). Los enlaces viejos siguen abriendo (las pistas son opcionales). Textos nuevos en los 40 idiomas (`practice.hint`, `practice.hintOf`, `practice.make.hints`, `practice.make.err.hints`) y la ayuda del formulario al día.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (pistas por la URL con sus límites, y `tip:`/`unmerged:` con rama inexistente y texto vacío); smoke, paso «un ejercicio propio con pistas: el botón las muestra una a una y la condición de mensaje lo resuelve».
- README: la función, Límites conocidos, Seguridad y la lista de pruebas.
- QA: filas de XSS (una `<b>` en una pista no se interpreta, el smoke lo mira), CSP sin cambios, teclado (el botón de pista es un `<button>`), i18n (4 textos en los 40 idiomas); sin mirar a mano: 320 px, 3D, Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/76, sin colisión
- Validado: 272 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- Nota: el clon venía superficial y `--check` daba R3 en rojo (y 2 pruebas); `git fetch --unshallow` lo arregla. El borrado de `loop/63` falló por desconexión del proxy; las ramas `loop/*` fusionadas siguen en Para Benjamin. La hoja de ruta se repuso con los ítems 53 a 58 (investigación del 2026-10-13, vigente).
- **Siguiente:** iteración 77, expansión: ítem 44 (Filtrar por ruta, segunda entrega, Análisis)

### 2026-10-15 · Iteración 77 · Expansión · Análisis

- **Capacidad nueva: filtrar por ruta, segunda entrega** (ítem 44 de la hoja de ruta). El grafo 3D también atenúa los commits que no tocaron la ruta (`Graph3D.setPathFilter`: esferas al 60 %, color hacia el fondo y halo casi apagado; sin filtro, nada cambia) y `?path=src/` abre el repo ya filtrado: `GB.search.pathParam` lee la ruta (recortada, sin barra inicial ni caracteres de control, hasta 200), se aplica una vez con la primera historia de la pestaña a la vista, y la URL guarda la ruta mientras haya filtro y la suelta al quitarlo o cambiar de pestaña. Sin textos nuevos (i18n sin cambios).
- **Pruebas que fallan sin la capacidad:** `tools/search.test.mjs` («pathParam lee ?path= de la URL…») y dos pasos del smoke: «filtro por ruta: el grafo 3D también recibe la ruta y la suelta al quitarla» y «abre ya filtrado, atenúa el grafo, mantiene la ruta en la URL y al quitarlo la suelta».
- README: la función (3D y URL), Límites conocidos y Seguridad.
- QA: XSS (la ruta de la URL entra al campo con `value`, nunca como HTML), CSP sin cambios, 2D y 3D (el smoke lo mira); sin mirar a mano: 320 px, Replay; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/77, sin colisión
- Nota: el clon venía superficial y `--check` daba R3 en rojo (y 2 pruebas); `git fetch --unshallow` lo arregla.
- Validado: 273 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 78, expansión: ítem 46 (Capa para streaming, segunda entrega, Plataformas)

### 2026-10-15 · Iteración 78 · Expansión · Plataformas

- **Capacidad nueva: capa para streaming, segunda entrega** (ítem 46 de la hoja de ruta). `?embed=1` acepta `&bg=00ff00` (un color hexadecimal de 3 o 6 cifras, para un croma en OBS; `&bg=transparent` sigue igual) y `&hide=notices,combo` (quita los avisos emergentes y el contador de combos de la capa). `GB.embedOptions` (en `js/i18n.js`) lee la URL y solo deja pasar `transparent`, un hex válido y los dos nombres conocidos; el color llega al CSS por una variable de `<html>`, sin tocar la CSP. Sin esos parámetros, la capa se ve como siempre. Sin textos nuevos (i18n sin cambios).
- **Pruebas que fallan sin la capacidad:** `tools/embed.test.mjs` (4 pruebas de la lectura de la URL) y dos pasos del smoke: «&bg=00ff00 pinta el fondo de verde y &hide=notices,combo esconde los avisos» y «sin &hide= los avisos siguen ahí».
- README: la función del widget y Seguridad (nada de la URL llega al CSS tal cual).
- QA: XSS/inyección en CSS (`bg=red`, `bg=url(x)` y `bg=12345` se descartan, la prueba lo mira), CSP sin cambios; sin mirar a mano: 320 px, Replay, 3D; auditoría: no toca la interfaz visible fuera de `?embed`.
- Reclamo: loop/78, sin colisión
- Nota: el clon venía superficial y `--check` daba R3 en rojo (y 2 pruebas); `git fetch --unshallow` lo arregla. El borrado de `loop/65` falló por desconexión del proxy.
- Validado: 277 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 79, mantenimiento · Rendimiento: pendiente 8 (Trabajo por cuadro: lecturas de tamaño que fuerzan maquetación en 3D y 2D (`pla…)

### 2026-10-15 · Iteración 79 · Mantenimiento · Rendimiento

- **Arreglo: trabajo por cuadro sin lecturas que fuerzan maquetación** (pendiente 8). `placeTip` (2D y 3D) leía `offsetWidth`/`offsetHeight` del tooltip en cada cuadro mientras seguía a su commit; ahora el tamaño se mide una vez por contenido y ancho (`tipBox`, se invalida al mostrar otro tooltip y al cambiar `W`). Replay creaba un `Intl.DateTimeFormat` nuevo por cuadro en `renderClock`; ahora usa `i18n.fmtDayLong`, que reutiliza el formateador en caché.
- **Reproducción:** `node --test tools/rendimiento.test.mjs` → sin el arreglo, 2 pruebas fallan («placeTip usa el tamaño en caché», «Replay reutiliza el formateador…»).
- **Pruebas que fallan sin el arreglo:** `tools/rendimiento.test.mjs` (2 pruebas).
- Medidas (`node tools/audit.mjs --repetir 3 --comparar`): consultas 10 → 10, nodosDOM 1313 → 1313, heapMB 13 → 13, tareasLargasMs 1186 → 1189, fps2d 54,2 → 52 / 56,4 en dos corridas (ruido). fps3d 9,7 → 8,3 / 8,6 (−11 % a −14 %): la medida no muestra tooltip ni Replay, así que el cambio no corre en ese camino; es ruido de Chromium sin GPU, pero queda anotado por pasar del 10 %.
- README: sin cambios (no cambia lo que hace la app).
- QA: tooltip 2D y 3D y reloj del Replay los cubre el smoke; auditoría: 0 hallazgos nuevos, 4 conocidos.
- Reclamo: loop/79, sin colisión
- Nota: el clon venía superficial y `--check` daba R3 en rojo (y 2 pruebas); `git fetch --unshallow` lo arregla. El borrado de `loop/66` falló por desconexión del proxy.
- Validado: 279 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 80, expansión: ítem 45 (Filtro por autor en la URL, Análisis)

### 2026-10-15 · Iteración 80 · Expansión · Análisis

- **Capacidad nueva: filtro por autor en la URL** (ítem 45 de la hoja de ruta). `?author=ana` abre el repo a la vista ya filtrado por esa persona (manda sobre lo recordado, solo al abrir; no en `?embed=1`) y la dirección sigue al selector «Mostrar solo las ramas de…» (también al cambiar de repo y al quitar el filtro). `GB.search.authorParam` lee el parámetro como texto (sin caracteres de control, hasta 100).
- **Pruebas que fallan sin la capacidad:** `tools/search.test.mjs` (`authorParam`) y el paso del smoke «Filtro por autor desde la URL (?author=)».
- README: lista de funciones (búsqueda), Límites conocidos y Seguridad.
- QA: filas de filtros y de URL: el smoke abre la demo con `?author=`, comprueba que acota el grafo, marca la lupa, mantiene y suelta la URL; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/80, sin colisión
- Nota: el borrado de `loop/67` falló por desconexión del proxy (las `loop/*` fusionadas siguen en Para Benjamin, punto 7).
- Validado: 280 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 81, expansión: ítem 47 (Resumen de la semana de una organización, Salidas)

### 2026-10-15 · Iteración 81 · Expansión · Salidas

- **Capacidad nueva: resumen de la semana de una organización** (ítem 47 de la hoja de ruta). Con 2 o más repos abiertos de una organización seguida (`org:nombre`), el panel de salud suma una ficha con los totales de la semana (commits, PRs fusionados, releases) y una sección por repo con actividad (hasta 20, por commits), como Markdown para copiar o guardar. Sin consultas nuevas: usa lo ya cargado de cada pestaña (`GB.digest.computeOrg` y `toMarkdownOrg`, en `js/digest.js`). Un texto nuevo en los 40 idiomas (`digest.org`).
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` (3 pruebas de la organización) y el paso del smoke «el resumen de la semana de la organización junta sus repos abiertos».
- README: la lista de funciones (salud), Límites conocidos y Seguridad.
- QA: filas del panel de salud y de Markdown/descarga: el smoke abre el panel con `org:acme` y baja el `.md`; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/81, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`). Un paso ajeno del smoke falló una vez y pasó al repetir (anotado en el pendiente 1 de Media). Los borrados de `loop/68` a `loop/80` siguen en Para Benjamin, punto 7.
- Validado: 283 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 82, expansión: ítem 48 (Tasa de fallos de CI en la salud, Análisis)

### 2026-10-16 · Iteración 82 · Expansión · Análisis

- **Capacidad nueva: tasa de fallos de CI en la salud** (ítem 48 de la hoja de ruta). El panel de salud suma «Fallos de CI»: de los PRs abiertos con checks ya resueltos, cuántos están en rojo (con el porcentaje) y cuántas veces la rama por defecto pasó a rojo en los últimos 30 días según la actividad ya cargada. Sin consultas nuevas. `GB.health.compute` devuelve `ci`; 3 textos nuevos en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` (tasa con checks pendientes fuera y fallos fuera de los 30 días) y el paso del smoke de la salud (`#hl-ci`).
- README: lista de funciones (salud), mapa de archivos y Límites conocidos.
- QA: fila del panel de salud: el smoke abre la demo y lee la sección; auditoría: la puerta la corre sobre la página.
- Reclamo: loop/82, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`). Un paso ajeno del smoke (modo TV) falló una vez y pasó en dos corridas aparte (anotado en el pendiente 1 de Media). El borrado de `loop/69` falló por desconexión del proxy; las `loop/*` fusionadas siguen en Para Benjamin, punto 7.
- Validado: 284 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 26 e2e en verde.
- **Siguiente:** iteración 83, mantenimiento · Deuda: pendiente 1 (Smoke: en `npm run check` bajo `xvfb-run` (iteración 36, el equipo cargado por …)

### 2026-10-16 · Iteración 83 · Mantenimiento · Deuda

- **Arreglo: smoke intermitente bajo carga** (pendiente 1 de Media, parcial). Los topes de espera (`timeout:`) del smoke pasan por `T()` (×3: las esperas a un estado vuelven al cumplirse, así que no cuestan nada con el equipo libre) y los pasos «un repo que no existe» de Codeberg y Bitbucket dejan de seguir `ana/nada`, como ya hacía el de GitLab: antes, al guardar el token se reconectaba y el 404 caía en el paso siguiente. El error de consola del smoke ahora lleva la URL que falló.
- **Reproducción:** `node tools/smoke.mjs` ×5 con 4 procesos al 100 % de CPU → antes: «vista 2D: page.waitForSelector: Timeout 10000ms exceeded.» y «el token de Codeberg de Ajustes va en cada consulta, solo a Codeberg: consola: Failed to load resource: … 404 (https://codeberg.org/api/v1/repos/ana/nada)» (igual en Bitbucket).
- **Pruebas que fallan sin el arreglo:** el propio smoke bajo carga: con topes ×3, 3 de 5 corridas en verde y las otras 2 solo con el 404 de `ana/nada` (arreglado después); una corrida posterior con carga extrema aún falla en cascada por `page.click` de 30 s (queda en el pendiente 1).
- README: no aplica (herramienta interna).
- QA: no toca la página; auditoría: no toca la página.
- Reclamo: loop/83, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); el Chromium de la sesión es otra versión (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
- Validado: 284 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- Web publicada: sin publicar (404, has_pages=false; está en Para Benjamin)
- **Siguiente:** iteración 84, expansión: ítem 49 (Extensión de VS Code, segunda entrega, Plataformas)

### 2026-10-16 · Iteración 84 · Expansión · Plataformas

- **Capacidad nueva: la extensión de VS Code sigue la sesión de GitHub con el panel abierto** (ítem 49 de la hoja de ruta, segunda entrega de la extensión). Antes el token se leía una sola vez al abrir el panel; ahora `vscode.authentication.onDidChangeSessions` avisa si la persona inicia, renueva o cierra sesión en GitHub: el servidor local cambia el token (`setToken`) y el panel recarga la página con el token nuevo; al cerrar sesión, `vscode-session.js` borra el token que había dejado en el almacenamiento de la página. Otros proveedores o un token igual no recargan nada, y al cerrar el panel se deja de escuchar.
- **Pruebas que fallan sin la capacidad:** `tools/vscode.test.mjs` («la extensión sigue la sesión de GitHub…») carga `vscode/extension.js` con un `vscode` simulado y cambia la sesión a mano; sin el cambio falla con `TypeError` (no existe `onDidChangeSessions` en la extensión).
- README: sección de la extensión al día (sigue la sesión) y Seguridad (el token se borra al cerrar sesión).
- QA: no toca la página (solo `vscode/`); auditoría: no toca la página. Hoja de ruta repuesta a 15 (ítems 59–64, partes de ítems ya hechos).
- Reclamo: loop/84, sin colisión
- Nota: el clon venía superficial y `--check` daba un R3 falso (`git fetch --unshallow` lo arregla); `git push origin --delete loop/71` falló con «unexpected disconnect» del proxy, así que las ramas `loop/*` fusionadas siguen en origin. La primera corrida de `npm run check` falló en 7 pasos del smoke (la tasa de fallos de CI en la salud y seis `page.click: Timeout 30000ms`, todos de la página, que este cambio no toca); la repetición pasó los 95 pasos: intermitencia del pendiente 1 de Media (smoke bajo carga).
- Validado: 285 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 85, expansión: ítem 50 (Bitbucket propio, Fuentes)

### 2026-10-16 · Iteración 85 · Expansión · Fuentes

- **Capacidad nueva: Bitbucket Data Center o Server propio como fuente** (ítem 50 de la hoja de ruta). `?bitbucket=https://host` (web) o `--bitbucket-url=` (escritorio) elige un servidor; sus repos se escriben `bitbucketdc:CLAVE/repo` (`~usuario` si es personal) o con su URL (`/projects/…/repos/…`, `/users/…`, `/scm/….git`). `js/sources/bitbucket-server.js` es una fuente nueva sobre la de GitHub y no un cambio de URL base de la de Cloud: la API REST 1.0 de Data Center es otra (`isLastPage`/`nextPageStart`, `commits?until=&since=`, `pull-requests`, `files?at=`, diff en JSON). Ramas (500), historia, force-push, PRs con borradores, galaxias y diff de un commit; sin cuota de plataforma (cada 20 s), sin avatares y **sin ningún token** (ni el de Bitbucket Cloud sale hacia ese host). Reusa los textos genéricos de «servidor» de Forgejo propio: ninguna clave nueva en los 40 idiomas. Electron: `--bitbucket-url` suma solo ese host a `connect-src` (nada a `img-src`) y pasa `?bitbucket=` a la página; la web lo suma el operador, como con `?forge=`. Sin hacer: token (ítem 65), eventos/tags/CI, probarlo contra un servidor real.
- **Pruebas que fallan sin la capacidad:** `tools/bitbucket-server.test.mjs` (10: endpoints, `parseRepo` por URL y prefijo, carga, repo personal, en vivo con push/rama/PR/force/borrado, más de 100 ramas, 404/401/403/429/500, árbol y diff, y que el token de Cloud no sale) y el caso `--bitbucket-url` de `e2e/desktop.spec.mjs`.
- README: lista de funciones, ejemplo de `npm start`, Límites conocidos (solo sin credenciales, sin tamaños de archivo) y Seguridad (CSP, ningún token al servidor propio).
- QA: filas tocadas: CSP (index.html no cambia; Electron suma solo el host de `--bitbucket-url` a `connect-src`); token solo a su API (prueba); XSS (textos por `textContent`, nada nuevo en `innerHTML`); 40 idiomas (`check-i18n`, sin claves nuevas); 404/401 y 429 (prueba). Sin mirar a mano: 320 px, 3D; auditoría: no toca la interfaz más allá de la etiqueta.
- Reclamo: loop/85, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso y dos pruebas de `loop.test.mjs`).
- Validado: 295 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 27 e2e en verde.
- **Siguiente:** iteración 86, expansión: ítem 51 (Tiempo de entrega desde el primer commit, Análisis)

### 2026-10-16 · Iteración 86 · Expansión · Análisis

- **Capacidad nueva: el tiempo de entrega de la salud cuenta desde el primer commit del PR** (ítem 51 de la hoja de ruta). Al abrir el panel de salud, `GitHubSource.syncFirstCommits` pide `/pulls/:n/commits?per_page=1` de cada PR fusionado reciente (hasta 20 con token, 8 sin él para cuidar los 60 por hora; una sola vez por PR; un PR que falla queda sin dato y no corta a los demás) y `health.compute` calcula la mediana desde esa fecha, o desde la apertura donde no se conoce. La línea nueva (`health.doraLeadCommit`) dice de cuántos PRs salió desde el primer commit; el tiempo «de abierto a fusionado» no cambia.
- **Pruebas que fallan sin la capacidad:** `tools/github.test.mjs` (dos: una consulta por PR sin repetir y con el 404 saltado; tope sin token) y `tools/health.test.mjs` («tiempo de entrega: desde el primer commit…»); sin el cambio fallan con `syncFirstCommits is not a function` y `leadSource` indefinido.
- README: salud del repo (la consulta y su tope) y Límites conocidos de la entrega (DORA).
- QA: filas tocadas: 40 idiomas (`health.doraLeadCommit` en todos, `check-i18n` en verde); token solo a su API (la consulta usa `this.api`); XSS (el texto sigue por `U.esc`); cuota (tope sin token). Sin mirar a mano: 320 px ni 3D; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/86, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso); `git push origin --delete loop/73` falló con «hung up unexpectedly» del proxy, así que las `loop/*` fusionadas siguen en origin.
- Validado: 298 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 27 e2e en verde.
- **Siguiente:** iteración 87, mantenimiento · Seguridad: pendiente 7

### 2026-10-16 · Iteración 87 · Mantenimiento · Seguridad

- **Arreglo: los tokens de la web ya no quedan en el `localStorage` compartido de `<usuario>.github.io`** (pendiente 7). Nuevo `U.secret` (`js/util.js`): en un host `*.github.io` el token de GitHub, GitLab, Codeberg y Bitbucket vive en `sessionStorage` (se pierde al cerrar la pestaña) y el que ya estuviera en `localStorage` se muda a la sesión y se borra; en otro origen sigue en `store`. La app de escritorio no cambia (llavero).
- **Reproducción:** `node --test tools/util.test.mjs` → sin el arreglo: `U.secret` indefinido (2 pruebas en rojo).
- **Pruebas que fallan sin el arreglo:** `tools/util.test.mjs` («U.secret: en <usuario>.github.io…» y «…en otro origen sigue en localStorage»).
- README: sección Seguridad y la línea del token.
- QA: filas tocadas: token solo a su API (el flujo de envío no cambia); desktop sin cambios. Sin mirar a mano: el texto de Ajustes sigue diciendo «solo en este navegador» (cierto en sesión). Auditoría: no toca la maquetación.
- Reclamo: loop/87, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso); borrar `loop/64`..`loop/86` fue denegado por el clasificador de permisos, así que siguen en origin.
- Validado: 300 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 27 e2e en verde.
- **Siguiente:** iteración 88, expansión: ítem 52 (Constelación de repos, Escala)

### 2026-10-17 · Iteración 88 · Expansión · Escala

- **Capacidad nueva: constelación de repos** (ítem 52 de la hoja de ruta). Un botón de la barra superior abre un diálogo donde cada repo seguido es una galaxia (un botón con un disco de dos brazos): más grande cuantos más commits cargados, color estable por nombre, marca de novedades sin ver y atenuada si el repo no está en vivo. La disposición (`place` en `js/constellation.js`) pone la mayor al centro y las demás en espiral dorada sin tocarse; Tab recorre las galaxias, Intro abre la pestaña del repo y Esc cierra. No hace ninguna consulta. En la demo se ve una sola galaxia.
- **Pruebas que fallan sin la capacidad:** `tools/constellation.test.mjs` (5 pruebas de la disposición) y el paso del smoke «se siguen hasta 10 repos a la vez» (10 galaxias con nombre, sin superponerse, foco y Intro).
- README: la función en la lista, `js/constellation.js` en la estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: diálogo con teclado y foco (smoke), 40 idiomas sin desbordar (smoke), textos con `textContent`; sin mirar a mano 320 px, RTL ni tema claro/oscuro más allá de la auditoría. Auditoría: 0 hallazgos nuevos.
- Reclamo: loop/88, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso); `git push origin --delete loop/75` falló con «hung up unexpectedly» del proxy. El smoke falló intermitente en dos corridas del cambio y en 1 de 2 sobre `master` limpio (pendiente 1); a la tercera, verde.
- Validado: 305 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 27 e2e en verde.
- **Siguiente:** iteración 89, expansión: ítem 53 (Frecuencia de despliegue en la salud, Análisis)

### 2026-10-17 · Iteración 89 · Expansión · Análisis

- **Capacidad nueva: frecuencia de despliegue por semana en la salud** (ítem 53 de la hoja de ruta). `compute` (`js/health.js`) suma `dora.weeks`: los releases ya cargados de cada una de las últimas 8 semanas (de la más vieja a la actual), y el panel de salud lo muestra bajo «Entrega (DORA)» (`#hl-weeks`). Sin consultas nuevas. Los tags y despliegues de GitHub no traen fecha en lo ya cargado, así que el despliegue sigue siendo el release.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («frecuencia de despliegue: releases por semana…» y la de DORA, que ahora exige `weeks`) y el paso del smoke de la salud (tres líneas de entrega, la de semanas con 8 cifras y algún release en la demo).
- README: salud del repo y Límites conocidos de la entrega (DORA).
- QA: filas tocadas: 40 idiomas (`health.doraWeeks`, `check-i18n` en verde); XSS (el texto sigue por `U.esc`, solo números); sin consultas nuevas. Sin mirar a mano 320 px ni RTL del panel más allá de la auditoría; auditoría: 0 hallazgos nuevos (corrida completa).
- Reclamo: loop/89, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso y dos pruebas de `loop.test.mjs`); `git push origin --delete loop/76` y `loop/77` fallaron con «hung up unexpectedly» del proxy, así que las `loop/*` fusionadas siguen en origin.
- Validado: 306 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 27 e2e en verde.
- **Siguiente:** iteración 90, expansión: ítem 54 (Resumen de la semana como imagen, Salidas)

### 2026-10-17 · Iteración 90 · Expansión · Salidas

- **Capacidad nueva: resumen de la semana como imagen** (ítem 54 de la hoja de ruta). El resumen de un repo suma «Guardar .png»: `digest.imageLines` arma las líneas (título, fechas, cifras y hasta 5 filas por lista, recortadas) y `digest.toCanvas` las dibuja con `fillText` en una tarjeta oscura de 1200 px (alineada a la derecha en idiomas RTL); se baja con `snapshot.download` como `graphbranch-<repo>-semana-<fecha>.png`. Sin consultas. El de la organización sigue solo en Markdown.
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` («la imagen del resumen…») y el paso del smoke del resumen (baja el `.png` y comprueba su firma).
- README: salud del repo, lista de funciones, Límites conocidos y Seguridad.
- QA: filas tocadas: 40 idiomas (`digest.png`, `check-i18n` en verde); texto de afuera solo por `fillText` (sin HTML); sin mirar a mano 320 px ni RTL del panel más allá de la auditoría.
- Reclamo: loop/90, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso); `git push origin --delete loop/77` falló con «hung up unexpectedly» del proxy.
- Validado: 307 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 4 conocidos) y 27 e2e en verde.
- **Siguiente:** iteración 91, mantenimiento · Accesibilidad: pendiente 3 (Objetivos chicos y estados confusos. `audit:objetivo-chico` (4 hallazgos conoci…)

### 2026-10-17 · Iteración 91 · Mantenimiento · Accesibilidad

- **Auditoría de Accesibilidad: objetivos táctiles de 24 px** (pendientes 3, parte, y 16). Las etiquetas de rama 2D (`.h-bg`, 22 → 24 px), las marcas de la brújula del vuelo (`.wd-mark`, 18 → 24 px, rombo centrado) y la barra del Replay (`.rp-range`, 16 → 24 px) cumplen WCAG 2.5.8. Los 4 hallazgos `objetivo-chico` salen de la base, que queda vacía. El pendiente 3 sigue con `aria-pressed` y la leyenda 2D.
- **Reproducción:** `node tools/audit.mjs --puerta` → 4 `objetivo-chico` conocidos antes del arreglo; después, «4 ya no aparecen».
- **Hallazgos:** 0 nuevos, 4 salen de la base de la auditoría.
- **Pruebas que fallan sin el arreglo:** la auditoría (`--puerta`) y su base vacía: un objetivo de menos de 24 px vuelve a ser hallazgo nuevo.
- README: sin cambios (no cambia ninguna función).
- QA: objetivos táctiles en 2D, vuelo y Replay medidos por la auditoría; sin mirar a mano el apilado de etiquetas 2D con 1.000 ramas; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/91, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); `git push origin --delete loop/78` falló con «hung up unexpectedly» del proxy, así que las `loop/*` fusionadas siguen en origin.
- Validado: 307 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 27 e2e en verde.
- **Siguiente:** iteración 92, expansión: ítem 55 (Práctica: cherry-pick y tag, Público)

### 2026-10-17 · Iteración 92 · Expansión · Público

- **Capacidad nueva: la práctica de git entiende `cherry-pick` y `tag`** (ítem 55 de la hoja de ruta). `cherry-pick <commit>` copia un commit encima de la rama actual (sin traer los demás; un commit de fusión o HEAD desprendido dan el error de git), `tag [nombre [commit]]` crea, lista y borra (`-d`) etiquetas ligeras, el `log` las muestra como `tag: v1` y las etiquetas valen como referencia. Quinto ejercicio guiado («Cherry-pick y etiqueta», `?practice=5`): llevar a `main` solo el arreglo urgente de `feature` y etiquetarlo `v1.0.1`. Textos en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (3 pruebas nuevas y la solución del ejercicio 5: `cherry-pick` sin traer el resto, `tag` crear/listar/borrar/decorar, y que fusionar o etiquetar a destiempo no resuelve el ejercicio) y un paso del smoke que abre `?practice=5`, copia el arreglo y lo etiqueta.
- README: función, ejercicios (cinco, `?practice=1` a `5`), Límites conocidos (etiquetas ligeras que el grafo no dibuja; sin rangos ni `-m`) y pruebas.
- QA: terminal de práctica con el smoke (comandos, HTML escapado, ejercicio resuelto, `?practice=5`); auditoría: 0 hallazgos nuevos; sin mirar a mano 320 px ni lector de pantalla del ejercicio nuevo.
- Reclamo: loop/92, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); el borrado de las `loop/79`–`loop/91` fusionadas lo negó el clasificador de permisos, así que siguen en origin.
- Validado: 310 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 27 e2e en verde.
- **Siguiente:** iteración 93, expansión: ítem 56 (Búsqueda en la URL, Análisis)

### 2026-10-18 · Iteración 93 · Expansión · Análisis

- **Capacidad nueva: la búsqueda de commits viaja en la URL** (ítem 56 de la hoja de ruta). `?q=texto` abre el repo con la lupa ya abierta y escrita, con sus resultados, una vez y con la primera historia; la dirección sigue al campo (se suelta al vaciarlo). El texto se lee sin caracteres de control y hasta 100, y entra con `value`, nunca como HTML. Sin textos nuevos.
- **Pruebas que fallan sin la capacidad:** `tools/search.test.mjs` (`queryParam`) y un paso del smoke («Búsqueda desde la URL (?q=)»: abre escrita, con resultados y foco, sigue al campo y lo suelta al vaciar).
- README: función, Límites y Seguridad (`?q=` como texto).
- QA: filas tocadas: dialog de búsqueda y foco con el smoke; texto de afuera por `value`; sin mirar a mano 320 px ni RTL; auditoría: 0 hallazgos nuevos.
- Reclamo: loop/93, sin colisión
- Hoja de ruta repuesta hasta 15 (ítems 66–71, continuaciones de ideas ya investigadas, con puntaje en `docs/investigacion.md`).
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso); el borrado de las `loop/80`–`loop/92` fusionadas falló con «hung up unexpectedly» del proxy.
- Validado: 311 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 27 e2e en verde.
- **Siguiente:** iteración 94, expansión: ítem 57 (Avisos a Microsoft Teams, Salidas)

### 2026-10-18 · Iteración 94 · Expansión · Salidas

- **Capacidad nueva: avisos a Microsoft Teams** (ítem 57 de la hoja de ruta). Un tercer webhook en Ajustes (solo escritorio) con los mismos eventos que Slack y Discord; el aviso viaja como tarjeta adaptable (`electron/webhooks.js`). Solo se acepta la URL de un flujo de Workflows (`*.logic.azure.com/workflows/…`, `*.environment.api.powerplatform.com/powerautomate/…`) o del conector heredado (`*.webhook.office.com/webhookb2/…`); el texto de GitHub entra con el Markdown escapado (sin `<at>` ni enlaces ajenos) y el enlace solo si es https. El título de la sección de Ajustes pasa a «Slack, Discord y Teams» en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/webhooks.test.mjs` (URL aceptadas y rechazadas, cuerpo de la tarjeta, envío y enrutado) y la e2e de escritorio (tres filas, la prueba de Teams llega como tarjeta).
- README: función, Límites y Seguridad al día.
- QA: filas tocadas: Ajustes de escritorio (solo existen bajo Electron; el campo reutiliza el de Slack y Discord); sin probar contra un Teams real (no hay cuenta): el formato sigue la documentación de Microsoft; auditoría: no toca la página web.
- Reclamo: loop/94, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso).
- Validado: 312 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 27 e2e en verde.
- **Siguiente:** iteración 95, mantenimiento · QA: pendiente 16 (El smoke y la auditoría no miran el 3D de celular a 320 px con el panel de rama…)

### 2026-10-18 · Iteración 95 · Mantenimiento · QA

- **Auditoría de QA: el 3D de celular a 320 px** (pendiente 16). La auditoría completa gana el escenario `celular-320-3d` (tipo nuevo `etiquetas-pisadas`, Baja): dos etiquetas de rama nítidas (opacidad ≥ 0,5) que se pisan son un hallazgo; las atenuadas por solaparse son a propósito. A mano, 320 px: demo (5 ramas, 3 atenuadas, ninguna nítida pisada) y 1.000 ramas simuladas con nombres larguísimos (4 etiquetas, 0 pisadas, sin errores de consola, sin desborde, ninguna menor de 24 px).
- **Hallazgos:** 3 nuevos (pendientes 16–18), 0 a la base de la auditoría
- **Pruebas que fallan sin el arreglo:** `tools/audit.test.mjs` (el escenario `celular-320-3d` de la completa y el tipo `etiquetas-pisadas`).
- README: no cambia (herramienta del loop).
- QA: auditoría completa con `--langs` (0 hallazgos, 114 s), smoke tres veces (3 en verde, con `PLAYWRIGHT_CHROMIUM_PATH`) y los bordes de 320 px a mano; no toca la página.
- Reclamo: loop/95, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso); el borrado de las `loop/82`–`loop/94` fusionadas falló con «hung up unexpectedly» del proxy y un comando posterior lo bloqueó el clasificador de permisos.
- Validado: 313 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) en verde; e2e no corridas (no toca la página ni el escritorio). El primer `npm run check` falló en 3 pasos del smoke (filtros por autor y por ruta, ya en el pendiente Media 1); la repetición pasó.
- **Siguiente:** iteración 96, expansión: ítem 58 (Ejercicios compartidos, tercera entrega, Público)

### 2026-10-18 · Iteración 96 · Expansión · Público

- **Capacidad nueva: ejercicios compartidos con solución propuesta** (ítem 58 de la hoja de ruta). «Crear un ejercicio» gana el campo «Solución propuesta» (hasta 10 comandos de 120 caracteres): se corren al crear y tienen que resolver el ejercicio, o se rechaza con su error. «Copiar enlace con la solución» arma `?practice=<código>&solution=1`; solo ese código lleva la solución (`r`), el enlace común no. Quien abre el enlace ve el botón «Ver solución», que escribe un paso por pulsación en la terminal (con `textContent`, sin ejecutarlo) hasta agotarlos; reiniciar conserva la solución y salir de la práctica quita `solution` de la URL. Sin `solution=1` el botón no aparece aunque el código la traiga.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (la solución solo viaja si se pide, resuelve el ejercicio y se rechaza si no lo resuelve, falla, pasa de 10 o de 120 caracteres) y un paso del smoke (crear con solución en el formulario, rechazo de una inválida, enlace con `solution=1`, pasos uno a uno con una `<b>` sin interpretar, sin resolver el ejercicio, y sin el botón con el enlace común).
- README: función, pruebas, Límites conocidos y Seguridad al día.
- QA: filas tocadas: terminal de práctica y formulario de creación (smoke); auditoría: 0 hallazgos nuevos
- Reclamo: loop/96, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso); el borrado de las `loop/83`–`loop/95` fusionadas falló otra vez («hung up unexpectedly» del proxy y luego el clasificador de permisos), siguen en Para Benjamin.
- Validado: 314 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 27 e2e en verde.
- **Siguiente:** iteración 97, expansión: ítem 59 (Extensión de VS Code: recordar repos, Plataformas)

### 2026-10-18 · Iteración 97 · Expansión · Plataformas

- **Capacidad nueva: la extensión de VS Code recuerda los repos** (ítem 59 de la hoja de ruta). El puerto del servidor local cambia en cada apertura y con él el almacenamiento de la página, así que antes se perdían los repos seguidos. Ahora `vscode/server.js` siembra en `vscode-session.js` lo recordado (repos, repo a la vista, vista e idioma) y la página avisa de sus cambios a `state` (una imagen, que la CSP ya permite, sin tocarla); la extensión lo guarda en `globalState`. Solo esas cuatro claves, con JSON válido y acotado: el token nunca se recuerda. El tema no se guarda: la página sigue el del editor.
- **Pruebas que fallan sin la capacidad:** `tools/vscode.test.mjs` (`cleanState`, el servidor que recibe y siembra el estado, y la extensión que lo guarda en `globalState` y lo devuelve al abrir de nuevo).
- README: sección de la extensión, Límites conocidos y Seguridad al día.
- QA: fila tocada: extensión de VS Code (pruebas con `vscode` simulado); auditoría: no toca la página
- Reclamo: loop/97, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso).
- Validado: 317 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 98, expansión: ítem 60 (Práctica: rebase y revert, Público)

### 2026-10-18 · Pedido de Benjamin: bitácora en vivo

- **Pedido de Benjamin:** ver en GraphBranch bitácoras como las que arma en Brunell_Node, fáciles de ver en un dashboard del home. Aclaró que el trabajo es solo en GraphBranch y que la app las haga en vivo. No es una iteración numerada: la directiva y el «Siguiente» no cambian.
- **Lo nuevo:** `js/bitacora.js` arma la bitácora del repo a la vista con lo ya cargado, sin consultas: ventana desde la bitácora anterior (la primera vez, 7 días), lo grande (release, el PR que más commits trajo a la rama por defecto por la historia de primeros padres, o la rama con más trabajo pendiente), commits por día separando los ya publicados, nota del 1 al 100 con su origen (ritmo: días con commits; publicado: parte de los commits ya en la rama por defecto; salud: 100 menos 20/10/4 por hallazgo alto/medio/bajo), hallazgos (checks rojos en la rama por defecto, PRs rojos o esperando más de 7 días, force-push, ramas borradas sin fusionar, ramas olvidadas, pasos a rojo, ventana sin commits), seguimiento de los de la anterior (arreglado, a medias, sigue, nuevo), cronología por día y qué sigue. La quinta cifra del resumen muestra número, nota, si subió o bajó y los hallazgos; abre el panel con la identidad de las bitácoras de Brunell_Node (secciones numeradas, nota grande, bordes por gravedad). Cerrar la guarda en el navegador por repo (hasta 26, con «Deshacer») y empieza la siguiente; sale en Markdown o como `estado.json` con el esquema de Brunell_Node. `?bitacora=1` la abre al cargar; la demo trae cuatro anteriores ficticias.
- **Medido en un repo real:** `bfigueroa99/GraphBranch` sin token, 40 commits del 11 al 18 de octubre, 9 PRs fusionados a master y la historia cargada desde el 16 (el panel lo avisa, atenúa los días sin cargar y no los muestra como «sin actividad»).
- **Pruebas que fallan sin la capacidad:** `tools/bitacora.test.mjs` (11: ventana, lo grande, hallazgos, nota, cerrar y seguir, a medias, datos guardados corruptos, historia parcial, cronología, HTML escapado, Markdown y `estado.json`), un paso del smoke (tarjeta, panel, cerrar, deshacer, descargas, foco al cerrar) y una e2e de escritorio (la bitácora cerrada sigue cerrada al reabrir la app).
- Textos: 94 claves nuevas en los 40 idiomas.
- README: la función en la lista, Controles, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: web y escritorio (e2e de escritorio nueva), demo sin token (smoke), 40 idiomas y RTL (check-i18n; smoke), teclado (Esc devuelve el foco a la tarjeta), celular a 390 y 320 px sin desborde, consola limpia, cuota (sin consultas nuevas).
- **Para después:** importar un `estado.json` (también los de Brunell_Node) para seguir su historial, la bitácora como imagen PNG y la de una organización seguida.
- Validado: 328 pruebas (`node --test`), smoke (40 idiomas, 136 pasos), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 98, expansión: ítem 60 (Práctica: rebase y revert, Público)

### 2026-10-18 · Iteración 98 · Expansión · Público

- **Capacidad nueva: `revert` y un sexto ejercicio en la práctica de git** (ítem 60 de la hoja de ruta). `rebase` ya existía en el intérprete; faltaba `revert <commit>`, que deshace un commit con uno nuevo (`Revert "…"`) sin tocar la historia, y el ejercicio «Revert»: un commit malo ya compartido en medio de `main`, que se resuelve con `revert HEAD~1` y no con `reset`. Admite varios commits, falla con HEAD desprendido, con una referencia inexistente y con un commit de fusión (como `cherry-pick`).
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (`revert`: commit nuevo con el padre correcto, historial conservado, errores; el ejercicio no se da por resuelto con `reset --hard`, con el `revert` equivocado ni sin hacer nada) y un paso del smoke que abre `?practice=6`, escribe `revert HEAD~1` y mira que se marque resuelto.
- Textos: 2 claves nuevas (`practice.ex6.title` y `.goal`) en los 40 idiomas.
- README: la función en la lista, `?practice=1` a `6`, pruebas y Límites conocidos al día.
- QA: filas tocadas: terminal de práctica y ejercicios (pruebas y smoke), 40 idiomas (check-i18n); auditoría: 0 hallazgos nuevos (corrida completa).
- Reclamo: loop/98, sin colisión
- Nota: el clon venía superficial otra vez (`git fetch --unshallow` arregló un R3 falso).
- Validado: 330 pruebas (`node --test`), smoke (40 idiomas, 137 pasos), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 99, mantenimiento · Errores: pendiente 4 (La etiqueta de ramas fusionadas de la leyenda está fija en español (`layout.js:…)

### 2026-10-18 · Pedido de Benjamin: prompt del loop autónomo

- **Pedido de Benjamin:** un botón en GraphBranch para copiar un prompt parecido al que hace que Brunell_Node se desarrolle solo, pero muy generalizado, para que sirva en todos los proyectos futuros. No es una iteración numerada: la directiva y el «Siguiente» no cambian.
- **Lo nuevo:** `js/loopprompt.js` arma el prompt (español o inglés, ~9.500 caracteres) con el repo, la rama de integración, una rama de release opcional que el loop nunca toca y el objetivo del proyecto. Destila los loops de Brunell_Node (`product-loop`, `docs/LOOP_ROUTINE.md`) y de GraphBranch (esta directiva, `iteracion`) sin nada propio de ellos: es una semilla que en la primera corrida deja `LOOP.md` en el repo (directiva, modos, puertas con los comandos reales, backlog con puntaje, pedidos al dueño, bitácora) y en las siguientes lo sigue (`LOOP.md` manda sobre el prompt); sincroniza antes de leer, reclama con una rama en el remoto, rota seis modos por el número de iteración, prueba con línea base, prueba que falla sin el cambio, mutación, puertas, en vivo y revisión adversarial, publica por PR solo lo verificado, registra, reporta con un panel medido y tiene presupuesto de regresiones, guarda contra el trabajo circular y una lista de lo que nunca hace. El botón del infinito en la barra superior (y uno en la bitácora) abre un panel con los campos, la vista previa, «Copiar el prompt» y «Guardar .md»; lo escrito se recuerda por repo (en la demo, no).
- **Pruebas que fallan sin la capacidad:** `tools/loopprompt.test.mjs` (5: repo, rama y dueño sin marcadores sin llenar; las mismas 13 secciones en los dos idiomas; la rama de release solo cuando es otra y entonces prohibida; el objetivo acotado y sin cerrar bloques de código; nombres raros limpios y sin dueño inventado) y un paso del smoke (campos, vista previa, `.md` guardado igual a lo que se ve, nada guardado en la demo, foco al cerrar y la entrada desde la bitácora).
- Textos: 13 claves nuevas en los 40 idiomas.
- README: la función, Controles, Estructura, Límites conocidos y Seguridad.
- QA: filas tocadas: demo sin token (smoke), 40 idiomas (check-i18n), teclado (Esc devuelve el foco al botón), celular a 390 px sin desborde y tema oscuro, consola limpia, cuota (sin consultas).
- Validado: 335 pruebas (`node --test`), smoke (40 idiomas, 138 pasos), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 99, mantenimiento · Errores: pendiente 4 (La etiqueta de ramas fusionadas de la leyenda está fija en español (`layout.js:…)

### 2026-10-18 · Iteración 99 · Mantenimiento · Errores

- **Arreglo: pendiente 4 ya estaba resuelto** (la etiqueta de ramas fusionadas de la leyenda): `graph.js` la rotula con `tr('legend.merged')` desde #26 y `layout.js` ya no lleva texto; la clave existe en los 40 idiomas. El pendiente estaba obsoleto y se quita.
- **Reproducción:** sin fallo que reproducir: el pendiente apuntaba a `layout.js:264`, que hoy solo dice «la vista la rotula en su idioma».
- **Pruebas que fallan sin el arreglo:** `tools/layout.test.mjs` (la leyenda usa `legend.merged`, `layout.js` no lleva «fusionadas» y los 40 idiomas definen la clave).
- README: sin cambios.
- QA: sin cambios de página; auditoría: no toca la página.
- Reclamo: loop/99, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso).
- Validado: 336 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 100, expansión: ítem 61 (Capa para streaming, tercera entrega, Plataformas)

### 2026-10-18 · Iteración 100 · Expansión · Plataformas

- **Capacidad nueva: `&rotate=` en la capa para streaming** (ítem 61 de la hoja de ruta, Capa para streaming, tercera entrega): `?embed=1&repo=a/b&repo=c/d&rotate=30` pasa al siguiente repo cada 30 s (entero de 5 a 3600; sin `rotate` o con otro valor no rota). Sin conexiones nuevas ni CSP distinta; en la web y en la app de escritorio (misma página).
- **Pruebas que fallan sin la capacidad:** `tools/embed.test.mjs` (`rotate` acepta de 5 a 3600 y rechaza 0, 4, 3601, negativos, decimales y texto) y un paso del smoke (con `&rotate=5` alterna o/a → o/b → o/a; sin él se queda en el primero).
- README: la función, Límites conocidos no cambian y Seguridad (`&rotate=` solo un entero acotado).
- QA: filas tocadas: demo sin token y varios repos (smoke con API simulada); sin textos nuevos; auditoría: la capa solo añade un temporizador, sin cambios visuales.
- Reclamo: loop/100, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso); Chromium se usó con `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- Validado: 337 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 101, expansión: ítem 62 (Lanzamientos en el resumen de la semana, Salidas)

### 2026-10-18 · Iteración 101 · Expansión · Salidas

- **Capacidad nueva: tags en el resumen de la semana** (ítem 62 de la hoja de ruta, Lanzamientos en el resumen de la semana): el resumen (Markdown e imagen PNG) suma la sección «Tags» con los tags cargados cuyo commit es de los últimos 7 días, sin repetir los que ya salen como release; sin tags en la semana, la sección no sale. Sin consultas nuevas ni CSP distinta; en la web y en la app de escritorio (misma página). Texto `digest.tags` en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` (tags de la semana en orden, fuera los viejos, los sin commit cargado y los repetidos como release; escape de `|`; sin tags no hay sección).
- README: la función, Límites conocidos (solo los tags cargados, con «Mostrar tags y entornos de despliegue» activado) y mapa de módulos. Seguridad no cambia (el nombre del tag se escapa como el resto del Markdown). Mapa de alcance: fila Salidas.
- QA: filas tocadas: 40 idiomas (`check-i18n`, 0 errores) y resumen en Markdown/imagen (pruebas); hoja de ruta repuesta a 15 (ítems 72–77, de partes de ítems ya hechos); auditoría: 0 hallazgos nuevos.
- Reclamo: loop/101, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso).
- Validado: 339 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 102, expansión: ítem 63 (Vista de texto: filtro por autor, Público)

### 2026-10-19 · Iteración 102 · Expansión · Público

- **Capacidad nueva: la vista de texto respeta el filtro por autor y por ruta, y lo anuncia** (ítem 63 de la hoja de ruta, Vista de texto: filtro por autor): con un autor elegido, el árbol ya mostraba solo sus ramas, pero en silencio; ahora una nota bajo la ayuda dice «Filtrado por autor: X (n de m ramas)» y la región viva (`role="status"`) lo anuncia al abrir. Con un filtro por ruta activo, el árbol deja solo los commits que la tocaron (y quita las ramas sin ninguno) y la nota dice «Filtrado por ruta: … (n commits)»; también al llegar commits nuevos con la vista abierta. Sin filtros no hay nota ni anuncio. Sin consultas nuevas ni CSP distinta; en la web y en la app de escritorio (misma página).
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` (`build` con `paths` deja solo los commits de la ruta y quita las ramas vacías; `scopeText`) y el paso del smoke «filtro por autor» (la nota está visible, la región viva dice lo mismo y se va al quitar el filtro).
- README: la función, Límites conocidos (la ruta filtra solo entre los commits ya cargados) y Seguridad sin cambios (todo entra con `textContent`). Mapa de alcance: fila Público.
- QA: filas tocadas: 40 idiomas (`check-i18n`, 0 errores; dos claves nuevas), teclado y región viva de la vista de texto (smoke); auditoría: la nota es un párrafo de ayuda sin controles nuevos.
- Reclamo: loop/102, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso); Chromium con `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. El smoke falló una vez bajo carga en «filtro por autor» y «filtro por ruta» (tiempos) y pasó limpio las otras veces.
- Validado: 341 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 103, mantenimiento · Deuda: pendiente 1

### 2026-10-19 · Iteración 103 · Mantenimiento · Deuda

- **Arreglo: smoke intermitente bajo carga** (pendiente 1 de Media). Tres causas: (1) «cambios de un commit» esperaba a que cambiara el *mensaje* del commit tras ←, pero la demo saca los mensajes de una lista corta y un commit puede llevar el mismo que su padre: la espera vencía aunque el panel ya había avanzado; ahora sigue al commit por su sha corto (`.df-meta code`), y K comprueba la vuelta por sha. (2) «salud del repo» leía `#hl-ci` al abrir, y en la demo cada commit deja los checks de su rama «en curso» de 3,5 a 6 s: si justo lo estaban todos, la sección salía vacía; el paso reabre el panel (hasta 15 veces, 1 s entre una y otra) hasta que alguno termine. (3) La cascada: un paso que fallaba a medias dejaba abierto un diálogo modal y cada `page.click` siguiente vencía a los 30 s; ahora `step` cierra lo abierto (Esc y `dialog[open]`) tras un fallo, y el fallo de un `click` vencido dice qué tapaba el objetivo (la línea «intercepts pointer events» del registro de Playwright, que antes se perdía al quedarse con la primera línea).
- **Reproducción:** `node tools/smoke.mjs` ×2 con 4 procesos al 100 % en 4 núcleos → antes: 1 de 2 corridas falló con «cambios de un commit: … page.waitForFunction: Timeout 15000ms exceeded.»
- **Pruebas que fallan sin el arreglo:** el propio smoke bajo la misma carga: después, 2 de 2 corridas en verde (408 s y 401 s); con el equipo libre, 1 de 1 en verde (340 s) antes del cambio.
- README: no aplica (herramienta interna).
- QA: no toca la página; auditoría: no toca la página.
- Reclamo: loop/103, sin colisión (primera del modo caos del 2026-10-19)
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso); Chromium con `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Borrar las `loop/*` fusionadas dio 403 (ya en Para Benjamin).
- Web publicada: sin publicar (404, has_pages=false; está en Para Benjamin)
- Validado: 341 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 104, expansión: ítem 64 (Choques entre ramas en la URL, Análisis)

### 2026-10-19 · Iteración 104 · Expansión · Análisis

- **Capacidad nueva: choques entre ramas en la URL** (ítem 64 de la hoja de ruta): `?conflicts=1` abre el repo con el panel de salud abierto y «Buscar choques» ya corrido, en cuanto hay dos ramas con PR abierto (los PRs pueden llegar después que las ramas: hasta entonces el panel espera abierto). Corre una sola vez por carga; si se cierra el panel antes, no vuelve. Pulsar «Buscar choques» deja `conflicts=1` en la dirección para compartir la vista y cerrar el panel lo quita. No corre con `embed=1`, en la práctica de git ni en el ensayo, ni sin `source.files`. Lectura pura en `GB.health.conflictsParam` (sí o no; `0`, `false`, `no` y `off` lo apagan). Sin textos nuevos (reusa los del panel), sin consultas aparte de las que ya hacía el botón y sin cambios de CSP; en la web y en la app de escritorio (misma página).
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` (`conflictsParam`: vacío, `1`, sin valor y los valores que lo apagan) y el paso del smoke «Choques entre ramas desde la URL»: abre la demo con `?conflicts=1`, espera el panel y la lista de choques, que la URL lo conserve, que Esc lo suelte y que reabrir a mano no vuelva a buscar.
- README: la función (Salud del repo), Controles, Límites conocidos (gasta las mismas consultas al abrir, una vez) y Seguridad (solo se lee como sí o no). Mapa de alcance: fila Análisis.
- QA: filas tocadas: demo sin token (smoke), teclado (Esc cierra y la URL se limpia), cuota de GitHub (mismas consultas que el botón, una vez por carga, nunca en la capa), 40 idiomas sin textos nuevos (`check-i18n`, 0 errores); a mano con Playwright contra `node e2e/serve.mjs 4173`: 1 choque en la demo, sin errores de consola. La primera corrida del smoke falló al mirar la URL justo tras cerrar (el evento `close` del diálogo llega en la tarea siguiente): el paso ahora espera esa condición.
- Reclamo: loop/104, a mano en modo caos (la 103 estaba ocupada)
- Nota: clon superficial otra vez (`git fetch --unshallow` arregló el R3 falso); borrar las `loop/*` fusionadas no se pudo (el proxy corta el push de borrado).
- Validado: 342 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. La primera corrida de `npm run check` falló en el smoke en «cambios de un commit: desde su ficha, con teclado…» (`waitForFunction` 15000 ms, sección que el diff no toca, con seis sesiones del caos cargando la máquina); la segunda pasó entera. Era la intermitencia que arregló la iteración 103; tras integrarla, `npm run check` otra vez en verde.
- **Siguiente:** iteración 105, expansión: ítem 65 (Token para un Bitbucket propio, Fuentes)

### 2026-10-19 · Iteración 105 · Expansión · Fuentes

- **Capacidad nueva: token para un Bitbucket propio** (ítem 65 de la hoja de ruta): con un servidor elegido (`?bitbucket=` / `--bitbucket-url=`), Ajustes muestra «Token de tu Bitbucket propio» (un token de acceso personal o HTTP), que va como `Authorization: Bearer …` en cada consulta y solo a ese servidor. Se guarda aparte de los demás y atado a la dirección del servidor (`pack`/`unpack` en `js/sources/bitbucket-server.js`, JSON `{base, token}`): con otro `?bitbucket=` no se envía ni se muestra. En la app de escritorio, cifrado en el llavero (servicio nuevo `bitbucketdc` en `electron/token.js`). Con token, un 401 se dice como token rechazado (`err.authBbdc`, nombra el host) y un 404 como repo no encontrado o sin permiso (`err.notFoundBbdc`); «Abrir Ajustes» del aviso lleva al campo propio. Sin token, todo como antes. Siete textos nuevos en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/bitbucket-server.test.mjs` (3 nuevas: con un servidor que exige iniciar sesión, el token abre el repo y va como Bearer solo ahí, sin el de Cloud; 401 y 404 con sus textos; el guardado atado a la dirección, que otro host, otra ruta o `http:` no reciben), el bloque del smoke «Bitbucket propio con token» (campo oculto sin servidor, aviso con el host, cabecera solo a `bb.example.com`, `otro.example.com` sin token ni campo lleno) y la e2e de escritorio de `--bitbucket-url` (ida y vuelta por el llavero y el campo visible con su host).
- README: la función (Bitbucket Data Center propio), Límites conocidos (un solo token, atado al servidor) y Seguridad (cada token a su servicio). Mapa de alcance: fila Fuentes.
- QA: filas tocadas: token fuera de `localStorage` en escritorio (e2e) y solo a su API (smoke y pruebas), 40 idiomas (`check-i18n`, 0 errores), teclado («Abrir Ajustes» enfoca el campo, smoke); auditoría: un campo de formulario con su `label`, como los demás tokens.
- Reclamo: loop/105, a mano en modo caos (la 103 estaba ocupada y la 104 tomada)
- Nota: clon superficial otra vez (`git fetch --unshallow` arregló el R3 falso); Electron se instaló a mano con `node node_modules/electron/install.js` (el hook dijo «no disponible»); borrar las `loop/*` fusionadas no se pudo (el proxy corta el push de borrado). La primera e2e de escritorio falló por abrir Ajustes antes de cargar la página; ahora espera la carga como las demás.
- Validado: 345 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 106, expansión: ítem 66 (Salud del repo en la URL, Análisis)

### 2026-10-19 · Iteración 106 · Expansión · Análisis

- **Capacidad nueva: el panel de salud se abre desde la URL** (ítem 66 de la hoja de ruta, Salud del repo en la URL): `?health=1` (o `?health` a secas; `0`, `false`, `no` u `off` lo apagan) abre el panel de salud apenas el repo a la vista tiene grafo, igual que si se pulsara el botón del pulso (con la consulta de forks y de primeros commits que ese botón ya hacía), para compartir la vista: `index.html?repo=owner/repo&health=1`. Cerrar el panel quita `health` de la dirección (como `conflicts`, de la iteración 104), así que recargar no lo vuelve a abrir. Dentro de `?embed=1` no se aplica. La lectura vive en `GB.health.healthParam`; el botón, la URL y `?conflicts=1` pasan por la misma función (`openHealth`). Sin textos nuevos, sin consultas nuevas ni CSP distinta; en la web y en la app de escritorio (misma página).
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («?health=1 abre el panel al cargar…»: `healthParam` con y sin el parámetro, con `0`, `false`, `NO`, ` off ` y `healthy=1`) y la sección del smoke «Salud del repo directa (?health=1)» (la demo abre con `#health[open]` y sus secciones; al cerrarlo `health` sale de la URL; con `health=0` no se abre).
- README: la función (sección Salud del repo) y la lista de URLs directas; Límites conocidos y Seguridad sin cambios (no hay texto de afuera nuevo ni consultas nuevas).
- QA: filas tocadas: el panel de salud por URL (smoke, en la demo); idiomas sin cambios (`check-i18n`, sin claves nuevas); auditoría: no cambia ningún control, solo cuándo se abre un diálogo existente.
- Reclamo: loop/106, a mano en modo caos (`--reclamar` dio Ocupada en la 103; la 104 y la 105 ya estaban tomadas). El primer PR, #134, se cerró: #135 y #138 se fusionaron antes y su número ya no pasaba R3; sigue como #139.
- Validado: 342 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- Nota: al reanudar la 106 (vencida, PR #139) se fusionó `origin/master` (conflicto solo en la bitácora, se conservaron ambas entradas); dos corridas seguidas de `npm run check` fallaron una vez cada una en pasos que el cambio no toca («vista 2D» del smoke y la e2e de escritorio «se sigue sin GitHub», que pasó sola en 4 s) y la tercera salió en verde: intermitencias bajo carga, a vigilar en la próxima auditoría de Deuda. Borrar las `loop/*` fusionadas sigue cortado por el proxy.
- **Siguiente:** iteración 107, mantenimiento · Rendimiento: pendiente 10

### 2026-10-20 · Iteración 107 · Mantenimiento · Rendimiento

- **Auditoría de Rendimiento: precompilar los sombreadores del 3D, probado y descartado** (pendiente 10). Medida base: 12 programas, ~186 ms esperando `getProgramParameter`, en el primer cuadro. Se probó `renderer.compile` con instancias de mentira (en reposo y en el constructor): `compile` recorre toda la escena y compila 21 programas más los 2 del primer cuadro (23, contra 12), así que se revirtió sin cambios de código. El pendiente 10 queda con el resultado y los dos caminos que faltan.
- **Hallazgos:** 0 nuevos, 0 a la base de la auditoría
- Nota: el PR #140 (iteración 107 anterior, ya fusionado) dejó la entrada de la bitácora sin escribir; esta la repone. El clon vino superficial (R3 falso y 2 pruebas rojas hasta `git fetch --unshallow`); `--reclamar` dio Vencida sin PR y se relevó. Borrar las `loop/*` fusionadas sigue cortado por el proxy.
- README: sin cambios (no hay código nuevo)
- QA: no cambia ningún control ni texto; auditoría: no toca la página
- Reclamo: relevo de loop/107 (6a3a514)
- Validado: 346 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 108, expansión: ítem 68 (Práctica: stash y reset, Público)

### 2026-10-19 · Iteración 108 · Expansión · Público

- **Capacidad nueva: `stash` en la práctica de git, `reset --hard` que tira los cambios y un séptimo ejercicio** (ítem 68 de la hoja de ruta, Práctica: stash y reset). El intérprete gana un árbol de trabajo mínimo: la lista de archivos con cambios sin commit (`touch <archivo>` los marca y `status` los lista). `stash` (también `push -m`), `stash list`, `pop`, `apply` y `drop` (con `stash@{n}` o `n`) los apartan y devuelven; con cambios a medias, `checkout` a otro commit, `merge`, `rebase`, `cherry-pick` y `revert` se niegan con el mensaje de git («Please commit your changes or stash them…»); `commit` se los lleva y `reset --hard <sha>` los tira (los otros `reset` los conservan). El ejercicio 7 («Stash», `?practice=7`): cambios a medias en `feature` y un arreglo urgente en `main`; se resuelve con `stash`, `checkout main`, un commit, `checkout feature` y `stash pop`, y no con un commit «WIP», sin el `pop` ni tirando los cambios. Los ejercicios propios pueden partir con cambios a medias (`touch` en sus comandos). Sin consultas, sin red; en la web y en la app de escritorio (misma página).
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` (stash: guardar, listar, `apply`, `pop`, `drop`, choques y errores, y que sin `stash` no se pueda cambiar de commit; `reset --hard` a un sha tira los cambios; el ejercicio no se resuelve con los atajos equivocados; un ejercicio propio con `touch`) y el paso del smoke que abre `?practice=7`, ve fallar `checkout main` y lo resuelve con `stash` y `stash pop`.
- Textos: 2 claves nuevas (`practice.ex7.title` y `.goal`) en los 40 idiomas; la salida de los comandos, en inglés como la de git.
- README: la función en la lista (`stash`, `touch`, siete ejercicios, `?practice=1` a `7`), pruebas y Límites conocidos (el árbol de trabajo es una lista de nombres, sin contenido; se niega a cambiar de commit aunque git a veces lo dejaría). Seguridad sin cambios: la salida entra a la terminal con `textContent` como antes. Mapa de alcance: fila Público.
- QA: filas tocadas: terminal de práctica y ejercicios (pruebas y smoke), 40 idiomas (check-i18n); auditoría: 0 hallazgos nuevos (corrida completa).
- Reclamo: loop/108, a mano en el modo caos (la 103 a la 107 las tenían otras sesiones)
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso).
- Validado: 345 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 109, expansión: ítem 67 (Búsqueda por fecha, Análisis)

### 2026-10-20 · Iteración 109 · Expansión · Análisis

- **Capacidad nueva: búsqueda por fecha en la lupa** (ítem 67 de la hoja de ruta). `desde:2026-09-01` y `hasta:2026-09-14`, solos o junto al texto, `@autor` y el selector de autor, acotan los commits ya cargados; los días son UTC y los dos extremos entran; sin mayúsculas que valgan; una fecha que no existe (`2026-02-31`, `hoy`) se busca como una palabra más; un commit sin fecha queda fuera cuando hay filtro. Sin consultas, sin red; en la web y en la app de escritorio (misma página).
- **Pruebas que fallan sin la capacidad:** `tools/search.test.mjs` (rangos con fechas fabricadas, último milisegundo del día, combinación con texto y autor, fechas falsas).
- Textos: sin claves nuevas (la sintaxis se explica en el README).
- README: la función en la lista, Controles y Límites conocidos. Mapa de alcance: fila Análisis.
- QA: filas tocadas: lupa (prueba y smoke de siempre); auditoría: no cambia ningún control ni texto.
- Reclamo: loop/109, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso y 2 pruebas rojas). `git push origin --delete loop/87` falló por el proxy (desconexión), como en la 107.
- Intermitente: el paso del smoke «Salud del repo directa» (`cerrar el panel deja health= en la URL`) falló 2 de 3 corridas de `npm run check` y 0 de 5 sueltas; la causa era una espera fija de 300 ms tras cerrar el panel. Ahora espera la condición (`waitForFunction`).
- Validado: 351 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 110, expansión: ítem 69 (Resumen de la organización como imagen, Salidas)

### 2026-10-20 · Iteración 110 · Expansión · Salidas

- **Capacidad nueva: resumen de la organización como imagen** (ítem 69 de la hoja de ruta). El resumen de la semana de una organización seguida también se guarda como PNG (botón «Guardar .png» junto a los de Markdown): una tarjeta oscura de 1200 px con los totales y los 8 repos más activos (commits, PRs fusionados y releases de cada uno) y «… +n» por el resto; recorta cada línea a unos 70 caracteres y se alinea a la derecha en idiomas de derecha a izquierda. Sin consultas; en la web y en la app de escritorio (misma página).
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` (líneas de la imagen de la organización: totales, recorte a 8 repos, «… +2», sin actividad y pintado en el canvas con alineación a la derecha) y el paso del smoke «el resumen de la semana de la organización junta sus repos abiertos», que ahora baja el PNG y comprueba su firma.
- Textos: sin claves nuevas (reusa `digest.png`).
- README: la función en la lista, Límites conocidos, estructura de archivos. Seguridad sin cambios (`fillText` en un canvas, sin HTML). Mapa de alcance: fila Salidas. Hoja de ruta repuesta con los ítems 79 a 84.
- QA: filas tocadas: resumen de la organización (prueba y smoke), 40 idiomas (check-i18n); auditoría: sin controles ni textos nuevos.
- Reclamo: loop/110, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso y 2 pruebas rojas). `git push origin --delete loop/87` falló por el proxy (desconexión), como en la 107 y la 109.
- Intermitente: el paso del smoke «vista 2D» falló en 3 de 4 corridas de `npm run check` (y en 1 de 2 sueltas sobre `master`); la cuarta pasó; cargado como pendiente Media 2 [Deuda].
- Validado: 352 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 111, mantenimiento · QA: pendiente 15 (No hay un escenario de la auditoría con 1.000 ramas a 320 px en 3D: la comproba…)

### 2026-10-20 · Iteración 111 · Mantenimiento · QA

- **Auditoría de QA: 1.000 ramas en 3D a 320 px** (pendiente 15). La auditoría completa gana el escenario `celular-320-3d-mil`: API simulada con 1.000 ramas extra (`githubSimulado(n)`), cambia a 3D, lleva el grafo a la vista y exige que las etiquetas nítidas no se pisen y que haya al menos una. Resultado: 0 hallazgos; la auditoría completa pasa de 0 a 0 y tarda ~63 s.
- **Hallazgos:** 2 nuevos (pendientes 17 y 18), 0 a la base de la auditoría
- **Pruebas que fallan sin el arreglo:** `tools/audit.test.mjs` (el escenario `celular-320-3d-mil` está en la completa y no en la puerta).
- README: sin cambios (herramienta interna).
- QA: filas tocadas: auditoría con 1.000 ramas a 320 px en 3D (a mano con captura: el grafo queda bajo las tarjetas, ver pendiente 17); auditoría: completa, 0 hallazgos.
- Reclamo: loop/111, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso). `git push origin --delete loop/87` falló por el proxy, como en la 107, 109 y 110.
- Validado: 353 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 112, expansión: ítem 70 (Los forks en el grafo, segunda entrega, Datos)

### 2026-10-20 · Cambio de maquinaria: Replica en el loop

- **Pedido de Benjamin:** que el pack Replica, ya instalado como skills del proyecto
  (`.claude/skills/replica-*`, MIT, con `disable-model-invocation: true` para que sus frases genéricas no
  desvíen la iteración), corra dentro del loop y no quede solo instalado. La directiva y la proporción de
  la regla 2 no cambian; no es una iteración numerada.
- **Lo nuevo:** la sección «Replica: paridad con una app de referencia» de la directiva (la app de
  referencia, GitKraken Desktop, sale de `docs/investigacion.md`; cómo cambiarla; la cadencia; qué skills
  corren y cuáles no, con el porqué), y la regla 5 empieza por lo que falta frente a ella. La skill
  `iteracion` lee `replica-recon`, `replica-entrepreneur` y `replica-diff` por su ruta en «Reponer la hoja
  de ruta» y anota `- Replica:` en la bitácora; una expansión que cumple una fila de
  `replica/features.csv` la marca en su PR. `--check` gana R13 (la pasada existe, es de la app de
  referencia, tiene menos de 30 días y su matriz tiene las columnas y los valores que mide `parity.py`;
  sin pasada, un aviso) y R10 acepta `[replica AAAA-MM-DD]`. `replica/screens/` va al `.gitignore`. Para
  Benjamin 2 suma los permisos de `parity.py` y `reviews.py`.
- **Cadencia:** `parity.py` en cada reposición de la hoja de ruta; hoy quedan 15 ítems, así que la
  próxima llega en unas 8 iteraciones, y esa misma reposición hace la primera pasada completa (R13 avisa
  que no hay ninguna).
- **Comprobado:** desde la raíz, `python3 .claude/skills/replica-diff/parity.py
  .claude/skills/replica-recon/features.csv` (la plantilla de la skill: 0/100, 9 must sin hacer) y
  `reviews.py` (sin reseñas sale 2: no inventa nada); R13 lee esa misma plantilla sin errores (18 filas,
  9 must).
- **Pruebas que fallan sin el cambio:** `tools/loop.test.mjs` (de 74 a 82: el CSV, la app de
  referencia, la pasada al día, vencida, de otra app o a medias, cada valor de la matriz y la cita
  `[replica …]`).
- README: `.claude/skills/replica-*/` y `replica/` en la estructura.
- Al validar: el smoke falló una vez en «filtro por autor» (`Cannot read properties of undefined (reading
  'sha')`, solo con el pack copiado) y otra en «vista 2D» (pendiente 2), y pasó entero al repetirlo; este
  cambio no toca la página. Anotado en el pendiente 2.
- Validado: 361 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 112, expansión: ítem 70 (Los forks en el grafo, segunda entrega, Datos)

### 2026-10-20 · Cambio de maquinaria: la arena en el loop

- **Pedido de Benjamin:** integrar en el loop, además de Replica, la skill arena
  (`.claude/skills/arena/`, MIT, de https://github.com/Jakeschincariol/arena-skill, commit df07b8e, con
  `disable-model-invocation: true`): un torneo de eliminación simple entre subagentes con enfoques
  distintos para la misma tarea. No es una iteración numerada y la proporción de la regla 2 no cambia.
- **Lo nuevo:** la sección «Arena: enfoques distintos que compiten» de la directiva y, en la skill
  `iteracion`, «Arena: cuando hay enfoques genuinamente distintos» dentro de «Construir»: una arena como
  máximo por iteración, `--agents 4` (19 llamadas de subagente) y tope 8 (43), siempre `plan` antes, el
  seed a la bitácora, `.arena/task.md` escrito por la iteración sin pistas de solución, la ruta
  `python3 .claude/skills/arena/bracket.py` escrita entera, los pasos de la skill que piden un sí
  reemplazados por las reglas del loop y el ganador aplicado y pasado por la puerta como cualquier
  cambio. Desde esta entrada, cada iteración lleva `- Arena:` (R5); R8 vigila que la skill corra la
  arena con su ruta y de 1 a 8 competidores (sin `--quick` ni el tamaño por defecto). `.arena/` va al
  `.gitignore` y Para Benjamin 2 suma el permiso de `bracket.py`.
- **Comprobado:** `python3 .claude/skills/arena/bracket.py plan --agents 4` desde la raíz (4 → 2 → 1, 19
  llamadas; con 8, 3 rondas y 43) sin escribir nada; `.arena/` queda fuera de git, de `node --test` (no
  entra en carpetas ocultas), del smoke, de `check-i18n`, del service worker y de los paquetes. No se
  corrió ninguna arena.
- **Pruebas que fallan sin el cambio:** `tools/loop.test.mjs` (de 82 a 84: la viñeta `- Arena:` tras la
  marca, con N, seed y rondas o con el porqué de «no aplica», y la arena de la skill con `--quick`, sin
  `--agents`, con más de 8, con una variable de la skill o con una ruta que no existe).
- README: `.claude/skills/arena/` en la estructura.
- Al validar: el smoke falló una vez en «vista 2D» (pendiente 2) y pasó entero al repetirlo; este cambio
  no toca la página.
- Validado: 363 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 112, expansión: ítem 70 (Los forks en el grafo, segunda entrega, Datos)

### 2026-10-21 · Iteración 112 · Expansión · Datos

- **Capacidad nueva: interruptor «Mostrar forks» en el panel de salud, con `?forks=0`** (ítem 70 de la hoja de ruta, segunda entrega de los forks). Apagado, el panel oculta la lista de forks, deja `forks=0` en la dirección y no hace la consulta `/forks` (ni una de más al abrir con `?forks=0`); encendido la quita de la URL y vuelve a pedirla. El foco se queda en el interruptor. `GB.health.forksParam` lee el parámetro (0, false, no, off). Dibujarlos como ramas en el grafo sigue pendiente (ítem 75 y siguientes).
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` (`forksParam`) y dos pasos nuevos dentro del paso del panel de salud del smoke (apagar oculta los forks, deja `forks=0` y conserva el foco; encender devuelve los 2 de la demo y quita el parámetro).
- README: la sección de Salud del repo (interruptor y `?forks=0`) y Límites conocidos (forks activos sin cuota con el interruptor apagado).
- QA: filas tocadas: panel de salud (teclado: el interruptor es un checkbox con etiqueta, foco conservado), 40 idiomas (`health.forksShow`, smoke con `--langs` sin desbordes); auditoría: 0 hallazgos nuevos.
- Arena: no aplica: una sola forma obvia (un parámetro de URL y un interruptor del panel que ya tiene su render).
- Reclamo: loop/112, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso y 2 pruebas en rojo). `git push origin --delete loop/87` falló por el proxy (sideband), como en la 111. El smoke dentro de `npm run check` falló en «vista 2D» (pendiente 2) en las dos primeras corridas y pasó en la tercera; suelto, pasó 6 de 6.
- Validado: 364 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 113, expansión: ítem 71 (Vista de texto: filtro por ruta en la URL, Público)

### 2026-10-21 · Iteración 113 · Expansión · Público

- **Capacidad nueva: la vista de texto se abre desde la URL con `?vista=texto`, con `?path=` y `?q=` aplicados** (ítem 71 de la hoja de ruta). Espera al filtro por ruta, abre la vista, escribe `?q=` en «Filtrar ramas…» (sin abrir además la búsqueda) y la región viva anuncia la ruta y «Ramas mostradas: n de m». `GB.textview.openParam` lee el parámetro y `setFilter` es nuevo en el montaje. Sin textos nuevos (usa los existentes).
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` (`openParam`) y un paso nuevo del smoke («Vista de texto desde la URL»).
- README: la función en la lista, Límites conocidos y Seguridad de la vista de texto.
- QA: filas tocadas: vista de texto (teclado y región viva, por el smoke); auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (un parámetro de URL que reutiliza el filtro por ruta y el render existentes).
- Reclamo: loop/113, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso y 2 pruebas en rojo). `git push origin --delete loop/87` falló por el proxy (sideband), como en la 111 y la 112.
- Validado: 365 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 114, expansión: ítem 72 (Resumen de la semana: pull requests abiertos, Salidas)

### 2026-10-21 · Iteración 114 · Expansión · Salidas

- **Capacidad nueva: el resumen de la semana cuenta los pull requests abiertos** (ítem 72 de la hoja de ruta). `GB.digest.compute` suma `opened` (los `pr-open` de los últimos 7 días con lo ya cargado, un PR una sola vez aunque se reabra o pase a listo, hasta 10 filas) y el Markdown y la imagen del repo llevan la sección «Pull requests abiertos» solo si hubo alguno; el texto de afuera sale escapado y una URL que no es http(s) no se enlaza. Sin consultas nuevas. 1 texto nuevo (`digest.opened`) en los 40 idiomas. Sin hacer: el resumen de la organización no lo suma.
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` (dos pruebas nuevas: PRs abiertos sin repetir ni contar los viejos, y sin ninguno no hay sección).
- README: la función en la lista de Salud del repo y en la tabla de archivos.
- QA: filas tocadas: panel de salud (la ficha del resumen), 40 idiomas (`digest.opened`, i18n 0 errores); auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (un contador más en una función pura que ya tiene la misma forma para fusionados y releases).
- Reclamo: loop/114, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow` arregló un R3 falso y 2 pruebas en rojo). `git push origin --delete loop/87` (y las demás loop/K fusionadas) lo negó el clasificador de permisos del entorno: quedan en Para Benjamin 7.
- Validado: 387 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. (El smoke falló una vez en «vista 2D», intermitente conocido de Deuda; pasó al repetir.)
- **Siguiente:** iteración 115, mantenimiento · Deuda: pendiente 1 (e2e de escritorio: «un repositorio de esta máquina se sigue sin GitHub…» (`e2e/…)

### 2026-10-21 · Iteración 115 · Mantenimiento · Deuda

- **Arreglo: la e2e de escritorio «un repositorio de esta máquina se sigue sin GitHub…» ya no es intermitente** (pendiente 1). La rama nueva aparece al hacer `checkout`, antes del commit; la prueba abría el diff en esa cabeza todavía sobre «segundo». Ahora espera a que `#st-commits` llegue a 3 antes de abrirlo.
- **Reproducción:** `xvfb-run -a npx playwright test e2e/desktop.spec.mjs -g "se sigue sin GitHub"` ×6 → 1 falla: `expect(locator).toHaveText(expected) failed … unexpected value "segundo"`; con el arreglo, 10 de 10 en verde.
- **Pruebas que fallan sin el arreglo:** la misma e2e (`e2e/desktop.spec.mjs`), que es la prueba intermitente.
- README: sin cambios (no toca funciones).
- QA: fila de la app de escritorio (repo local) mirada con 10 corridas; auditoría: no toca la página.
- Arena: no aplica: una sola forma obvia (esperar al estado en vez de al texto).
- Reclamo: loop/115, sin colisión
- Nota: el clon venía superficial otra vez (`git fetch --unshallow`). El smoke sigue con su intermitente de «vista 2D» (pendiente 1 actual); pasó en esta corrida.
- Validado: 387 pruebas (`node --test`), smoke, i18n (0 errores) y 28 e2e en verde.
- **Siguiente:** iteración 116, expansión: ítem 73 (Vista de texto: tags, Público)

### 2026-10-21 · Iteración 116 · Expansión · Público

- **Capacidad nueva: la vista de texto dice qué commits llevan tag** (ítem 73 de la hoja de ruta). Cada commit con tag lo dice en su nombre accesible («tag v1.0.0», no solo el nombre suelto), y al abrir la vista la región viva cuenta cuántos commits con tag hay (`GB.textview.taggedCount`, cada uno una vez aunque salga en dos ramas), junto con la nota de los filtros. Sin consultas nuevas. 2 textos nuevos (`textview.tag`, `textview.tagged`) en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` (`taggedCount`) y un paso del smoke («vista de texto: árbol con teclado…»: nombre accesible con «tag vN» y región viva con la cuenta).
- README: la descripción de la vista de texto y la fila del Mapa de alcance (Público).
- QA: filas tocadas: vista de texto con teclado y nombres accesibles, región viva, 40 idiomas (i18n 0 errores); auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (un contador y un texto más sobre los tags que `build` ya trae).
- Reclamo: loop/116, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`). `git push origin --delete loop/87`…`loop/99` lo negó el clasificador de permisos del entorno: siguen en Para Benjamin 7.
- Validado: 388 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 117, expansión: ítem 74 (Capa para streaming, cuarta entrega, Plataformas)

### 2026-10-21 · Iteración 117 · Expansión · Plataformas

- **Capacidad nueva: `&theme=light|dark` fija el tema de la capa** (ítem 74 de la hoja de ruta). Con `?embed=1&theme=dark` (o `light`) la capa pone `data-theme` en `<html>` y se ve en ese tema aunque el sistema sea el otro, sin tocar la página que la contiene; cualquier otro valor se ignora y sin `&theme=` sigue al sistema. Sin consultas nuevas ni textos nuevos.
- **Pruebas que fallan sin la capacidad:** `tools/embed.test.mjs` (lectura de la URL y `data-theme`) y un paso del smoke («&theme=dark pinta la capa oscura aunque el sistema sea claro…»).
- README: la lista de funciones (widget embebible), Seguridad y la fila del Mapa de alcance (Plataformas).
- QA: fila del widget embebible mirada con el smoke (sistema claro, `&theme=dark`, y sin `&theme=`); auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (un atributo más en el bloque que ya marca `<html>` para `?embed=1`).
- Reclamo: loop/117, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`). `git push origin --delete loop/*` sigue sin poder (el proxy cuelga la conexión): sigue en Para Benjamin 7.
- Validado: 389 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 118, expansión: ítem 75 (Los forks en el grafo, tercera entrega, Datos)

### 2026-10-22 · Iteración 118 · Expansión · Datos

- **Capacidad nueva: los forks del panel de salud salen por actividad reciente** (ítem 75 de la hoja de ruta). `compute` ordena los forks por su último push (el más nuevo primero) en vez de fiarse del orden en que llega la lista, así el orden vale para cualquier fuente (la API de GitHub ya los traía así; la demo y las futuras no tienen por qué).
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («los forks salen por actividad reciente aunque la lista venga desordenada»).
- README: la descripción del panel de salud (forks) y la fila del Mapa de alcance (Datos).
- QA: fila del panel de salud: orden de los forks comprobado con forks fabricados; auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (un `sort` sobre lo que `compute` ya mapea).
- Reclamo: loop/118, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); sin eso `--check` R3 y dos pruebas de `loop.test.mjs` fallan.
- Replica: sin pasada nueva (no existe `replica/features.csv`; sin paridad que medir); la hoja se repuso a 15 ítems (85–90) con candidatas de `docs/investigacion.md`.
- Validado: 390 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 119, mantenimiento · Seguridad: auditoría (sin pendientes de Seguridad)

### 2026-10-22 · Iteración 119 · Mantenimiento · Seguridad

- **Auditoría de Seguridad: los enlaces que arma la interfaz con URL de la API solo salen con http(s).** CSP cerrado (`script-src 'self'`, sin `eval`), los 41 usos de `innerHTML` revisados (todo texto externo pasa por `U.esc` o `textContent`), tokens solo en cabeceras, `sw.js` sin guardar la API, Electron con aislamiento, `sandbox`, navegación y ventanas bloqueadas y `openExternal` solo a https. Hallazgo peor (Media): `feed.js`, `graph.js`, `galaxy.js`, `diff.js` y `app.js` ponían en un `href` la `url` de la API sin comprobar el esquema; un `javascript:` lo frena el CSP, pero no debía llegar al DOM. Se añade `U.safeUrl` y se usa en los 9 sitios (la bitácora ya validaba con `isUrl`).
- **Hallazgos:** 3 (el arreglado aquí y los pendientes 18 y 19), 0 a la base de la auditoría
- **Pruebas que fallan sin el arreglo:** `tools/util.test.mjs` («U.safeUrl: solo deja pasar http(s)…» y «ningún enlace de la interfaz arma su href… sin pasar por U.safeUrl»).
- README: sin cambios (sin función nueva).
- QA: filas de Seguridad del protocolo; auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (un filtro de esquema en un helper).
- Reclamo: loop/119, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); las `loop/87`–`99` fusionadas siguen sin borrarse (el proxy cortó el `push --delete`).
- Validado: 392 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 120, expansión: ítem 76 (Constelación ordenada por actividad, Escala)

### 2026-10-22 · Iteración 120 · Expansión · Escala

- **Capacidad nueva: la constelación se ordena por actividad o por nombre** (ítem 76 de la hoja de ruta). Un selector en el diálogo reordena las galaxias (y con ellas el recorrido con Tab y el de los lectores de pantalla) y lo anuncia en una región `role="status"`; sin consultas nuevas: usa los commits ya cargados.
- **Pruebas que fallan sin la capacidad:** `tools/constellation.test.mjs` («el orden: pestañas tal cual, actividad por commits y nombre…») y un paso del smoke (orden por nombre y anuncio).
- README: la descripción de la constelación y la fila del Mapa de alcance (Escala).
- QA: fila de la constelación (Tab, selector, región viva, 10 repos simulados); auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (un `sort` puro sobre la lista que ya recibe el diálogo).
- Reclamo: loop/120, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`). `git push origin --delete loop/87` sigue cortado por el proxy: sigue en Para Benjamin 7.
- Validado: 393 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 121, expansión: ítem 77 (Práctica: branch -d y merge --abort, Público)

### 2026-10-22 · Iteración 121 · Expansión · Público

- **Capacidad nueva: la práctica de git entiende `merge --no-commit` y `merge --abort`, y un ejercicio nuevo los usa** (ítem 77 de la hoja de ruta; `branch -d` ya existía). Una fusión a medias queda pendiente (`status` la nombra, `commit` la cierra con dos padres, `reset` la descarta, otro `merge` se niega) y el ejercicio 8 («Cancelar una fusión», `?practice=8`) se resuelve solo si se probó y se canceló, sin dejar la fusión hecha.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` («merge --no-commit deja la fusión a medias…», «el ejercicio de abort no se resuelve con una fusión confirmada…» y la lista de soluciones por ejercicio) y un paso del smoke (`?practice=8`).
- README: la lista de comandos, «Ocho ejercicios guiados», `?practice=1` a `8`, pruebas y Límites conocidos (la fusión a medias no tiene contenido ni conflictos); fila Público del Mapa de alcance.
- QA: filas de la práctica (terminal, ejercicio resuelto, 40 idiomas con `check-i18n`); auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (un estado `merging` en el intérprete y una condición de resuelto sobre un contador de cancelaciones).
- Reclamo: loop/121, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); el `push --delete loop/87` sigue cortado por el proxy (Para Benjamin 7).
- Validado: 395 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 122, expansión: ítem 79 (Resumen de la semana: issues cerrados, Salidas)

### 2026-10-22 · Iteración 122 · Expansión · Salidas

- **Capacidad nueva: el resumen de la semana suma los issues cerrados** (ítem 79 de la hoja de ruta). Una sección «Issues cerrados (n)» en el Markdown y en la imagen, con los de los últimos 7 días que ya trajo el feed (cada issue una vez aunque se haya cerrado, reabierto y cerrado otra vez; hasta 10 filas; enlaces solo http(s)); sin ninguno no hay sección. Sin consultas nuevas; `digest.closed` en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` («issues cerrados: cuenta los de la semana, una vez por issue…» y «sin ninguno no hay sección»).
- README: la descripción del resumen de la semana, la lista de `js/digest.js` y Límites conocidos; fila Salidas del Mapa de alcance.
- QA: filas del resumen de la semana (Markdown e imagen, texto escapado, enlaces filtrados); auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (un filtro más sobre el feed, como los PRs abiertos).
- Reclamo: loop/122, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); el `push --delete loop/87` sigue cortado por el proxy (Para Benjamin 7).
- Validado: 397 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 123, mantenimiento · Accesibilidad: pendiente 2 (Estados confusos: botones que cambian a la vez `aria-pressed` y el texto (el de…)

### 2026-10-22 · Iteración 123 · Mantenimiento · Accesibilidad

- **Arreglo: los botones que cambian de nombre ya no llevan `aria-pressed`** (pendiente 2, primera mitad). El play del Replay («Pausa»/«Reanudar»), «Fijar»/«Soltar» de la ficha de rama y «En vivo»/«Saltar» no anuncian ya «pulsado» además de su nombre; el estado va en `data-paused`, `data-on` y `data-following` (el CSS y el smoke los leen). Queda la leyenda 2D sin teclado como pendiente 2.
- **Reproducción:** `node --test tools/estados.test.mjs` → 3 pruebas fallan sin el arreglo (`aria-pressed` junto al texto cambiante).
- **Pruebas que fallan sin el arreglo:** `tools/estados.test.mjs` y el paso del smoke de «Fijar» con el teclado (exige que no haya `aria-pressed`).
- README: sin cambios (no cambia ninguna función).
- QA: botones con estado (Replay, ficha de rama, seguir en vivo) leídos en el código y en el smoke; auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (mover el estado a un `data-*`).
- Reclamo: loop/123, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`).
- Nota: el smoke falló una vez en «filtro por autor: … quitar el filtro no deja el grafo como estaba» (no toca el cambio) y pasó al repetir; cargado como pendiente [Deuda].
- Validado: 400 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 124, expansión: ítem 78 (Vista de texto: abrirla desde la URL, Público)

### 2026-10-23 · Iteración 124 · Expansión · Público

- **Capacidad nueva: `?view=text` abre la vista de texto, como alias en inglés de `?vista=texto`** (ítem 78 de la hoja de ruta). El grueso del ítem (abrirla desde la URL con `?path=` y `?q=`) ya lo entregó la iteración 113 (ítem 71); `?author=` ya lo aplica el resto de la app a la vista. Queda el nombre `view=text` para enlaces compartidos en inglés; `?view=texto` y `?vista=text` no cuentan. Sin textos nuevos ni consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` («openParam: ?vista=texto y ?view=text piden abrir…») y el paso del smoke «?view=text, el alias en inglés, abre también la vista de texto».
- README: la descripción de la vista de texto y su línea de Seguridad; fila Público del Mapa de alcance sin cambios (ya nombra la URL).
- QA: lectura de la URL y apertura en el smoke; auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (aceptar otro nombre de parámetro en `openParam`).
- Reclamo: loop/124, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); `git push origin --delete loop/87` sigue cortado por el proxy (Para Benjamin 7).
- Validado: 400 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 125, expansión: ítem 82 (Capa para streaming, quinta entrega, Plataformas)

### 2026-10-23 · Iteración 125 · Expansión · Plataformas

- **Capacidad nueva: `&title=` en la capa para streaming** (ítem 82 de la hoja de ruta, Capa para streaming, quinta entrega): `?embed=1&title=Directo de hoy` pone ese rótulo arriba a la izquierda del grafo. Sin caracteres de control, hasta 60 letras (por punto de código), y entra al DOM con `textContent`, nunca como HTML; es decorativo (`aria-hidden`, el `h1` del repo sigue siendo el título para los lectores). Sin `title`, no hay rótulo, y fuera de `?embed=1` no se lee. Sin conexiones nuevas ni CSP distinta; en la web y en la app de escritorio (misma página). Sin textos nuevos de interfaz: el rótulo lo escribe quien arma la URL.
- **Pruebas que fallan sin la capacidad:** `tools/embed.test.mjs` («embedOptions: title se limpia, se acota…») y el paso del smoke «&title= muestra el texto escapado sobre la capa».
- README: la descripción del widget embebible y su línea de Seguridad; fila Plataformas del Mapa de alcance.
- QA: fila de la capa para streaming (lectura de la URL, escapado de `<b>`, que se vea y que no aparezca sin `&title=`) en el smoke; auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (un parámetro más en `embedOptions` y un rótulo con `textContent`).
- Reclamo: loop/125, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); `git push origin --delete loop/87` sigue cortado por el proxy (Para Benjamin 7).
- Validado: 401 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 126, expansión: ítem 80 (Vista de texto: releases, Público)

### 2026-10-23 · Iteración 126 · Expansión · Público

- **Capacidad nueva: la vista de texto dice qué commits llevan release** (ítem 80 de la hoja de ruta, parte del ítem 33). Con los releases que el feed ya trajo (`ReleaseEvent` de GitHub o los de la demo), el commit cuyo tag coincide (o cuyo `sha` trae la actividad) se dice «release v1.4.0» en su nombre accesible y en su texto lateral (sin repetirlo como tag suelto), y al abrir la región viva suma «Commits con release: n» a lo de los tags. Sin consultas nuevas ni estado guardado; el nombre entra con `textContent`. Textos nuevos (`textview.release`, `textview.released`) en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` («los releases del feed marcan el commit de su tag…») y el paso del smoke «vista de texto: árbol con teclado…» (el release v1.4.0 de la demo se dice en el nombre accesible y la región viva lo cuenta).
- README: la descripción de la vista de texto y sus Límites conocidos (solo los releases que el feed ya trajo); fila Público del Mapa de alcance sin cambios.
- QA: fila de la vista de texto (nombres accesibles y región viva) en el smoke; auditoría: la corre `npm run check`.
- Arena: no aplica: una sola forma obvia (marcar en `build` los commits cuyo tag o sha coincide con un release del feed).
- Replica: sin pasada nueva (R13 avisa; reposición con las candidatas vigentes de la investigación): ítems 91 a 96.
- Reclamo: loop/126, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); `git push origin --delete loop/87` sigue cortado por el proxy (Para Benjamin 7).
- Validado: 402 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 127, mantenimiento · QA: pendiente 14 (Con 1.000 ramas a 320 px el 3D deja solo 4 etiquetas de rama visibles (`reach` …)

### 2026-10-23 · Iteración 127 · Mantenimiento · QA

- **Auditoría de QA: el smoke tenía una carrera en el paso del filtro por autor** (pendientes 14 y 20). Pendiente 20 arreglado: `tools/smoke.mjs` leía `off` (marca y aviso del filtro) antes de esperar a que el grafo y el aviso se actualizaran; ahora espera ambos y después mide. Pendiente 14 revisado y cerrado sin cambio de código: a 320 px, con 1.000 ramas, `placeLabels` deja pocas etiquetas legibles y sin pisarse a propósito (`crowd` oculta las pisadas y la escena `celular-320-3d-mil` de la auditoría exige que ninguna se pise); una pista de «+N ramas» sería una capacidad nueva, no un arreglo.
- **Reproducción:** `node tools/smoke.mjs` (corrida 1 de 2, equipo cloud) → `✗ filtro por autor: el grafo y el árbol de texto muestran solo sus ramas, lo dice y se quita: quitar el filtro no deja el grafo como estaba`; la corrida 2 pasó (1 falla en 2).
- **Hallazgos:** 3 nuevos (pendientes 19 y 20 cargados; la carrera del smoke, arreglada aquí), 0 a la base de la auditoría. Auditoría completa con `--langs`: 0 hallazgos (185 s).
- **Pruebas que fallan sin el arreglo:** el propio paso del smoke «filtro por autor…» (intermitente: 1 falla en 2 corridas antes; ahora espera el estado antes de medir).
- README: sin cambios (no toca funciones).
- QA: auditoría completa y smoke de las expansiones recientes (vista de texto, releases); bordes de 1.000 ramas a 320 px por la escena `celular-320-3d-mil`; el clon superficial rompía `--check` (pendiente 19).
- Arena: no aplica: un cambio de unas líneas con una sola forma obvia (esperar el estado antes de medirlo).
- Reclamo: loop/127, sin colisión
- Nota: `git push origin --delete loop/87` sigue cortado por el proxy (Para Benjamin 7); el clon venía superficial (`git fetch --unshallow origin`).
- Validado: 402 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 128, expansión: ítem 83 (Salud del repo: tendencia de merges, Análisis)

### 2026-10-24 · Iteración 128 · Expansión · Análisis

- **Capacidad nueva: tendencia de merges en la salud** (ítem 83 de la hoja de ruta, parte del ítem 12). `compute` (`js/health.js`) suma `pace.mergeWeeks`: los PRs fusionados que el feed ya trajo en cada una de las últimas 8 semanas (de la más vieja a la actual, sin repetir ni contar futuros), y el panel lo muestra bajo el tiempo de abierto a fusionado (`#hl-mergeweeks`, oculto si no hay ninguno). Sin consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («tendencia de merges…» y «ritmo…») y el paso del smoke de salud (`#hl-mergeweeks` con 8 cifras y algún PR fusionado en la demo).
- README: la función (Salud del repo) y Límites conocidos. Mapa de alcance: fila Análisis. Textos en los 40 idiomas (1 clave: `health.mergeWeeks`).
- QA: fila de la salud en el smoke; auditoría: 0 hallazgos nuevos.
- Arena: no aplica: una sola forma obvia (reusar `weekly` con los merges ya cargados).
- Reclamo: relevo de loop/128 (f5ede95)
- Nota: el clon venía superficial (`git fetch --unshallow`); `git push origin --delete loop/87` sigue cortado por el proxy (Para Benjamin 7). El primer `npm run check` falló en el paso «filtro por autor» (ajeno al cambio); la repetición pasó: pendiente 21.
- Validado: 403 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 129, expansión: ítem 81 (Práctica: switch y restore, Público)

### 2026-10-24 · Iteración 129 · Expansión · Público

- **Capacidad nueva: la práctica de git entiende `switch` y `restore`** (ítem 81 de la hoja de ruta, parte del ítem 31). `switch` deja de ser un alias de `checkout`: `-c` crea, `--detach <commit>` va a un commit a propósito y un commit a secas da el error de git («a branch is expected»); `restore <archivo>…` y `restore .` tiran los cambios sin commit que dejó `touch` (`--source=<rev>` los deja distintos de HEAD; `--staged` avisa que la práctica no tiene índice). Sin consultas nuevas ni estado guardado; las líneas de la terminal siguen entrando con `textContent`.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` («switch y restore…») y el paso del smoke «la práctica entiende switch y restore».
- README: la lista de comandos de Aprender git; fila Público del Mapa de alcance. Textos: la ayuda de la terminal es inglés fijo como el resto de los comandos, sin claves nuevas.
- QA: fila de la práctica en el smoke; auditoría: 0 hallazgos nuevos.
- Arena: no aplica: una sola forma obvia (dos comandos nuevos sobre `work`, el mismo modelo que `touch` y `stash`).
- Reclamo: loop/129, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); `git push origin --delete loop/88` sigue cortado por el proxy (Para Benjamin 7).
- Validado: 404 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 130, expansión: ítem 84 (Constelación ordenada, en la URL, Escala)

### 2026-10-24 · Iteración 130 · Expansión · Escala

- **Capacidad nueva: la constelación abre ordenada por la URL** (ítem 84 de la hoja de ruta, parte del ítem 26). `?order=activity` deja el selector y el recorrido con Tab en «actividad» desde el arranque (`C.orderParam` lee el parámetro; lo desconocido o vacío deja el orden de las pestañas). Sin consultas nuevas ni estado guardado; no se anuncia en la región viva porque no lo pidió nadie con el selector.
- **Pruebas que fallan sin la capacidad:** `tools/constellation.test.mjs` («?order=activity abre ordenada…») y el paso del smoke «se siguen hasta 10 repos a la vez» (abre con `?order=activity` y mira el selector).
- README: la función Constelación (y el parámetro `?order=activity`). Textos: sin claves nuevas.
- QA: fila de la constelación en el smoke; auditoría: 0 hallazgos nuevos.
- Arena: no aplica: una sola forma obvia (un parámetro de URL que llama a `setOrder`, el mismo camino que el selector).
- Reclamo: loop/130, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); `git push origin --delete loop/88` lo denegó el clasificador de permisos (Para Benjamin 7).
- Validado: 405 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 131, mantenimiento · Errores: pendiente 3 (`i18n.setLocale`: si se eligen dos idiomas seguidos, gana el que termina de car…)

### 2026-10-24 · Iteración 131 · Mantenimiento · Errores

- **Arreglo: `i18n.setLocale` ya no deja ganar al idioma que carga último** (pendiente 3). Cada llamada toma un turno; al terminar de cargar, si se pidió otro idioma después, descarta su resultado (sin tocar el documento, el almacenamiento ni a los oyentes) y devuelve el idioma vigente. Sin consultas nuevas.
- **Reproducción:** `node --test tools/i18n.test.mjs` → `AssertionError: expected 'fr', actual 'de'` (se elige `de`, luego `fr`; `fr` carga antes y `de` lo pisa).
- **Pruebas que fallan sin el arreglo:** `tools/i18n.test.mjs` («setLocale: si se eligen dos idiomas seguidos, gana el último elegido…»).
- README: sin cambios (no cambia lo que hace la app a la vista). Textos: sin claves nuevas.
- QA: la fila del selector de idioma en el smoke; auditoría: 0 hallazgos nuevos.
- Arena: no aplica: una sola forma obvia (un contador de turnos dentro de `setLocale`).
- Reclamo: loop/131, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`: sin eso `--check` daba R3 falso y 2 pruebas en rojo); `git push origin --delete loop/88`…`loop/99` lo denegó el clasificador de permisos (Para Benjamin 7). El paso «filtro por autor» del smoke falló una vez y pasó al repetir `npm run check` (intermitente ya anotado en el pendiente 1).
- Validado: 406 pruebas (`node --test`), smoke, i18n (0 errores), auditoría y e2e en verde.
- **Siguiente:** iteración 132, expansión: ítem 85 (Práctica: tag -d y cherry-pick --abort, Público)

### 2026-10-24 · Iteración 132 · Expansión · Público

- **Capacidad nueva: la práctica de git entiende `cherry-pick --no-commit`, `--continue` y `--abort`, y trae un noveno ejercicio que usa `tag -d`** (ítem 85 de la hoja de ruta). El pick a medias aparece en `status`, bloquea `checkout`, `merge` y otro `cherry-pick` hasta confirmarlo (`commit` o `--continue`) o cancelarlo (`--abort`); `reset` también lo suelta. `tag -d` ya existía: el ejercicio «Etiqueta de más y cherry-pick cancelado» lo exige.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` («cherry-pick --no-commit espera su commit y --abort lo cancela», y la solución del noveno ejercicio en «cada ejercicio parte sin resolver…») y el paso del smoke «la práctica borra un tag y cancela un cherry-pick a medias».
- README: la lista de comandos de «Aprender git», los nueve ejercicios y `?practice=1` a `9`. Textos: `practice.ex9.title` y `practice.ex9.goal` en los 40 idiomas.
- QA: fila de la práctica de git en el smoke; auditoría: 0 hallazgos nuevos.
- Arena: no aplica: una sola forma obvia (un estado `picking` junto a `merging`, el mismo molde de `merge --no-commit`/`--abort`).
- Reclamo: loop/132, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); `git push origin --delete loop/88` lo denegó el proxy (Para Benjamin 7). En la primera pasada de `npm run check` el paso «filtro por autor» del smoke falló y pasó al repetir (intermitente ya anotado en el pendiente 1).
- Validado: 407 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 133, expansión: ítem 86 (Resumen de la semana: tags nuevos por semana, Salidas)

### 2026-10-24 · Iteración 133 · Expansión · Público

- **Capacidad nueva: la vista de texto lista los forks activos ya cargados** (ítem 87 de la hoja de ruta, hoy el 86: el «tags nuevos por semana» que ocupaba el 86 ya estaba entregado en #132, así que se quitó y se renumeró). Debajo del árbol, una lista aparte de hasta 10 enlaces (`https://`, `rel="noopener noreferrer"`, el push más reciente primero), cada uno dicho como «nombre, último push hace…»; la región viva cuenta «Forks activos: n» al abrir. `?forks=0` y el interruptor «Mostrar forks» apagado la quitan; no hace consultas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` («los forks activos ya cargados salen del más reciente al más viejo…») y el paso del smoke «vista de texto: árbol con teclado…» (los 2 forks de la demo y la región viva).
- README: la función de la vista de texto, Límites conocidos y Seguridad. Textos: `textview.forks` y `textview.fork` en los 40 idiomas.
- QA: filas de la vista de texto (teclado, nombres accesibles, región viva) en el smoke; auditoría: 0 hallazgos nuevos.
- Arena: no aplica: una sola forma obvia (una lista aparte, con los datos que ya reúne `health`).
- Replica: sin pasada nueva (sigue sin `replica/recon.md`); la hoja se repuso con seis ítems de las fuentes investigadas del 2026-10-13 (96 a 101), sin paridad.
- Reclamo: loop/133, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); `git push origin --delete loop/88` lo denegó el proxy (Para Benjamin 7). Las aserciones del smoke que anclaban el fin de la región viva se ajustaron para admitir la frase de forks.
- Validado: 408 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 134, expansión: ítem 87 (Salud del repo: tendencia de PRs abiertos, Análisis)

### 2026-10-25 · Iteración 134 · Expansión · Análisis

- **Capacidad nueva: tendencia de PRs abiertos en la salud** (ítem 87 de la hoja de ruta, parte del ítem 12). `compute` (`js/health.js`) suma `pace.openedWeeks`: los PRs que el feed ya trajo abiertos en cada una de las últimas 8 semanas (de la más vieja a la actual). Cada PR cuenta una vez, con su primera apertura: un `pr-open` o el `openedAt` de su merge; los reabiertos no se repiten y los futuros no cuentan. El panel lo muestra bajo la línea de merges por semana (`#hl-openedweeks`, oculto si no hay ninguno). Sin consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («tendencia de PRs abiertos…» y «ritmo…») y el paso del smoke de salud (`#hl-openedweeks` con 8 cifras y algún PR abierto en la demo).
- README: la función (Salud del repo) y Límites conocidos. Mapa de alcance: fila Análisis. Textos en los 40 idiomas (1 clave: `health.openedWeeks`).
- QA: fila de la salud en el smoke; auditoría: 0 hallazgos nuevos.
- Arena: no aplica: una sola forma obvia (reusar `weekly` con los PRs ya cargados).
- Reclamo: loop/134, sin colisión
- Nota: el clon venía superficial (`git fetch --unshallow`); `git push origin --delete loop/88` lo denegó el clasificador de permisos (Para Benjamin 7).
- Validado: 409 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 135, mantenimiento · Rendimiento: pendiente 9 (El primer cuadro 3D compila 12 programas de shaders seguidos, ~620 ms sin GPU (…)

### 2026-10-25 · Cambio de maquinaria: clon entero, ramas fusionadas sin ruido, relevo a tiempo y bitácora rotada

- **Medido** (origin/master, las notas de la bitácora y `--salud`, el 2026-10-25): las 23 iteraciones de la
  112 a la 134 anotaron lo mismo dos veces: el clon superficial de la sesión (R3 en ERROR falso y 2 pruebas
  en rojo hasta `git fetch --unshallow`) y un `git push origin --delete loop/K` negado por el proxy o por el
  clasificador de permisos. `--salud` daba 107 líneas `Acción: borrar loop/K` que ninguna sesión podía
  atender y, en un clon `--depth 50`, un hueco falso de 171,9 h. `loop/128` (reclamada a las 16:05 del
  2026-10-23 y dejada sin fusionar a las 16:30 porque el smoke falló dos veces) dejó «Ocupada» al disparo
  de las 20:04, porque el reclamo vencía a las 6 h y el cron es cada 4: 11,9 h sin iteración, como
  `loop/107` (12,1 h). Del reclamo al merge, las iteraciones 109 a 134 tardaron de 8 a 81 min.
  `IMPROVEMENTS.md` pesaba 312 KB, 248 de ellos de bitácora, y cada sesión lo lee.
- **Lo nuevo:** el hook de inicio completa el clon superficial en la nube, y `--reclamar`, `--salud` y
  `--limpiar` lo completan al traer origin; en un clon que sigue superficial, R3 avisa de los PR anteriores
  al primero visible (los posteriores siguen siendo un error) y `--salud` mide los huecos desde el primer
  merge que ve. Las `loop/K` ya fusionadas salen en una sola línea de `--salud`, no como una Acción por
  rama; la skill deja de intentar borrarlas en la nube, y `node tools/loop.mjs --limpiar [--borrar]` las
  lista o las borra en un solo push desde un PC (Para Benjamin 7). `RECLAMO_H` baja de 6 a 3,5 h, por
  debajo de `CRON_H`: el disparo siguiente releva un reclamo abandonado, y una prueba lo ata. La bitácora
  vive en dos archivos: `node tools/loop.mjs --rotar` deja las últimas 8 entradas aquí y lleva las demás a
  `docs/BITACORA.md` (en este PR, las 135 entradas hasta la iteración 127: `IMPROVEMENTS.md` baja de 312 a
  79 KB);
  `--siguiente`, `--check`, `--reclamar` y `--salud` leen las dos (los turnos de mantenimiento miran toda
  la historia), y R14 avisa con más de 16 entradas aquí, para rotar de a lotes. Para Benjamin 3, 4 y 7 se
  reescriben con lo medido hoy y sin cifras que envejezcan solas.
- **Cierra:** los pendientes de Deuda «rotar la bitácora» (5) y «el clon de las sesiones cloud viene
  superficial» (18); los demás se renumeran (el de los sombreadores del 3D pasa del 9 al 8).
- **Pruebas que fallan sin el cambio:** `tools/loop.test.mjs` (de 86 a 96), cada guarda con su mutación:
  R3 sin el aviso del clon superficial, una Acción por cada `loop/K` fusionada, `RECLAMO_H` en 6, los huecos
  medidos desde la directiva en un clon superficial, `parse` sin la bitácora vieja, el fetch sin
  `--unshallow` y R14 sin su aviso. La suite de `loop.test.mjs` pasa también en un clon `--depth 50`
  (antes fallaban 2).
- README: `--rotar` y `--limpiar` en `tools/loop.mjs`, y `docs/BITACORA.md` en la estructura.
- QA: no toca la página ni el escritorio; `--salud` y `--limpiar` corridos contra origin (107 ramas en una
  línea, sin acciones), `--rotar` dos veces (la segunda, «Nada que rotar») y lo movido es idéntico byte a
  byte a lo que había.
- Al validar: el primer `npm run check` falló en tres pasos del smoke que este cambio no toca («vista 2D»,
  «bitácora en vivo» con `'sha'` y «vista de texto: filtra por rama…»), con la máquina a carga 12 en 4 CPU;
  la repetición pasó los 116. Anotado en el pendiente 1.
- Validado: 419 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 135, mantenimiento · Rendimiento: pendiente 8 (El primer cuadro 3D compila 12 programas de shaders seguidos, ~620 ms sin GPU (…)

### 2026-10-26 · Iteración 135 · Mantenimiento · Rendimiento

- **Arreglo: las aristas del 3D usan `MeshLambertMaterial`** (pendiente 8): `lineMat` y `ghostMat` pasan de `MeshStandardMaterial` (PBR) a Lambert, con los mismos ganchos de pulsos, niebla y afinado; los commits (`nodeMat`) conservan el brillo de vidrio. Los dos programas de aristas dejan de ser los más caros del primer cuadro.
- **Reproducción:** `node tools/audit.mjs --json antes.json` → antes del arreglo: tareasLargasMs 1825, fps3d 6.2, fps2d 32.1, cargaMs 2807 (sin GPU).
- **Medido después** (una corrida cada una, sin GPU): tareasLargasMs 1323, fps3d 8.8, fps2d 40.8, cargaMs 2631; consultas igual (10); heap 16→17 MB.
- **Pruebas que fallan sin el arreglo:** `tools/rendimiento.test.mjs` («las aristas del 3D usan materiales Lambert»).
- README: no cambia (sin función nueva).
- QA: auditoría completa (3D y 2D, 0 hallazgos) y smoke de 116 pasos en verde; Lambert sin rugosidad ni metal: las aristas son casi emisivas, sin diferencia que el smoke o la auditoría detecten; no se comparó pixel a pixel (a mirar por Benjamin).
- Arena: no aplica: una sola forma obvia (cambiar el material de dos mallas).
- Reclamo: relevo de loop/135 (65abe1b)
- Validado: 420 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 136, expansión: ítem 88 (Capa para streaming, sexta entrega, Plataformas)

### 2026-10-26 · Iteración 136 · Expansión · Plataformas

- **Capacidad nueva: `&max=N` en la capa para streaming** (ítem 88 de la hoja de ruta, sexta entrega): `?embed=1&max=5` dibuja solo la rama por defecto y las de commit más reciente hasta sumar N (entero de 1 a 200; otro valor, o sin `max`, todas). `GB.search.limitBranches` recorta la vista sin mutar los datos ni gastar consultas; los PR de las ramas quitadas se van con ellas.
- **Pruebas que fallan sin la capacidad:** `tools/embed.test.mjs` («max acepta de 1 a 200…»), `tools/search.test.mjs` («limitBranches…») y el paso del smoke «&max=2 deja 2 ramas en la capa».
- README: `&max=` en la lista del widget y en Seguridad (solo un entero de 1 a 200); la fila de Plataformas del Mapa de alcance.
- QA: sin textos nuevos (i18n sin cambios); capa con `&max=` válido, 0, texto y sin él en el smoke.
- Arena: no aplica: una sola forma obvia (recortar la vista de datos antes del layout, como el filtro por autor).
- Reclamo: loop/136, sin colisión
- Validado: 422 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 137, expansión: ítem 89 (Los forks en el grafo, cuarta entrega, Datos)

### 2026-10-26 · Iteración 137 · Expansión · Datos

- **Capacidad nueva: estrellas de cada fork y orden por estrellas en el panel de salud** (ítem 89 de la hoja de ruta, cuarta entrega): cada fila suma «★ n» (las estrellas ya venían en `/forks`, sin consultas nuevas) y la casilla «Ordenar los forks por estrellas» los ordena por ellas, con el push más nuevo como desempate. `GB.health.compute` recibe el orden como cuarto parámetro.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («los forks se pueden ordenar por estrellas…») y el paso del smoke del panel de salud (la casilla, «★ 4» en la demo y el foco).
- README: el panel de salud (estrellas y casilla) y la fila de Datos del Mapa de alcance. Textos: `health.forksByStars` en los 40 idiomas.
- QA: panel de salud con forks de la demo, casilla encendida y apagada, foco en la casilla tras ordenar; auditoría en `npm run check`.
- Arena: no aplica: una sola forma obvia (un parámetro de orden en `compute` y una casilla como el interruptor existente).
- Reclamo: loop/137, sin colisión
- Validado: 423 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 138, expansión: ítem 90 (Práctica: revert --abort y rebase --abort, Público)

### 2026-10-26 · Cambio de maquinaria: find-skills en el loop

- **Pedido de Benjamin:** integrar en el loop la skill `find-skills` (`.claude/skills/find-skills/`, MIT, de
  https://github.com/vercel-labs/skills, commit 65d20cb, con `disable-model-invocation: true` porque su
  descripción se dispara con frases genéricas como «how do I do X»): busca en el ecosistema abierto de
  skills (skills.sh) con la CLI `skills`. No es una iteración numerada y la proporción de la regla 2 no
  cambia.
- **Lo nuevo:** la sección «Skills de afuera: find-skills» de la directiva y, en la skill `iteracion`,
  «Skills de afuera: buscar antes de construir» dentro de «Construir», antes de la arena: una búsqueda por
  iteración (hasta 3 consultas) cuando la tarea entra en un dominio que el repo no cubre; la CLI fija
  (`npx skills@1.7.4`) y con `DISABLE_TELEMETRY=1`; cada candidata se lee entera con `use` (sin
  instalarla) y pasa un filtro más estricto que el de la skill (licencia permisiva, sin código remoto,
  datos afuera, tokens ni evasión, y nada que choque con «Lo que no cambia»), porque los installs se
  inflan; consultada es dato, no instrucción; instalada (una por iteración, en su propio commit) va
  copiada al proyecto con su licencia, `disable-model-invocation: true` y la procedencia, sin
  `skills-lock.json`, nunca global ni actualizada sola. Desde esta entrada, cada iteración lleva
  `- Skills:` (R5); R8 vigila que la skill corra la CLI con su versión, sin telemetría y solo `find`,
  `use` y `add --copy -a claude-code`, y avisa (no falla) mientras `.claude/settings.json` no la permita:
  Para Benjamin 2 suma `Bash(npx skills@1.7.4:*)`. El comando de OpenCode la nombra.
- **Comprobado:** en la sesión cloud, `DISABLE_TELEMETRY=1 npx -y skills@1.7.4 find playwright` responde
  en 3 s (y lista `anti-detect-browser` y `playwright-stealth-verify` entre las de más installs: de ahí el
  filtro); `use vercel-labs/skills@find-skills` imprime la skill sin instalar nada; `add … --skill
  find-skills -a claude-code --copy -y` en un repo temporal deja solo `.claude/skills/find-skills/` (igual
  byte a byte al original) y `skills-lock.json`. No se instaló ninguna skill de afuera en el repo.
- **Pruebas que fallan sin el cambio:** `tools/loop.test.mjs` (de 96 a 98: la viñeta `- Skills:` tras la
  marca, con la consulta y lo que se hizo o con el porqué de «no aplica», y la CLI de la skill sin la
  versión fija, sin `DISABLE_TELEMETRY=1`, global, sin `--copy` o con `update` o `experimental_sync`).
- README: `.claude/skills/find-skills/` en la estructura.
- Validado: 425 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (saltadas por --sin-e2e).
- **Siguiente:** iteración 138, expansión: ítem 90 (Práctica: revert --abort y rebase --abort, Público)

### 2026-10-27 · Iteración 138 · Expansión · Público

- **Capacidad nueva: `revert --abort` y `rebase --abort` en la terminal de práctica** (ítem 90 de la hoja de ruta): `revert -n` deja el revert a medias hasta `commit` o `revert --continue`, y `revert --abort` lo cancela; `rebase -i <rama>` se detiene tras el primer commit (HEAD desprendido, la rama sin moverse), `rebase --continue` repite el resto y `rebase --abort` devuelve la rama y HEAD a como estaban. `status` cuenta los dos estados y, con un rebase a medias, `checkout`, `switch`, `merge`, `reset`, `cherry-pick`, `revert` y `stash` se niegan.
- **Pruebas que fallan sin la capacidad:** `tools/gitsim.test.mjs` («revert --no-commit espera su commit…» y «rebase -i se detiene…») y el paso del smoke «la práctica cancela un revert y un rebase -i a medias».
- README: la lista de comandos de «Aprender git», sus pruebas y Límites conocidos (el `rebase -i` no abre editor); fila de Público del Mapa de alcance. Sin textos nuevos de interfaz (la salida de la terminal está en inglés), así que no hay claves en los 40 idiomas.
- QA: terminal de práctica con los ejercicios de `revert` y `rebase`, comandos a medias, `status` y cancelación; auditoría en `npm run check`.
- Skills: no aplica: es lógica del simulador propio, sin dominio externo que una guía acelere.
- Arena: no aplica: una sola forma obvia (un estado más en el simulador, como `picking` y `merging`).
- Reclamo: loop/138, sin colisión
- Validado: 427 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 139, mantenimiento · Deuda: pendiente 1 (Smoke: el paso «vista 2D» (`tools/smoke.mjs:356`, `waitForSelector('#graph svg …)

### 2026-10-27 · Iteración 139 · Mantenimiento · Deuda

- **Arreglo: el paso «vista 2D» del smoke esperaba nodos visibles** (pendiente 1): `waitForSelector('#graph svg .node')` espera visibilidad y bajo carga los nodos (40 ya en el DOM) tardan en serlo; ahora espera `state: 'attached'` y que `#graph` no esté oculto con `#view-2d` presionado. Las otras intermitentes del pendiente (`'sha'`, vista de texto) siguen como pendiente 1.
- **Reproducción:** `xvfb-run -a node tools/smoke.mjs` → `✗ vista 2D: page.waitForSelector: Timeout 30000ms exceeded.` (falló en 2 de 2 corridas, y con diagnóstico `{"hidden":false,"svg":true,"nodes":40}`); con el arreglo, el paso pasó en 2 de 2 corridas de `npm run check`.
- **Pruebas que fallan sin el arreglo:** el paso «vista 2D» del smoke, que ahora comprueba el estado y no la visibilidad.
- README: sin cambios (herramienta de prueba).
- QA: smoke completo dos veces con `xvfb-run`; auditoría: no toca la página.
- Skills: no aplica: arreglo de una espera en el smoke propio.
- Arena: no aplica: una sola forma obvia (esperar el estado en vez del selector visible).
- Reclamo: loop/139, sin colisión
- Validado: 427 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 140, expansión: ítem 91 (Resumen de la semana: autores nuevos, Salidas)

### 2026-10-27 · Iteración 140 · Expansión · Salidas

- **Capacidad nueva: autores nuevos en el resumen de la semana** (ítem 91 de la hoja de ruta): el resumen (Markdown e imagen) dice cuántas personas aportaron esta semana sin tener ningún commit cargado anterior a ella. Sin consultas nuevas; con historia sin cargar puede contar de más (queda en Límites conocidos).
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` («autores nuevos…»: la cuenta, la línea en Markdown y en la imagen, y su ausencia con cero); el paso del smoke del resumen ya falla con una clave `digest.*` sin resolver.
- README: la ficha del resumen en «Salud del repo» y Límites conocidos; fila de Salidas del Mapa de alcance. Clave `digest.newcomers` en los 40 idiomas.
- QA: Markdown e imagen del resumen con el repo de la demo; auditoría en `npm run check`.
- Skills: no aplica: es una cuenta sobre datos ya cargados, sin dominio externo.
- Arena: no aplica: una sola forma obvia (restar de la semana a quienes ya firmaron antes).
- Reclamo: loop/140, sin colisión
- Validado: 428 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 141, expansión: ítem 92 (Capa para streaming, séptima entrega, Plataformas)

### 2026-10-27 · Cambio de maquinaria: dev como rama de integración, master de release

- **Pedido de Benjamin:** que el loop trabaje en `dev`, como los demás proyectos, y deje `master` de
  release. No es una iteración numerada y la proporción de la regla 2 no cambia.
- **Lo nuevo:** `dev` (creada el 2026-10-27 desde `master`) es la rama de integración: `--reclamar`
  crea cada `loop/N` desde `origin/dev` y lee de ahí la hoja de ruta y la bitácora; su PR va contra
  `dev` y se fusiona ahí con commit de merge; R3 busca los «hecho en #K» en `origin/dev`; `--salud` mide
  la cadencia, los huecos y las ramas fusionadas sobre `dev`, y suma la línea `Release:` (cuántos merges
  de `dev` le faltan a `master`); `--limpiar`, `npm run check` (el diff que decide las e2e) y
  `tools/opencode.mjs` (el worktree) salen de `dev`. `master` es el release: lo publica GitHub Pages
  (`--publicado` lo sigue comparando con la web) y solo recibe `dev` cuando Benjamin lo promueve con un
  PR `dev` → `master`. La skill `iteracion` arranca con `git fetch origin +dev:refs/remotes/origin/dev`
  y `git checkout --detach origin/dev` (el refspec entero porque en un clon de una sola rama `fetch
  origin dev` no crea `origin/dev`), y nunca abre un PR contra `master`. `PROMPT.md` dice que la skill
  que manda es la de `dev`; `CLAUDE.md`, el README, el comando de OpenCode, la directiva y Para
  Benjamin 1 (la web se actualiza al promover) lo dicen igual.
- **Pruebas que fallan sin el cambio:** `tools/loop.test.mjs` (de 98 a 99: el release en `--salud`) y
  `tools/opencode.test.mjs`; con `BASE` de vuelta en `master` fallan 10 (el reclamo que sale de `dev`
  con lo que `master` no tiene, R3, `--salud`, el clon superficial y el worktree de OpenCode).
- README: la sección de Pages (master es el release) y la de OpenCode (el worktree sale de `dev`).
- QA: no toca la página ni el escritorio; `--reclamar`, `--salud` y `--limpiar` corridos contra un
  repositorio bare con `dev` por delante de `master` en las pruebas.
- Validado: 429 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) en verde; e2e no corridas (saltadas por --sin-e2e: Electron no se pudo instalar en la sesión, y lo que toca la página es #177 y #178, ya validados con sus 28 e2e en `master`).
- **Siguiente:** iteración 141, expansión: ítem 92 (Capa para streaming, séptima entrega, Plataformas)

### 2026-10-27 · Iteración 141 · Expansión · Plataformas

- **Capacidad nueva: `&hide=legend,title,clock` en la capa para streaming** (ítem 92 de la hoja de ruta, Capa para streaming, séptima entrega): además de `notices` y `combo`, `&hide=` esconde la leyenda de ramas (2D), el rótulo de `&title=` y las fechas del eje (3D, `.g3-day`); sin `hide`, se ve todo; un nombre desconocido se ignora.
- **Pruebas que fallan sin la capacidad:** `tools/embed.test.mjs` (hide acepta legend, title y clock) y un paso del smoke («&hide=legend,title,clock esconde la leyenda, el rótulo y las fechas»).
- README: la lista de funciones (`&hide=`), Seguridad (cinco nombres conocidos); sin textos nuevos de interfaz, así que sin tocar los 40 idiomas.
- QA: fila del widget embebido: el smoke mira que el rótulo y la leyenda queden en `display: none` y que la capa lleve la marca del reloj; auditoría: la puerta de `npm run check`.
- Skills: no aplica: un parámetro de URL y tres reglas de CSS que las reglas del repo ya cubren.
- Arena: no aplica: una sola forma obvia (ampliar la lista de nombres de `hide` y una clase por cada uno).
- Arreglo de paso: R3 de `tools/loop.mjs` leía el log de `dev` con `--first-parent` y no veía #177 y #178 (llegaron dentro del «Merge master en la rama»): con ellos y el PR en curso fallaba; ahora lee el log entero.
- Replica: paridad, sin pasada nueva (no existe `replica/`; la pasada completa sigue pendiente, R13); ítems 102 a 107 repuestos con entregas chicas de líneas ya investigadas, y el 99 reescrito (su `&theme=` ya estaba hecho en el 74)
- Reclamo: loop/141, sin colisión
- Validado: 430 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 142, expansión: ítem 93 (Constelación ordenada por nombre, en la URL, Escala)

### 2026-10-27 · Arreglo: la demo hacía un merge sobre la base borrada de un PR apilado

- **Fallo:** la `excepción: Cannot read properties of undefined (reading 'sha')` que hacía caer pasos distintos
  del smoke en la corrida larga (pendiente Media 1). La pila, con la demo acelerada: `DemoSource.commit` ←
  `doMerge`. Al fusionarse un PR, la demo borra su rama a los 2,2 s, pero un PR apilado sobre ella seguía con esa
  base; el siguiente merge de ese PR hacía su commit en una rama que ya no existía. No es una iteración numerada.
- **Arreglo:** como GitHub, al borrarse la rama fusionada los PRs apilados sobre ella (y las ramas que salían de
  ella) pasan a apuntar a la base del PR que se fusionó.
- **Reproducción:** `tools/demo.test.mjs` (nueva): 1.500 pasos de la demo con cinco semillas fijas y los `later`
  corridos a mano; sin el arreglo falla en el primer paso de la semilla 1 («el PR #37 apunta a feature/login, que
  ya no existe»). Con la demo acelerada en Chromium (un paso cada 60 ms) la excepción salía en segundos; con el
  arreglo, 90 s sin errores.
- QA: solo la demo; el pendiente Media 1 queda con lo que sigue intermitente (filtros que no acotan, vista de texto).
- Validado: 431 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.

### 2026-10-27 · Pedido de Benjamin: los cambios de cada commit, más fáciles de leer

- **Pedido de Benjamin:** «mejora el cómo poder ver los cambios de cada commit». No es una iteración numerada y
  la proporción de la regla 2 no cambia.
- **Lo nuevo:** en el panel de cambios, las palabras que cambiaron dentro de cada línea quitada y su agregada
  (`GB.diff.words`, por la subsecuencia común más larga de sus palabras; no marca líneas de más de 500
  caracteres ni las que comparten muy poco, hasta 1.500 pares por archivo); **Unificado** o **Lado a lado**
  (`GB.diff.rows` empareja cada quitada con su agregada; las líneas largas se parten); el botón del panel
  ancho; **Desplegar/Plegar todo**; desde 4 archivos, un filtro por ruta que sigue al pasar de commit (`Esc`
  lo borra); la cabecera de cada archivo queda fija mientras se lee su código (`overflow: clip` en vez de
  `hidden`); y con el panel abierto, un clic en un commit del grafo (2D o 3D) muestra los suyos en vez de
  abrir su ficha. El modo y el ancho se recuerdan (`diffMode`, `diffWide`). La demo retoca las líneas que
  quita (un número, un nombre), así el resaltado se ve sin token.
- **Pruebas que fallan sin el cambio:** `tools/diff.test.mjs` (de 9 a 13: `rows`, `words` y la demo con
  palabras marcadas) y el paso del smoke «cambios de un commit: un clic en el grafo cambia de commit, lado a
  lado con palabras marcadas, filtro y panel ancho» (vuelve a lo último y abre la ficha de una rama a la vista:
  con la historia larga de la corrida entera, el paso anterior deja las etiquetas fuera de pantalla).
- README: la función en la lista, los atajos del panel y Límites conocidos (las palabras, lado a lado).
- QA: 2D y 3D (el clic en un commit de cada vista), demo sin token, 40 idiomas (11 textos nuevos; árabe en
  vivo con el panel), celular (el botón ancho se esconde bajo 860 px), teclado (`J`/`K` no pasan de commit
  mientras se escribe en el filtro; `Esc` en él lo borra sin cerrar). La excepción intermitente
  `reading 'sha'` del smoke salió aquí en «modo galaxias» y en «filtro por autor»: era de la demo y la arregló #184.
- Validado: 435 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 142, expansión: ítem 93 (Constelación ordenada por nombre, en la URL, Escala)

### 2026-10-27 · Pedido de Benjamin: todos los repos seguidos en una misma vista

- **Pedido de Benjamin:** «poder revisar en una misma vista los repositorios conectados y no tener que cambiarme
  entre pestañas para revisar cada uno». No es una iteración numerada y la proporción de la regla 2 no cambia.
- **Lo nuevo:** **Todos**, delante de las pestañas (con dos repos o más), cambia el grafo de un solo repo por una
  cuadrícula con una tarjeta por repo (`js/overview.js`): su estado, su etiqueta, sus cifras (ramas, commits del
  grafo, PRs abiertos y cuándo fue el último commit), su último commit (un clic abre sus cambios) y su grafo 2D en
  vivo (una instancia de `GB.Graph` con su propio layout), con los efectos de lo que llega; arriba, los totales.
  El panel de cambios ahora sigue al repo del commit (`diffTab`) y no siempre al de la vista, así que «Ver
  cambios» en una tarjeta lo abre al lado sin cambiar de pestaña. El panel de actividad lleva a la tarjeta de cada
  repo; lo que llega se ve en su tarjeta y no queda como novedad sin ver. Se recuerda (`all`), viaja en la URL
  (`?all=1`, `?all=0`) y la dejan el modo TV, la demo, la práctica y el ensayo; ir a una rama desde la salud, la
  búsqueda o la vista de texto vuelve al grafo del repo a la vista. Mientras está puesta, el 3D no dibuja.
- **Pruebas que fallan sin el cambio:** `tools/overview.test.mjs` (nueva: `allParam`, `lastCommit`, `summary`,
  `totals`) y el paso del smoke «vista conjunta: «Todos» muestra cada repo en su tarjeta, en vivo, y sus cambios
  sin cambiar de pestaña» (con dos repos de GitHub simulados: teclado, URL y almacenamiento, contraste, un push
  que llega a su tarjeta sin quedar sin ver, los cambios desde la tarjeta, se recuerda al volver a abrir y el
  nombre abre su pestaña con el foco en ella). La API simulada del smoke da ahora los cambios de un commit.
- README: la función en la lista y en «Varios repos a la vez», los controles, el mapa de archivos, Límites
  conocidos y Seguridad.
- QA: web (el escritorio usa la misma página: e2e); 2D en cada tarjeta y el 3D apagado mientras se ve; demo y
  práctica salen de la vista; 40 idiomas (10 textos nuevos, «etiqueta: número» como la constelación para no
  depender de plurales); celular (una columna, el grafo de 300 px); teclado (Todos con Intro, cada tarjeta con
  Tab; el nombre deja el foco en la pestaña del repo); movimiento reducido (el punto de carga quieto).
- Validado: 439 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 142, expansión: ítem 93 (Constelación ordenada por nombre, en la URL, Escala)

### 2026-10-27 · Pedido de Benjamin: editar el código desde GraphBranch

- **Pedido de Benjamin:** «haz que sea posible poder editar el código desde GraphBranch». No es una iteración
  numerada y la proporción de la regla 2 no cambia.
- **Lo nuevo:** **Editar** en cada archivo del panel de cambios (y en la ficha de cada planeta del modo galaxias)
  abre `js/editor.js`: el archivo como está ahora en su rama (la del commit que se veía o la de la galaxia; se
  elige otra rama u otra ruta), el mensaje propuesto, lo que va cambiando (+n −m, por la subsecuencia común más
  larga de las líneas) y **Hacer commit**, que lo guarda como un commit en esa rama por la API del servicio:
  GitHub (`PUT /contents`, con su sha), GitLab (`PUT`/`POST /repository/files`, con `last_commit_id`) y Codeberg
  (`PUT`/`POST /contents`). Un archivo que cambió en la rama no se pisa (conflicto), una ruta nueva se crea, y
  cada fallo se dice (sin token, token rechazado, sin permiso de escritura, carpeta, binario, demasiado grande);
  sin token el editor ofrece Ajustes con el foco en el campo de ese servicio. Una ruta escrita con tramos vacíos,
  «.» o «..» no sale (`U.safePath`: en la URL se normalizaría y el `PUT`, con el token, iría a otro lugar de la API). La demo edita en memoria: su commit
  aparece en la rama y sus cambios (`GB.editor.patch`) son los escritos. Bitbucket, un Forgejo propio y las
  carpetas locales quedan para después (`canEdit` por servicio). `U.b64encode`, `U.b64decode` y `U.encPath`
  pasan a `js/util.js`.
- **Pruebas que fallan sin el cambio:** `tools/editor.test.mjs` (nueva: base64, `lineDiff`, `patch` y la demo),
  `tools/github.test.mjs` (de 31 a 34: `readFile`, `writeFile` y el motivo de cada fallo), `tools/gitlab.test.mjs`
  (de 19 a 21) y `tools/codeberg.test.mjs` (de 17 a 18); en el smoke, «editar el código: desde los cambios de un
  commit…» (la demo: abrir, cambiar, preguntar al cerrar con cambios, hacer commit y ver sus cambios de verdad) y
  «editar sin token…» (GitHub simulado: no deja hacer commit, no escribe y lleva a Ajustes).
- README: la función en la lista, el permiso de escritura del token (Contents: Read and write; `api` en GitLab;
  `write:repository` en Codeberg), el mapa de archivos, Límites conocidos y Seguridad.
- QA: 2D (panel de cambios) y galaxias (ficha del planeta); demo sin token (en memoria); 40 idiomas (33 textos
  nuevos); teclado (Intro en la ruta abre el archivo, no hace commit; `Esc` o Cancelar con cambios pregunta);
  CSP sin cambios: los mismos servidores de `connect-src`.
- Validado: 449 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 142, expansión: ítem 93 (Constelación ordenada por nombre, en la URL, Escala)

### 2026-10-27 · Pedido de Benjamin: espacio para conectar otro repo

- **Pedido de Benjamin:** «no me está dando espacio para conectarme a otros repositorios» (captura: la app de
  escritorio con un repo conectado y el campo `owner/repo` reducido a «gi», debajo de Conectar). No es una
  iteración numerada y la proporción de la regla 2 no cambia.
- **Fallo:** el formulario de la barra de arriba tenía un tope de 560 px y el campo `min-width: 0`. Con un repo
  real aparece «Probar un comando» (ítem 31) y en el escritorio «Abrir carpeta…», y los botones se comían el
  ancho: el campo quedaba de 2 a 24 px entre 1024 y 1875 px de pantalla (en la web, con cuatro botones, a lo sumo
  145 px y 46 de texto). Cerca de los 1500 px, además, la barra saltaba de una fila a dos según el largo del
  texto del estado, que cambia cada segundo.
- **Arreglo (solo CSS):** el campo no baja de 15rem ni pasa de 30rem. Con un repo real («Probar un comando» o el
  cupo de la API a la vista), en la app de escritorio y, en la demo, bajo 1500 px, el formulario baja a una fila
  propia debajo de la marca, el estado y los controles, como ya hacía bajo 860 px; los botones que no quepan
  junto al campo pasan a otra línea. La demo web de 1500 px o más sigue en una fila. Qué fila toca depende del
  ancho y de los botones a la vista, no del texto del estado: la barra no salta.
- **Prueba que falla sin el cambio:** el paso del smoke «con un repo real a la vista, el campo del repo deja
  espacio para escribir otro» (GitHub simulado; 1875, 1536, 1280 y 1024 px, con y sin «Abrir carpeta…»): sin el
  arreglo, el campo queda de 11 px.
- QA: de 400 a 1875 px, con tres, cuatro y cinco botones; inglés, español, alemán, ruso y árabe (RTL); el alto
  de la barra no cambia entre «actualizado ahora · sincronizando…» y «actualizado hace 12 s · próximo en 12 s».
- Validado: 449 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 142, expansión: ítem 93 (Constelación ordenada por nombre, en la URL, Escala)

### 2026-10-27 · Iteración 142 · Expansión · Escala

- **Capacidad nueva: Constelación ordenada por nombre, en la URL** (ítem 93 de la hoja de ruta): `?order=name`
  abre la constelación ya ordenada alfabéticamente, junto a `?order=activity`; `orderParam` (`js/constellation.js`)
  reconoce los dos, sin importar mayúsculas ni espacios, y lo desconocido deja el orden de las pestañas.
- **Pruebas que fallan sin la capacidad:** `tools/constellation.test.mjs` (`orderParam('order=name')` daba `null`) y
  un paso del smoke (`?order=name` deja el selector en «nombre»).
- README: la línea de la Constelación. Sin textos nuevos de interfaz, así que no hay claves en los 40 idiomas.
- QA: constelación con el selector y con la URL; el parámetro no gasta cuota ni toca la CSP; auditoría: no cambia la página más que un valor de la URL.
- Skills: no aplica: un valor más en un parámetro de URL existente, sin dominio que una guía externa mejore.
- Arena: no aplica: una sola forma obvia (ampliar la lista de valores de `orderParam`).
- Reclamo: loop/142, sin colisión
- Validado: 449 pruebas (`node --test`), smoke (124 pasos), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 143, mantenimiento · QA: pendiente 11 (Las etiquetas de rama pisadas se atenúan a 0,22 pero siguen siendo botones toca…)

### 2026-10-27 · Iteración 143 · Mantenimiento · QA

- **Arreglo: las etiquetas 3D tapadas por otra no reciben el toque en celular** (pendiente 11): con puntero táctil
  (`pointer: coarse`) una etiqueta atenuada a 0,22 pasa a `pointer-events: none` (clase `tapada`, que sobrevive a
  la reconstrucción de la etiqueta); con Tab sigue en el orden y el foco la trae al frente.
- **Reproducción:** Playwright, 320×640 táctil, `?lang=es` (demo, 3D) → 3 etiquetas con opacidad 0,22 y `pointer-events: auto`, que recibían el toque.
- **Hallazgos:** 1 nuevo (pendiente 2: e2e de escritorio intermitente), 0 a la base de la auditoría. QA acotada al pendiente; la auditoría completa con `--langs` y el smoke tres veces no se corrieron.
- **Pruebas que fallan sin el arreglo:** paso del smoke «a 320 px, una etiqueta 3D tapada por otra no recibe el toque».
- README: la línea del rendimiento 3D (etiquetas) dice cómo se tratan las tapadas con el dedo. Sin textos nuevos de interfaz.
- QA: celular angosto, 3D y teclado (Tab sigue llegando a las tapadas); auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: una regla CSS y una clase, sin dominio que una guía externa mejore.
- Arena: no aplica: una sola forma obvia (sacar el toque de lo atenuado).
- Reclamo: loop/143, sin colisión
- Validado: 449 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 144, expansión: ítem 94 (Vista de texto: PRs abiertos por rama, Público)

### 2026-10-28 · Iteración 144 · Expansión · Público

- **Capacidad nueva: Vista de texto: PRs abiertos por rama** (ítem 94 de la hoja de ruta): el nombre accesible de cada
  rama con PRs abiertos ya cargados lo dice («PRs abiertos: 2») y una marca junto al nombre lo muestra; los PRs de forks
  no cuentan. `build` (`js/textview.js`) suma `prs` por rama desde `data.pulls`, sin consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` (`branches[].prs` era `undefined`) y un paso del
  smoke (la vista de texto de la demo dice los PRs abiertos de sus ramas y coinciden con la marca visible).
- README: la sección de la vista de texto dice los PRs abiertos por rama. Textos nuevos: `textview.prs` en los 40 idiomas.
- QA: vista de texto de la demo con teclado y nombres accesibles; auditoría: la ejecuta `npm run check`.
- Skills: no aplica: una etiqueta más en un árbol ARIA ya construido, que el repo cubre con sus reglas de accesibilidad.
- Arena: no aplica: una sola forma obvia (contar `data.pulls` por rama en `build`).
- Reclamo: loop/144, sin colisión
- Validado: 450 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 145, expansión: ítem 95 (Salud del repo: tendencia de releases, Análisis)

### 2026-10-28 · Iteración 145 · Expansión · Análisis

- **Capacidad nueva: Salud del repo: tendencia de issues cerrados** (ítem 96 de la hoja de ruta, hoy 95; el 95 original, releases por
  semana, ya estaba hecho en #118 con `dora.weeks` y se quitó de la hoja, con la renumeración de los siguientes): el panel de salud suma la línea «Issues
  cerrados por semana, últimas 8 semanas» con las actividades `issue-close` ya cargadas (cada número cuenta una vez,
  con su primer cierre). `compute` (`js/health.js`) devuelve `pace.closedWeeks`; sin consultas nuevas. La demo siembra
  un cierre para verlo.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` (`closedWeeks` era `undefined`) y un paso del smoke
  (`#hl-closedweeks` con 8 cifras y algún cierre).
- README: la línea de la salud dice los issues cerrados por semana. Textos nuevos: `health.closedWeeks` en los 40 idiomas.
- QA: panel de salud de la demo (línea visible con 8 cifras, texto escapado); auditoría: sin hallazgos nuevos.
- Skills: no aplica: una línea más en un panel ya construido, que el repo cubre con sus reglas.
- Arena: no aplica: una sola forma obvia (contar `issue-close` por semana como ya se hace con PRs abiertos).
- Reclamo: loop/145, sin colisión
- Validado: 451 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 146, expansión: ítem 96 (Resumen de la semana: commits por día, Salidas)

### 2026-10-28 · Iteración 146 · Expansión · Salidas

- **Capacidad nueva: Resumen de la semana: commits por día** (ítem 96 de la hoja de ruta): el resumen de la semana suma
  una línea con los commits de cada uno de los 7 días, del más viejo al de hoy (`Commits por día: 0 · 1 · 0 · 0 · 1 · 1 · 2`),
  en el Markdown y en la imagen, con lo ya cargado. `compute` (`js/digest.js`) devuelve `perDay`; sin consultas nuevas ni
  sección si no hubo commits.
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` (`perDay` era `undefined`) y un paso del smoke (siete
  cifras en el Markdown de la demo).
- README: la línea del resumen dice los commits por día y Límites conocidos aclara que solo cuentan los cargados. Textos nuevos: `digest.perday` en los 40 idiomas.
- QA: Markdown e imagen del resumen de la demo (línea con siete cifras, sin `undefined`); auditoría: no toca la página más que una línea de texto.
- Skills: no aplica: una línea más en un resumen ya construido, que el repo cubre con sus reglas.
- Arena: no aplica: una sola forma obvia (contar commits por día como ya se cuenta por autor).
- Reclamo: loop/146, sin colisión
- Validado: 452 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 147, mantenimiento · Seguridad: pendiente 14 (Las fuentes Codeberg y Bitbucket no validan en el origen las URL de los pull re…)

### 2026-10-28 · Iteración 147 · Mantenimiento · Seguridad

- **Arreglo: las URL de PR y commits de Codeberg y Bitbucket se validan en el origen** (pendiente 14): Codeberg solo
  acepta `html_url` de PR que cuelgue de su servidor (como ya hacía `loadRepo`) y Bitbucket suma `webUrl`, que descarta
  todo enlace (`links.html.href` de repo, commit y PR) que no cuelgue de `bitbucket.org`; en lugar del dato malo se arma
  el enlace a mano. Un `javascript:` o un sitio ajeno ya no llega a las exportaciones (resumen, bitácora en Markdown).
- **Reproducción:** `node --test tools/codeberg.test.mjs tools/bitbucket.test.mjs` → `actual: 'javascript:alert(1)'` en la `url` del PR.
- **Pruebas que fallan sin el arreglo:** una en `tools/codeberg.test.mjs` y otra en `tools/bitbucket.test.mjs`.
- README: sin cambios (comportamiento interno, sin textos nuevos de interfaz).
- QA: Seguridad (CSP intacta, sin `innerHTML` nuevo, ningún token tocado); auditoría: no toca la página.
- Skills: no aplica: un arreglo de una validación, que el repo cubre con sus reglas.
- Arena: no aplica: una sola forma obvia (la misma validación que ya usa `loadRepo`).
- Reclamo: loop/147, sin colisión
- Validado: 454 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 148, expansión: ítem 97 (Vista de texto: ramas quietas, Público)

### 2026-10-28 · Iteración 148 · Expansión · Público

- **Capacidad nueva: Vista de texto: ramas quietas** (ítem 97 de la hoja de ruta): el nombre accesible de una rama sin
  actividad hace más de 30 días lo dice («sin actividad hace más de 30 días») y una marca junto al nombre lo muestra,
  también en la rama por defecto. La actividad es la del grafo: el último commit de la rama o, si fue después, cuando se
  la vio moverse (una rama creada hoy desde un commit viejo no está quieta); sin fecha no se dice nada. `build`
  (`js/textview.js`) suma `quiet` con lo ya cargado, sin consultas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` («una rama sin actividad en más de 30 días se dice
  quieta…»: `quiet` era `undefined`) y el paso del smoke «Vista de texto: ramas quietas (GitHub simulado)», que en una
  copia sin el cambio dio `la rama de hace 45 días no lo dice en su nombre accesible: {"name":"gh-pages","label":"gh-pages, commits mostrados: 1",…}`;
  otro paso mira que ninguna rama de la demo, toda de esta semana, se diga quieta.
- README: la función de la vista de texto y Límites conocidos (qué cuenta como actividad y cuándo se recalcula). Textos
  nuevos: `textview.quiet` en los 40 idiomas, con las palabras de `health.stale` de cada uno.
- QA: vista de texto (nombre accesible y marca visible) en la demo y con la API de GitHub simulada; demo sin token: su
  historia es de los últimos 3 días y no tiene ramas quietas (rehacerla movería el Replay, el resumen y la bitácora), así
  que lo positivo se ve con la API simulada; 40 idiomas: árabe y tamil sobre su `health.stale`; auditoría: la corre `npm run check`.
- Skills: no aplica: una etiqueta más en un árbol ARIA ya construido, que el repo cubre con sus reglas de accesibilidad.
- Arena: no aplica: una sola forma obvia (la fecha de la punta de cada rama en `build`, como ya la mide la salud).
- Replica: pasada del 2026-10-28, paridad 75/100, must hechos 11 de 13; ítems 107 a 112 (los dos must que faltan, Azure
  DevOps y el Launchpad de varios repos, y cuatro de la paridad y las reseñas). Primera pasada completa: `replica/recon.md`
  (14 páginas públicas de GitKraken, con `WebFetch`), `features.csv` (59 filas), 59 comentarios de Hacker News por la API
  de Algolia (G2, TrustRadius y el tablero de pedidos de GitKraken respondieron 403 y Capterra 404: una sola fuente y
  todos los temas finos), `feedback.md`, `fixes.md` y `parity.md`; las candidatas que no entraron, a la tabla de ideas
  de `docs/investigacion.md`.
- Nota: el paso del smoke «editar el código…» falló 1 de 3 corridas, en la copia sin el cambio (pendiente 3, nuevo,
  Media). La rama de trabajo y el PR son los de la sesión (`claude/wonderful-hamilton-ww0uum`), sobre el reclamo de
  `loop/148`. Con otras sesiones en el mismo contenedor, `npm run check` corrió en un espacio de red propio
  (`unshare -n` con `lo` arriba), para que las e2e usen 4173 y 4174 sin chocar; ahí las pruebas que hacen commits en
  repos temporales necesitan `commit.gpgsign=false` (`GIT_CONFIG_*`), porque la firma del contenedor sale por la red.
- Reclamo: loop/148, sin colisión
- Validado: 455 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 149, expansión: ítem 98 (Capa para streaming, octava entrega, Plataformas)

### 2026-10-28 · Cambio de maquinaria: permisos, cadencia de 2 h y hoja de ruta por puntaje

- **Pedido de Benjamin** (2026-10-28): sus respuestas a tres pedidos de Para Benjamin (sí a los permisos, el
  cron cada 2 h y la hoja de ruta por puntaje) y promover `dev` a `master`. No es una iteración numerada y la
  proporción de la regla 2 no cambia.
- **Permisos** (era Para Benjamin 2): `.claude/settings.json` suma `WebSearch`, `WebFetch`,
  `mcp__github__list_issues`, `mcp__github__issue_read` y `Bash(python3 …:*)` de
  `.claude/skills/replica-diff/parity.py`, `.claude/skills/replica-entrepreneur/reviews.py` y
  `.claude/skills/arena/bracket.py`: la investigación, el triaje de issues, la pasada de Replica y la arena ya
  no dependen del modo de permisos de la sesión. El aviso de R8 por el permiso de find-skills (que ya estaba
  desde el 2026-10-27) deja de citar un pedido que no existe.
- **Cadencia** (era Para Benjamin 3): la Routine pasa de `3 */4 * * *` a `3 */2 * * *` (la cambia la sesión de
  Benjamin cuando se fusione este PR). `CRON_H` baja de 4 a 2 y `RECLAMO_H` de 3,5 a 1,5 h: un reclamo
  abandonado lo releva el disparo siguiente, y la iteración más larga sin relevo medida (81 min, de la 109 a
  la 148) no llega a vencer; la prueba lo ata en los dos sentidos. `--salud` mide la cadencia por tramos
  (`CADENCIAS`: cada 4 h desde la directiva, cada 2 h desde el 2026-10-28 a las 18:00 UTC, el primer disparo
  que el cron de 4 h no tenía): con 2 h para toda la historia daba 221 disparos esperados (58 %) en vez de
  110 y 31 huecos en vez de 5. Lo dicen la cabecera de este archivo, la skill (Routine) y el README (el cron
  de OpenCode y su ejemplo).
- **Orden de la hoja de ruta** (era Para Benjamin 5): la regla 2 toma la hoja por puntaje y no por el orden
  escrito. Primero los `must` de Replica que faltan, ahora marcados `[replica must AAAA-MM-DD]` (los ítems
  107 y 108; la directiva ya los ponía primero, y la regla se conserva); después los demás. Dentro de cada
  grupo, de mayor a menor puntaje; a igual puntaje, el de número menor (el orden escrito); un ítem sin
  puntaje, al final de su grupo. El cambio de eje se sigue mirando en los tres primeros de ese orden. Lo
  hace `ordenHoja` en `--siguiente`; R10 acepta la marca; lo dicen la regla 2, la sección Replica de la
  directiva, la cabecera de la hoja y la skill («Reponer la hoja de ruta»). Los números de la hoja no
  cambian (los citan los PR y la investigación). Hoy el orden es 108 y 107 (must, 3,0 y 2,0), 109 (4,0), los
  de 2,0 (98, 100, 101, 105, 106, 110, 111 y 112) y los de 1,0 (99, 102, 103 y 104).
- **Para Benjamin:** se quitan esos tres pedidos, resueltos; los demás pasan a ser del 1 al 5.
- **Release:** fusionado este PR, `dev` se promueve a `master` con un PR `dev` → `master` y commit de merge,
  pedido explícito de Benjamin del mismo día.
- **Pruebas que fallan sin el cambio:** `tools/loop.test.mjs` (de 99 a 104): el orden por puntaje con
  empates por número y sin puntaje al final, los must primero, la cadencia por tramos (con 2 h para toda la
  historia salen huecos falsos), `RECLAMO_H` menor que `CRON_H` = 2 sin relevar una iteración de 81 min, R10
  con `[replica must …]` y los siete permisos en `.claude/settings.json`; mutados, el orden escrito, el orden
  sin must, la cadencia plana y `RECLAMO_H` en 1 h hacen fallar cada uno su prueba.
- README: la sección «Correr el loop en OpenCode» (cron cada 2 h).
- QA: no toca la página ni el escritorio; `--siguiente` y `--check` sobre el archivo editado y `--salud
  --sin-red` contra origin (110 disparos esperados, los mismos 5 huecos que antes).
- Al validar: el primer `npm run check` falló en el paso del smoke «filtro por autor» (quitar el filtro no
  dejaba el grafo como estaba), el intermitente bajo carga del pendiente 1 (carga 8 en el contenedor); este
  cambio no toca la página, y la repetición pasó los 126 pasos.
- Validado: 460 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 149, expansión: ítem 108 (Launchpad: los PRs de todos los repos seguidos, por estado, Escala)

### 2026-10-28 · Iteración 149 · Expansión · Escala

- **Capacidad nueva: Launchpad en la vista conjunta** (ítem 108 de la hoja de ruta, must de Replica): con dos o más repos,
  «Todos» suma sobre las tarjetas una lista única de los PRs abiertos de todos, agrupados por estado (borradores, checks en
  rojo, aprobados, esperando revisión; en ese orden de prioridad), del más nuevo al más viejo; cada fila lleva al repo en
  su pestaña, en la rama del PR. Sale de lo ya cargado de cada pestaña, sin consultas. `groupPulls` y `prGroup`
  (`js/overview.js`). Sin token (REST) un PR solo es borrador o espera revisión: los checks y la aprobación llegan por GraphQL.
- **Pruebas que fallan sin la capacidad:** `tools/overview.test.mjs` («prGroup…» y «groupPulls…»: `O.prGroup` no existía) y el
  paso del smoke «vista conjunta», que mira los dos grupos de o/b con la API simulada y entra por una fila a su pestaña.
- README: «Todos a la vez» (el Launchpad), Límites conocidos (REST), Seguridad y la estructura; `replica/features.csv`: la
  fila del Launchpad pasa a `yes`. Textos nuevos: `all.prs.*` (6) en los 40 idiomas.
- QA: vista conjunta (Todos) con GitHub simulado: agrupación, fila por teclado hasta su pestaña, contraste claro y oscuro
  (lo mide el smoke); auditoría: la corre `npm run check`.
- Skills: no aplica: una lista más en una vista que ya existe, que el repo cubre con sus reglas.
- Arena: no aplica: una sola forma obvia (agrupar lo ya cargado por la regla de estado que ya usa la salud).
- Reclamo: loop/149, sin colisión
- Validado: 462 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 150, expansión: ítem 107 (Fuente Azure DevOps, Fuentes)

### 2026-10-28 · Iteración 150 · Expansión · Fuentes

- **Capacidad nueva: Azure DevOps como fuente** (ítem 107 de la hoja de ruta, must de Replica): `azure:org/proyecto/repo` (o la URL
  de `dev.azure.com/…/_git/…`, con ruta, con `usuario@` o por ssh) dibuja en vivo las ramas, los commits y los PRs de un repo de un
  proyecto público, sin token, con la API REST 7.1 de Azure Repos (`js/sources/azure.js`, hereda de la fuente de GitHub como las
  de Bitbucket y Codeberg). dev.azure.com contesta con `Access-Control-Allow-Origin: *` (comprobado con `curl`), así que la web
  lo lee directo y no hace falta la app de escritorio; la CSP suma solo `https://dev.azure.com` (y la app de escritorio la
  conserva). Dos hechos de la API real que moldearon la fuente: la lista de commits no trae los padres (cada commit nuevo se pide
  suelto, de a 6, y los ya cargados no se repiten) y un proyecto privado no responde 401 sino que redirige al inicio de sesión de
  Microsoft, por eso la consulta va con `redirect: 'manual'` y eso cuenta como «no se encontró». `compareVersion` devuelve lo que
  tiene el lado comparado y no `itemVersion` (al revés de lo que parece): `ahead()` lo usa así para distinguir un force-push.
  Probado a mano contra `powershell/PowerShell` en dev.azure.com (solo lectura): 1 rama, 15 commits con sus padres, 19 consultas.
  Sin token todavía, sin árbol de archivos, sin cambios de commit, sin edición, sin avatares: lo que falta, en el ítem 113 y en
  Límites conocidos.
- **Pruebas que fallan sin la capacidad:** `tools/azure.test.mjs` (11 pruebas: `parseRepo`, carga con padres, sin repetir commits,
  en vivo con push, rama, PR abierto y fusionado, force-push y rama borrada, PR abandonado, privado por redirección y por 302, 429,
  error HTTP, 520 ramas, enlaces ajenos) y el paso del smoke «Azure DevOps» (etiqueta, PR #3 en 2D, URL pegada y repo que no existe).
- README: la función en la lista, «Cómo se usa», la estructura, Límites conocidos (Azure DevOps), CSP y Seguridad (ninguna
  consulta lleva token); `replica/features.csv`: la fila de Azure DevOps pasa a `partial` (falta el token y los privados).
  Textos nuevos: `status.connectingAzure` y `err.notFoundAzure` en los 40 idiomas; los demás avisos reutilizan los del servidor
  genérico (`err.*Forge`).
- QA: conexión por `azure:` y por URL pegada, etiqueta «Azure DevOps», PR en 2D, repo inexistente (404 y redirección), 429 y error
  500 (por prueba); la demo no lleva Azure DevOps (es simulada y sin servicio); auditoría: la corre `npm run check`.
- Skills: no aplica: el repo ya tiene la misma forma de fuente (Bitbucket, Codeberg) y la API se comprobó contra dev.azure.com.
- Arena: no aplica: una sola forma obvia (heredar de la fuente de GitHub como las demás); lo que pesó fue lo que la API real
  permite, que se midió con `curl`.
- Reclamo: loop/150, sin colisión
- Validado: 473 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 151, mantenimiento · Deuda: pendiente 1 (Smoke intermitente bajo carga: «filtro por autor» y «filtro por ruta» fallan a …)

### 2026-10-28 · Iteración 151 · Mantenimiento · Deuda

- **Arreglo: el smoke ya no falla bajo carga en «filtro por autor» y «filtro por ruta»** (pendiente 1)
- **Reproducción:** 5 corridas de `xvfb-run -a node tools/smoke.mjs` en paralelo → `✗ filtro por autor: …: ningún autor acota el grafo (0 ramas, 6 autores)` (3 de 5) y `✗ filtro por ruta: …: quitar el filtro no deja el grafo como estaba` (1 de 5)
- **Pruebas que fallan sin el arreglo:** los mismos pasos del smoke; el conteo base de ramas se tomaba antes de que el grafo terminara de repartirlas, la espera de la transición era de 1,5 s y el paso de la ruta leía el grafo sin esperar a que soltara el filtro. Ahora espera a que el conteo quede quieto, 4 s de transición y espera a que se quite el filtro.
- README: no aplica (solo la herramienta de pruebas)
- QA: no toca la página; auditoría: no toca la página
- Skills: no aplica: un arreglo de esperas del smoke, que ya cubre el Protocolo de QA.
- Arena: no aplica: una sola forma obvia (esperar el estado en vez de un tiempo fijo).
- Reclamo: loop/151, sin colisión
- Validado: 473 pruebas (`node --test`), smoke (129 pasos), i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 152, expansión: ítem 109 (Historial de un archivo, Análisis)

### 2026-10-28 · Iteración 152 · Expansión · Análisis

- **Capacidad nueva: Historial de un archivo** (ítem 109 de la hoja de ruta): cada archivo abierto en el panel de cambios de un commit suma «Historial», que aplica el filtro por ruta (`?path=`) a ese archivo, deja a la vista los commits ya cargados que lo tocaron, lo anuncia con un aviso y deja la ruta en la dirección
- **Pruebas que fallan sin la capacidad:** `node --test tools/demo.test.mjs` → `el historial de src/api/Api.tsx no trae a feat(api): /healthz health endpoint`; y un paso del smoke («historial de un archivo»: del botón del diff al filtro por ruta aplicado)
- README: «Cambios de cada commit» y Límites conocidos; `replica/features.csv`: «Historial de un archivo» pasa de `partial` a `yes`. Textos nuevos: `diff.history` y `diff.historyOf` en los 40 idiomas
- QA: panel de cambios (botón con nombre accesible, solo con teclado como cualquier botón), filtro por ruta de la demo; la vista conjunta no lo ofrece; auditoría: la corre `npm run check`
- Skills: no aplica: un botón sobre el filtro por ruta que ya existe, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (reusar `applyPathFilter`).
- Reclamo: loop/152, sin colisión
- Validado: 474 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde (la tercera corrida; las dos primeras fallaron en el paso intermitente «filtro por autor», anotado en Mantenimiento 3).
- **Siguiente:** iteración 153, expansión: ítem 98 (Capa para streaming, octava entrega, Plataformas)

### 2026-10-29 · Iteración 153 · Expansión · Plataformas

- **Capacidad nueva: `&spin=0` en la capa para streaming** (ítem 98 de la hoja de ruta, Capa para streaming, octava entrega): `?embed=1&spin=0` (también `off`, `false` o `no`) apaga la rotación lenta de la vista 3D para una escena de OBS quieta, sin guardar la preferencia (`spin3d`) de la persona; sin `spin`, o con otro valor, gira como siempre. Sin conexiones nuevas ni CSP distinta; en la web y en la app de escritorio (misma página). Sin textos nuevos de interfaz.
- **Pruebas que fallan sin la capacidad:** `node --test tools/embed.test.mjs` → `embedOptions: spin=0 … undefined !== false`; y un paso del smoke («&spin=0 deja la vista 3D quieta»)
- README: la lista de funciones (widget embebible) y Seguridad
- QA: capa embebida con y sin `&spin=0` (botón de giro con `aria-pressed`, almacenamiento intacto); auditoría: la corre `npm run check`
- Skills: no aplica: una opción más de la URL de la capa, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (otra clave de `embedOptions`).
- Reclamo: loop/153, sin colisión
- Validado: 475 pruebas (`node --test`), smoke (131 pasos), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 154, expansión: ítem 100 (Práctica: reset --mixed y reflog, Público)

### 2026-10-29 · Iteración 154 · Expansión · Público

- **Capacidad nueva: `reset --mixed` y `reflog` en la práctica** (ítem 100 de la hoja de ruta, Práctica: reset --mixed y reflog): la terminal anota cada movimiento de HEAD (commit, checkout/switch, reset, etc.); `reflog` (o `reflog show [HEAD]`) los lista del más nuevo al más viejo como `HEAD@{n}`, y `HEAD@{n}` vale como referencia (`reset --hard HEAD@{1}` recupera un commit tras un `reset --hard`; fuera de rango da error). `reset` acepta `--soft`, `--mixed` (lo que hace a secas: los cambios sin commit se quedan y lo dice con «Unstaged changes after reset») o `--hard`, y niega mezclarlos. Sin textos nuevos de interfaz (la ayuda de la terminal es en inglés como siempre); en la web y en la app de escritorio.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs` → `reflog recuerda dónde estuvo HEAD…` (sin el arreglo, `git: 'reflog' is not a git command`); y un paso del smoke («la práctica muestra el reflog y recupera un commit tras reset --hard»)
- README: la lista de funciones (Aprender git)
- QA: terminal de práctica (sin cambios de HTML ni de foco); auditoría: la corre `npm run check`
- Skills: no aplica: una extensión del simulador propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (un registro de HEAD en `run`).
- Reclamo: loop/154, sin colisión
- Validado: 477 pruebas (`node --test`), smoke (132 pasos), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 156, expansión: ítem 101 (Constelación: filtrar por nombre en la URL, Escala)

### 2026-10-29 · Iteración 155 · Mantenimiento · Accesibilidad

- **Arreglo: la leyenda 2D se recorre con el teclado** (pendiente 4): cada fila de rama de la leyenda es ahora un botón enfocable (`tabindex=0`, `role=button`, nombre «Rama {name}» con el texto de `branch.aria` que ya existía), Enter o Espacio llevan al commit de la rama (`focusBranch`, igual que el clic), enfocarla resalta su rama como el puntero, y tiene anillo de foco visible. Las filas «fusionada» (fantasma) no son enfocables. Las filas miden 24 px de alto (objetivo táctil, WCAG 2.5.8). Sin textos nuevos; web y escritorio.
- **Reproducción:** `node tools/smoke.mjs` → `✗ la leyenda 2D se recorre con Tab y Enter lleva al commit de la rama: la fila de la leyenda no es enfocable con nombre` (sin el arreglo no hay `.legend-item[role=button]`)
- **Pruebas que fallan sin el arreglo:** el paso del smoke «la leyenda 2D se recorre con Tab y Enter…»
- README: no cambia (accesibilidad de una función que ya estaba)
- QA: Accesibilidad: la leyenda solo con Tab, Enter y Espacio (el foco no cae a `<body>`, anillo visible, nombre accesible); auditoría: la corre `npm run check`
- Skills: no aplica: un arreglo de atributos ARIA y foco sobre el patrón de `.head`, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (copiar el patrón de las etiquetas de rama).
- Reclamo: loop/155, sin colisión
- Validado: 477 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde (la tercera corrida: la primera falló en dos pasos del smoke, «historial de un archivo» y «editar sin token», mientras corría otro smoke en la misma máquina; la segunda, en la auditoría: las filas de la leyenda, ya enfocables, medían 20 px y se subieron a 24, WCAG 2.5.8).
- **Siguiente:** iteración 156, expansión: ítem 101 (Constelación: filtrar por nombre en la URL, Escala)

### 2026-10-29 · Iteración 156 · Expansión · Escala

- **Capacidad nueva: `?constellation=texto` filtra la constelación por nombre** (ítem 101 de la hoja de ruta, Constelación: filtrar por nombre en la URL): la constelación muestra solo los repos cuyo nombre contiene el texto (sin mayúsculas ni acentos, hasta 100 caracteres) y lo anuncia en su región viva: «Filtradas por “texto”: n de m». `C.filterParam` y `C.filterItems` en `js/constellation.js`; `setFilter` en el montaje. Un texto sin coincidencias deja la constelación vacía con el aviso «0 de m». Un texto nuevo de interfaz (`constellation.filtered`) en los 40 idiomas; web y escritorio.
- **Pruebas que fallan sin la capacidad:** `node --test tools/constellation.test.mjs` → `?constellation=texto deja los repos cuyo nombre lo contiene…` (sin la capacidad, `C.filterParam is not a function`); y un paso del smoke («?constellation=R1 filtra por nombre y lo anuncia»)
- README: la lista de funciones (Constelación)
- QA: constelación (diálogo, región viva, foco al abrir); auditoría: la corre `npm run check`
- Skills: no aplica: un filtro de texto sobre código propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (filtrar la lista antes de ordenarla).
- Reclamo: loop/156, sin colisión
- Validado: 478 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 157, expansión: ítem 105 (Capa para streaming, novena entrega, Plataformas)

### 2026-10-29 · Iteración 157 · Expansión · Plataformas

- **Capacidad nueva: `&view=2d|3d` en la capa para streaming** (ítem 105 de la hoja de ruta, Capa para streaming, novena entrega): `?embed=1&view=2d` o `&view=3d` fija la vista de la capa sin guardarla (`view` en el almacenamiento queda como estaba); sin `view`, o con otro valor, manda la vista guardada de la persona. El idioma ya lo fijaba `&lang=`. Sin conexiones nuevas ni CSP distinta; en la web y en la app de escritorio (misma página). Sin textos nuevos de interfaz.
- **Pruebas que fallan sin la capacidad:** `node --test tools/embed.test.mjs` → `embedOptions: view=2d|3d fija la vista…` (sin la capacidad, `view` es `undefined`); y un paso del smoke («&view=2d y &view=3d fijan la vista sin guardarla…»)
- README: la lista de funciones (widget embebible) y Seguridad (`&view=` solo admite `2d` o `3d`)
- QA: capa `?embed=1` (vista 2D y 3D, almacenamiento intacto, vista guardada sin `&view=`); auditoría: la corre `npm run check`
- Skills: no aplica: un parámetro más de la URL sobre código propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (leer el parámetro en `embedOptions` y pasarlo a `setView` sin guardar).
- Reclamo: loop/157, sin colisión
- Validado: 479 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 158, expansión: ítem 106 (Práctica: commit --amend, Público)

### 2026-10-29 · Iteración 158 · Expansión · Público

- **Capacidad nueva: `commit --amend` en la terminal de práctica** (ítem 106 de la hoja de ruta, Práctica: commit --amend): `commit --amend [-m "msg"]` reemplaza el último commit por otro con los mismos padres (el viejo sale de la rama y queda en el `reflog` como `commit (amend)`); sin `-m` conserva el mensaje y recoge los archivos cambiados con `touch`. Se niega sin commits y con una fusión, un cherry-pick o un revert a medias, como git; con un `rebase -i` detenido corrige el commit en pausa. `js/gitsim.js` (`commit`, `reflogMessage`, `help`). Sin textos nuevos de interfaz (los comandos y sus respuestas de la terminal van en inglés, como los demás); web y escritorio.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs` → `commit --amend reemplaza el último commit con los mismos padres` (sin la capacidad, `commit --amend` da «Aborting commit due to empty commit message»); y un paso del smoke («la práctica corrige el último commit con commit --amend»)
- README: la lista de funciones (Aprender git) y sus pruebas
- QA: terminal de práctica (grafo, `log`, `reflog`, errores sin commits y con fusión a medias); auditoría: la corre `npm run check`
- Skills: no aplica: un comando más del simulador propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (crear el commit con los padres del cabeza y mover la rama).
- Reclamo: loop/158, sin colisión
- Validado: 481 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 159, mantenimiento · Deuda: pendiente 1 (La e2e de escritorio «pasa al llavero el token que la primera versión dejaba en…)

### 2026-10-29 · Iteración 159 · Mantenimiento · Deuda

- **Arreglo: la e2e de escritorio «pasa al llavero el token que la primera versión dejaba en localStorage» ya no es intermitente** (pendiente 1). Causa probable: `localStorage` se escribe a disco en segundo plano, así que `app.close()` justo después de sembrar el token viejo podía perderlo; la segunda ventana arrancaba sin nada que migrar, el `localStorage` salía vacío (la primera aserción pasaba sola) y no había archivo en el llavero. La siembra ahora vacía el almacenamiento (`session.defaultSession.flushStorageData()`) antes de cerrar, y la aserción del archivo espera con `expect.poll` a que termine la migración, antes de mirar `localStorage`.
- **Reproducción:** `xvfb-run -a npx playwright test e2e/desktop.spec.mjs -g "pasa al llavero"` → no se pudo reproducir en esta sesión: 0 fallos en 20 corridas (8 sin carga, 12 con cuatro procesos ocupando la CPU). El arreglo sale del análisis de la causa, no de una falla vista; si vuelve a fallar, el pendiente se reabre.
- **Pruebas que fallan sin el arreglo:** ninguna nueva (el cambio es la propia prueba); 10 corridas en verde con el arreglo.
- README: no toca.
- QA: no toca la página ni la app (solo `e2e/desktop.spec.mjs`); auditoría: no toca la página
- Skills: no aplica: un ajuste de una prueba propia, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (vaciar el almacenamiento antes de cerrar y esperar la migración).
- Reclamo: loop/159, sin colisión
- Validado: 481 pruebas (`node --test`), smoke, i18n (0 errores) y 28 e2e en verde.
- **Siguiente:** iteración 160, expansión: ítem 110 (Ocultar una rama o dejarla sola, Análisis)

### 2026-10-29 · Iteración 160 · Expansión · Análisis

- **Capacidad nueva: ocultar una rama o dejarla sola** (ítem 110 de la hoja de ruta, `[replica 2026-10-28]`). La ficha de una rama, en 2D y en 3D, suma «Ocultar» y «Ver solo»; se recuerdan por repo (`bview:`), la lupa se marca como filtrada, su cuadro dice «n de m ramas a la vista» y trae «Ver todas las ramas», y la vista de texto lo respeta y lo dice. La rama por defecto siempre queda; sin consultas. Nueva `GB.search.byBranches`.
- **Pruebas que fallan sin la capacidad:** `node tools/search.test.mjs` (byBranches) y el paso del smoke «ocultar una rama o dejarla sola».
- README: función en la lista, Límites conocidos y mapa de `js/search.js`.
- QA: ficha de rama (2D), filtro y su aviso, persistencia por repo, foco al restablecer; auditoría: ver Validado.
- Skills: no aplica: extensión de un filtro propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (componer sobre el filtro por autor con la misma firma).
- Reclamo: loop/160, sin colisión
- Validado: 482 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. Una primera corrida falló en un paso ajeno (vista de texto, release de la demo) y pasó a la repetición: anotado en el pendiente 2 de Mantenimiento.
- **Siguiente:** iteración 161, expansión: ítem 112 (Vista de un PR: descripción y comentarios, Datos)

### 2026-10-29 · Iteración 161 · Expansión · Datos

- **Capacidad nueva: vista de un PR, descripción y comentarios** (ítem 112 de la hoja de ruta, `[replica 2026-10-28]`). La ficha de una rama con PR de GitHub (2D, 3D y demo) suma «Ver descripción y comentarios»: al pulsarlo pide el PR (`prDetail`: `/pulls/N` y, si tiene comentarios, la última página de `/issues/N/comments`) y muestra la descripción y los últimos 5 comentarios, todo como texto y recortado; pulsarlo otra vez lo esconde. Fila «Vista de un PR» de `replica/features.csv` a `yes`. El ítem 119 (`?pr=N`) sigue en la hoja.
- **Pruebas que fallan sin la capacidad:** `node --test tools/github.test.mjs` («la vista de un PR…», las dos consultas y los 5 últimos) y el paso del smoke «vista de un PR».
- README: función en la lista y Límites conocidos.
- QA: ficha de rama en 2D con teclado (foco en el botón, `aria-expanded`, región viva), demo sin consultas a la API, 40 idiomas; auditoría: ver Validado.
- Skills: no aplica: una vista más en la ficha, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (consulta al pulsar, mismo cableado que «Ver cambios»).
- Reclamo: loop/161, sin colisión
- Validado: 483 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. Tres corridas previas de `npm run check` fallaron cada una en un paso distinto del smoke (ocultar rama, historial de archivo, editar sin token); en `origin/dev` limpio el smoke falló también en 2 de 2 corridas (autor, ruta, ocultar, historial): es la intermitencia del pendiente 2 de Mantenimiento, que en este sandbox de 4 núcleos se agrava.
- **Siguiente:** iteración 162, expansión: ítem 111 (Primer padre en el grafo, Análisis)

### 2026-10-29 · Iteración 162 · Expansión · Análisis

- **Capacidad nueva: primer padre en el grafo** (ítem 111 de la hoja de ruta, con la URL que era el 117, `[replica 2026-10-28]`). En el cuadro de la lupa, el interruptor «Solo el primer padre» deja en el grafo (2D, 3D y vista de texto) solo la cadena `parents[0]` de cada rama, como `git log --first-parent`, con lo ya cargado y sin consultas (`GB.search.firstParent`, compuesto después de los filtros de autor y de ramas). Se recuerda por repo y viaja en la URL: `?firstparent=1` abre ya activo (sobre lo recordado) y la dirección sigue al interruptor; la lupa se subraya mientras está activo.
- **Pruebas que fallan sin la capacidad:** `node --test tools/search.test.mjs` («firstParent…», «firstParentParam…») y el paso del smoke «Grafo de primer padre (?firstparent=1)».
- README: función en la lista, Límites conocidos y Seguridad.
- QA: interruptor con nombre y foco en el cuadro, URL y marca del filtro, 40 idiomas; auditoría: ver Validado.
- Skills: no aplica: un filtro propio sobre datos ya cargados, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (recortar `parents` por rama, compuesto como los otros filtros).
- Reclamo: loop/162, sin colisión
- Validado: 485 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. La primera corrida falló en un paso ajeno (historial de un archivo) y la repetición pasó: la intermitencia del pendiente 2 de Mantenimiento.
- **Siguiente:** iteración 163, mantenimiento · Errores: pendiente 3 (`mapPull` compara con el owner/nombre escrito, no con el que devuelve GitHub (r…)

### 2026-10-29 · Iteración 163 · Mantenimiento · Errores

- **Arreglo: `mapPull` compara con el nombre que da el servidor** (pendiente 3). `sameRepo` se calculaba contra el `owner/nombre` escrito en la dirección; en un repo renombrado o transferido, GitHub devuelve el nombre nuevo en `head.repo.full_name` y todos sus PRs se tomaban por forks (la rama no se marcaba con su PR). Ahora se compara con `base.repo.full_name` (GitHub y Codeberg) o `destination.repository.full_name` (Bitbucket), y solo si falta se cae al nombre escrito. El mismo patrón estaba en `codeberg.js` y `bitbucket.js`; GitLab, Azure y Bitbucket Server comparan por ids o por la marca de fork del servidor y no lo tienen.
- **Reproducción:** `node --test tools/github.test.mjs tools/codeberg.test.mjs tools/bitbucket.test.mjs` → `not ok … mapPull: un repo renombrado sigue marcando sus PRs de la misma repo` (`expected: true, actual: false`) en las tres.
- **Pruebas que fallan sin el arreglo:** las tres de `mapPull` en `tools/github.test.mjs`, `tools/codeberg.test.mjs` y `tools/bitbucket.test.mjs` (rama propia, fork y base ausente).
- README: sin cambios (no cambia ninguna función visible).
- QA: sin cambios de interfaz; auditoría: no toca la página.
- Skills: no aplica: arreglo de una línea en el mapeo, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (comparar con la base que da el servidor).
- Reclamo: loop/163, sin colisión
- Validado: 488 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. La primera corrida falló en el paso «historial de un archivo» (ajeno al cambio) y la repetición pasó: la intermitencia del pendiente 2 de Mantenimiento.
- **Siguiente:** iteración 164, expansión: ítem 113 (Token para Azure DevOps (proyectos privados), Fuentes)

### 2026-10-29 · Iteración 164 · Expansión · Fuentes

- **Capacidad nueva: token para Azure DevOps (proyectos privados)** (ítem 113 de la hoja de ruta). Un campo «Token de Azure DevOps» en Ajustes (token de acceso personal con `Code (Read)`) se envía como `Authorization: Basic` en cada consulta, solo a dev.azure.com; se guarda como el de Bitbucket (`U.secret`; en escritorio, servicio `azure` cifrado con el llavero). Con token, la redirección al inicio de sesión, el 203 con la página de acceso, el 401 y el 403 son «token rechazado» (`err.authAzure`, lleva a Ajustes); un 404 sigue siendo «no se encontró». Guardar el token reconecta solo las pestañas de Azure.
- **Pruebas que fallan sin la capacidad:** cuatro en `tools/azure.test.mjs` (privado leído con token y Basic en cada consulta, rechazo por redirección/203/401/403, 404 con token, sin token no cambia nada), dos pasos del smoke (token enviado y guardado; token rechazado) y el token `azure` del llavero en `e2e/desktop.spec.mjs`.
- README: función, Límites conocidos (CORS con `Authorization` solo probado con API simulada) y Seguridad.
- QA: Ajustes (campo, mostrar/ocultar, borrar tokens), pestaña Azure reconectada al cambiar el token, error con enlace a Ajustes; 40 idiomas (`check-i18n` 0 errores); auditoría: ver Validado.
- Skills: no aplica: mismo patrón que el token de Bitbucket, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (replicar el token de Bitbucket con la cabecera Basic de Azure).
- Replica: paridad, sin pasada nueva; hoja de ruta repuesta con los ítems 119 a 124 (continuaciones de ítems hechos)
- Reclamo: loop/164, sin colisión
- Validado: 492 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. Una corrida previa del smoke falló en «ocultar una rama o dejarla sola» (ajeno al cambio; la intermitencia del pendiente 2 de Mantenimiento) y la repetición pasó.
- **Siguiente:** iteración 165, expansión: ítem 114 (Capa para streaming, décima entrega, Plataformas)

### 2026-10-30 · Iteración 165 · Expansión · Plataformas

- **Capacidad nueva: `&branch=nombre` en la capa para streaming** (ítem 114 de la hoja de ruta, Capa para streaming, décima entrega): `?embed=1&branch=develop` deja en la capa solo esa rama y la rama por defecto (reusa `byBranches` con `solo`, sin tocar el filtro guardado de la persona); el nombre se compara tal cual (sin caracteres de control, hasta 200) y nunca entra al DOM como HTML; se combina con `&max=`. Sin conexiones nuevas ni CSP distinta; en la web y en la app de escritorio. Sin textos nuevos de interfaz.
- **Pruebas que fallan sin la capacidad:** `node --test tools/embed.test.mjs` → `embedOptions: branch deja el nombre tal cual…` (sin la capacidad, `branch` es `undefined`); y un paso del smoke («&branch=develop deja 2 ramas…»)
- README: la lista de funciones (widget embebible) y Seguridad (`&branch=` es solo un nombre comparado como texto)
- QA: capa `?embed=1` (rama existente, inexistente, nombre con HTML, sin `&branch=`); auditoría: la corre `npm run check`
- Skills: no aplica: un parámetro más de la URL sobre código propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (pasar el nombre a `byBranches` como `solo`).
- Reclamo: loop/165, sin colisión
- Validado: 493 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 166, expansión: ítem 115 (Práctica: merge --no-ff, Público)

### 2026-10-30 · Iteración 166 · Expansión · Público

- **Capacidad nueva: `merge --no-ff` en la terminal de práctica** (ítem 115 de la hoja de ruta): el commit de fusión se crea aunque se pudiera avanzar; `merge -m "mensaje"` lo nombra (antes `-m` se leía como la rama) y `--no-ff` junto a `--ff-only` da el error de git sin mover nada. La bandera ya se aceptaba sin prueba; ahora es una función completa y comprobada.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs` → `not ok 7 - merge --no-ff: hace el commit de fusión…` (sin el cambio `-m` rompe y `--no-ff --ff-only` no da error); y un paso del smoke («la práctica hace un commit de fusión con merge --no-ff…»).
- README: la lista de funciones (Aprender git) dice `--no-ff`, `-m` y que no se combina con `--ff-only`.
- QA: terminal de práctica (fast-forward evitado, ya al día, `-m`, bandera en conflicto); sin textos nuevos de interfaz (la ayuda de la terminal es inglés fijo); auditoría: 0 hallazgos nuevos.
- Skills: no aplica: una bandera más sobre código propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (leer `-m` y comprobar el choque en `merge`).
- Reclamo: loop/166, sin colisión
- Validado: 494 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. La primera corrida falló en «ocultar una rama o dejarla sola» (ajeno al cambio; intermitencia ya conocida) y la repetición pasó.
- **Siguiente:** iteración 167, mantenimiento · QA: pendiente 10 (Con un repo a 320 px el grafo queda bajo las tarjetas (más de 1.200 px de scrol…)

### 2026-10-30 · Iteración 167 · Mantenimiento · QA

- **Auditoría de QA: celular angosto** (pendiente 10, parcial): a ≤560 px las cifras van en tres columnas y sin la línea de detalle (`css/styles.css`); en 320 px bajan de 245 a 144 px y el grafo empieza en 421 px en lugar de 522.
- **Reproducción:** Playwright 320×640 sobre la demo, sin el cambio → `.stats` 245 px de alto y `.graph-panel` en 522 px.
- **Hallazgos:** 3 nuevos (pendientes 15, 16 y 17), 0 a la base de la auditoría; además la intermitencia de «historial de un archivo» anotada en el pendiente 2.
- **Pruebas que fallan sin el arreglo:** un paso del smoke («a 320 px, las cifras ocupan tres columnas compactas y el grafo empieza antes»).
- README: sin cambios (no hay función nueva).
- QA: 320 px con 404, sin red (ar), cuota agotada (ta) y repo vacío (consola limpia, sin desborde); auditoría completa con `--langs`: 0 hallazgos (la primera pasada con una franja deslizable dio 84 `borde` y se cambió de diseño).
- Skills: no aplica: un ajuste de CSS sobre código propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (compactar la rejilla de cifras).
- Reclamo: loop/167, sin colisión
- Validado: 494 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. Tres corridas previas del smoke: una en verde y dos con «historial de un archivo» (intermitencia, pendiente 2).
- **Siguiente:** iteración 168, expansión: ítem 116 (Ocultar o dejar sola una rama, en la URL, Análisis)

### 2026-10-30 · Iteración 168 · Expansión · Análisis

- **Capacidad nueva: ocultar o dejar sola una rama, en la URL** (ítem 116 de la hoja de ruta, parte del 110): `?solo=rama` y `?ocultar=a&ocultar=b` abren el repo con ese filtro (mandan sobre lo recordado, solo al abrir), la dirección sigue a «Ocultar», «Ver solo» y «Ver todas las ramas», y `GB.search.branchViewParam` lee los nombres como texto (sin caracteres de control, hasta 200).
- **Pruebas que fallan sin la capacidad:** `node --test tools/search.test.mjs` → `branchViewParam` no existe; y un paso del smoke («?ocultar= y ?solo= abren el grafo con menos ramas…»).
- README: «Ocultar una rama o dejarla sola» explica las dos URL; Límites conocidos ya no dice que no viajan.
- QA: filtro de ramas (2D, demo, URL con rama que existe y «Ver todas» que limpia la dirección); sin textos nuevos de interfaz; auditoría: 0 hallazgos nuevos.
- Skills: no aplica: dos parámetros de URL sobre código propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (leer la URL en `showTab` como `?author=`).
- Reclamo: relevo de loop/168 (661adc4)
- Validado: 495 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. Un relevo la retomó tras cinco corridas previas en rojo por pasos ajenos intermitentes (historial de un archivo, editar el código, editar sin token, ocultar una rama, filtro por autor); la sexta dio verde.
- **Siguiente:** iteración 169, expansión: ítem 118 (Vista de un PR en la URL, Datos)

### 2026-10-30 · Iteración 169 · Expansión · Datos

- **Capacidad nueva: la vista de un PR en la URL** (ítem 118 de la hoja de ruta, parte del 112): `?pr=N` (o `?pr=%23N`) abre, al cargar el repo, un diálogo con la descripción y los últimos comentarios del PR (la misma `prDetail` y el mismo HTML de la ficha de la rama, una sola consulta), con el foco en él y Esc para cerrarlo. `GB.search.prParam` solo acepta un entero positivo de hasta 9 cifras; se ignora en `?embed=1` y en fuentes sin `prDetail`.
- **Pruebas que fallan sin la capacidad:** `node --test tools/search.test.mjs` → `S.prParam is not a function`; y un paso del smoke («?pr=N abre la vista del PR…»).
- README: la función «Descripción y comentarios de un PR» explica `?pr=N`; Límites conocidos y Seguridad al día.
- QA: demo con `?pr=36` y `?pr=abc`; texto nuevo (`prview.title`) en los 40 idiomas; auditoría: 0 hallazgos nuevos.
- Skills: no aplica: un parámetro de URL y un diálogo sobre código propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (leer la URL como `?vista=texto` y reutilizar `prDetail`).
- Reclamo: loop/169, sin colisión
- Validado: 496 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. Un primer smoke falló por usar un PR (#31) que la demo no tiene; el paso usa el #36.
- **Siguiente:** iteración 170, expansión: ítem 120 (Azure DevOps: cambios de un commit, Análisis)

### 2026-10-30 · Iteración 170 · Expansión · Análisis

- **Capacidad nueva: cambios de un commit en Azure DevOps** (ítem 120 de la hoja de ruta, parte del 107): `AzureSource.commitDiff` pide `commits/{id}/changes` (hasta 300 archivos) y la ficha de un commit abre el panel con sus archivos y su tipo de cambio (añadido, editado, borrado, renombrado). Azure no da el diff, así que `patch` va en null y el panel lo dice como con un archivo muy grande; `diffCheap` sigue en falso (solo se piden al abrir).
- **Pruebas que fallan sin la capacidad:** `node --test tools/azure.test.mjs` → `src.commitDiff` era null (`typeof … 'function'`); y un paso del smoke («cambios de un commit de Azure DevOps…»).
- README: la lista de «Cambios de cada commit» nombra a Azure (sin el diff); Límites conocidos de Azure ya no dice que no hay cambios de commit.
- QA: panel de cambios de commit con la API simulada (ficha → Ver cambios → archivos → Esc); sin textos nuevos de interfaz; auditoría: 0 hallazgos nuevos.
- Skills: no aplica: un endpoint más de una fuente propia, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (el mismo `commitDiff` que ya usan GitLab y Bitbucket).
- Reclamo: loop/170, sin colisión
- Validado: 497 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. La primera corrida falló solo en «historial de un archivo» (intermitencia conocida, pendiente 2); la repetida pasó entera.
- **Siguiente:** iteración 171, mantenimiento · Rendimiento: pendiente 7 (El primer arranque de la app de escritorio en una sesión tardó 14,7 s hasta sal…)

### 2026-10-30 · Iteración 171 · Mantenimiento · Rendimiento

- **Arreglo: el arranque en frío de Electron no es de la app, el pendiente se cierra** (pendiente 7). Medido con Playwright y `xvfb-run` (perfil nuevo en cada arranque, sin red, `--lang=es`, demo): la primera corrida de la sesión tardó 18,4 s hasta la primera ventana y 19,1 s hasta salir de «cargando»; las cuatro siguientes, 0,36–0,42 s y 0,84–1,10 s. Con el binario ya leído del disco (`electron --version` antes), una corrida con perfil nuevo dio 0,58 s y 1,20 s, y otras cuatro 0,80–0,93 s. El tiempo extra queda antes de `app.whenReady` (carga fría del binario y de sus librerías, la caché de disco del contenedor); el código de la app, desde que arranca el proceso, no pasa de ~1 s. No hay una causa en `electron/main.js` que arreglar: `createWindow` espera a `localArgs` solo con `--local=`, y con la demo no hay trabajo en el camino. Sin cambio de código, ninguna medida del caso web cambia.
- **Reproducción:** `xvfb-run -a node arranque.mjs` (cinco `electron.launch` con perfil nuevo) → primera corrida 19,1 s en la sesión recién abierta; con el binario caliente, 1,2 s o menos.
- **Pruebas que fallan sin el arreglo:** ninguna: no hay arreglo; una prueba con un tope de tiempo de arranque sería intermitente por el disco frío del contenedor.
- README: sin cambios.
- QA: arranque de escritorio medido (primer arranque y reaperturas); auditoría web con `--repetir 3` como base (cargaMs 2090, fps2d 51,2, fps3d 8,6, 10 consultas al cargar); no toca la página.
- Skills: no aplica: una medición sobre código propio, sin dominio nuevo.
- Arena: no aplica: no hay implementación que decidir (la medición descarta el arreglo).
- Reclamo: loop/171, sin colisión
- Validado: 497 pruebas (`node --test`), smoke, i18n (0 errores) en verde; auditoría y e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 172, expansión: ítem 122 (Capa para streaming, undécima entrega, Plataformas)

### 2026-10-30 · Iteración 172 · Expansión · Plataformas

- **Capacidad nueva: `&pr=1` en la capa para streaming** (ítem 122 de la hoja de ruta, Capa para streaming, undécima entrega): `?embed=1&pr=1` (también `on`, `true` o `yes`) deja en la capa solo la rama por defecto y las ramas con un PR abierto del mismo repo, en 2D y en 3D (`GB.search.withOpenPr`, sobre los PRs ya cargados y sin consultas); se combina con `&branch=` y `&max=` (en ese orden). Dentro de la capa `?pr=N` ya no abría la vista del PR, así que el nombre queda libre; fuera de `?embed=1` sigue siendo la vista del PR N. Sin conexiones nuevas ni CSP distinta; en la web y en la app de escritorio. Sin textos nuevos de interfaz.
- **Pruebas que fallan sin la capacidad:** `node --test tools/embed.test.mjs tools/search.test.mjs` → `not ok … embedOptions: pr=1 (o on, true, yes)…` (`pr` es `undefined`) y `not ok … withOpenPr…` (`TypeError`); y un paso del smoke («&pr=1 deja la rama por defecto y solo las ramas con PR abierto…»), que sin la capacidad deja `develop` sin PR en la capa.
- README: la lista de funciones (widget embebible), Límites conocidos (solo los PRs ya cargados y del mismo repo) y Seguridad (`&pr=` solo se enciende con cuatro valores).
- QA: capa `?embed=1` con la demo en 2D y en 3D (sin `&pr`, con `&pr=1`, `&pr=0`, `&pr=1&max=2` y `&pr=1&branch=` con una rama sin PR), cada cabeza que queda lleva su PR (el paso del smoke, corrido solo, en verde con la capacidad y en rojo sin ella: sin el cambio `develop` sigue en la capa); en la app de escritorio, con Playwright y `xvfb-run` sobre `app://graphbranch/index.html?embed=1&view=2d&pr=1`: quedan `main` y las tres ramas con PR de la demo, sin errores de consola; sin textos nuevos de interfaz; auditoría: 0 hallazgos nuevos.
- Skills: no aplica: un parámetro más de la capa sobre un filtro propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (un filtro más en `drawGraph`, como `&branch=` y `&max=`); además, 18 iteraciones simultáneas en un contenedor de 4 CPU, pedido del dueño.
- OMC: no disponible (llegó a `dev` con #225, después de construida la 172, y la sesión que la retomó no tiene la herramienta Agent para lanzar los `omc-*`; en su lugar, revisión propia del diff contra el ítem, `CLAUDE.md` y la skill, sin hallazgos)
- Replica: paridad, sin pasada nueva (81,1/100, must hechos 12 de 13); ítem 125, lo mínimo para que la hoja no baje de 10 en esta tanda de tres iteraciones pedida por Benjamin (la reposición hasta 15 la hace la 174). Las filas «Azure DevOps» (must, `partial`) y «Ocultar una rama o dejarla sola» (`no`) de `replica/features.csv` quedaron atrasadas respecto de #214 y #210.
- Reclamo: loop/172, sin colisión; ronda de tres iteraciones simultáneas (172, 173 y 174) pedida por Benjamin en persona, no un disparo de la Routine. Reanudada el 2026-10-31 por otra sesión (`--reclamar` dio Vencida: 26 h sin commits, con #222 abierto): merge de `origin/dev` (#225) sin conflictos y `npm run check` de nuevo.
- Web publicada: sin publicar (404, has_pages=false; está en Para Benjamin)
- Validado: 499 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. La primera corrida de la reanudación falló solo en «editar sin token» (ajeno al cambio; la causa va al pendiente 2) y la repetida pasó entera.
- **Siguiente:** iteración 173, expansión: ítem 123 (Práctica: branch -m, Público)

### 2026-10-30 · Iteración 173 · Expansión · Público

- **Capacidad nueva: `branch -m` en la terminal de práctica** (ítem 123 de la hoja de ruta, parte del 31): `branch -m [vieja] nueva` (también `--move`) renombra una rama con sus commits; sin la vieja, la actual. HEAD y la rama por defecto la siguen (el grafo la sigue dibujando como la principal), el `reflog` lo anota como git (`Branch: renamed refs/heads/main to refs/heads/trunk`), `-M` pisa una rama que ya existe salvo la que está en uso, y los errores son los de git 2.43 (sin nombre, demasiados argumentos, rama que no existe, nombre tomado o inválido, HEAD desprendido, la rama de un rebase a medias) sin tocar nada. El panel de actividad lo cuenta como «Rama renombrada · Rama main renombrada a trunk» (tipo nuevo `branch-rename`, en la categoría Ramas y sin puntos de logro) en vez de una rama borrada y otra creada (textos nuevos `act.branchRenamed` y `kind.branch-rename`). Sirve también en los ejercicios propios (`exists:` y `missing:`) y en el ensayo sobre un repo real.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs` → `not ok 5 - branch -m renombra una rama…` y cuatro más (errores de git sin tocar nada, rebase a medias y repo vacío, un ejercicio propio que pide renombrar, el panel de actividad de la fuente de práctica), `node --test tools/i18n.test.mjs` → `falta kind.branch-rename en en.js` (cada tipo del panel con su rótulo); y un paso del smoke («la práctica renombra ramas con branch -m…»).
- README: la lista de funciones (Aprender git), Pruebas y Límites conocidos.
- QA: terminal de práctica (renombrar otra rama y la actual, `-M`, errores, `reflog`, HEAD desprendido), con Playwright contra `e2e/serve.mjs`: grafo 3D en inglés con tema claro y 2D en árabe con tema oscuro, panel de actividad y avisos, sin errores de consola; el paso del smoke en español; textos nuevos en los 40 idiomas (`check-i18n` 0 errores); en la reanudación, el paso «historial de un archivo» del smoke reproducido con un script de Playwright contra `e2e/serve.mjs` tras 6 min de demo (3 de 3 fallan en esta rama y 2 de 2 sobre `origin/dev`; con el arreglo, las 2 corridas que llegaron al paso pasan); auditoría: 0 hallazgos nuevos.
- Skills: no aplica: un subcomando más del intérprete propio, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia (un caso más de `branch` que cambia la clave en el mapa de ramas); y 18 iteraciones simultáneas en un contenedor de 4 CPU, pedido del dueño.
- OMC: no disponible (la sesión que la retomó no tiene la herramienta Agent para lanzar los `omc-*`; en su lugar, revisión propia del diff contra el ítem 123, `CLAUDE.md` y la skill: `renameBranch` contra git real en lo que el ítem pide, el reflog solo cuando se mueve HEAD, nombres que pasan por `validName` y llegan al panel con `U.esc`, la fuente de práctica sobre su propio objeto `repo`; y el arreglo del smoke contra lo que el paso comprobaba, que sigue igual: el botón Historial con nombre, el filtro con la ruta de ese archivo y en la URL; sin hallazgos)
- Replica: sin pasada ni paridad nuevas; el ítem 126 («Varias cuentas del mismo servicio», Fuentes, 1×2/2) sale de las reseñas de la pasada del 2026-10-28 (`replica/fixes.md`, fila «Varios perfiles o cuentas», `no`) solo para no bajar de 10 pendientes sin adelantar al ítem 99 de la 174; se escribió como el 125 y al integrar `dev` pasó a ser el 126, porque la 172 ya había sumado «Alias de las pestañas» como el 125. La hoja queda en 10 pendientes: no bajó de 10, así que la regla 5 no pide reponer en esta.
- Reclamo: loop/173, sin colisión (a mano: tanda de tres iteraciones simultáneas que Benjamin pidió en persona, no un disparo de la Routine; la 172 y la 174 en otras ranuras). Reanudada el 2026-11-01 por otra sesión (`--reclamar` dio Vencida: 31 h sin commits, con #224 abierto): merge de `origin/dev` (#225 y #222) con conflicto solo en `IMPROVEMENTS.md` (la hoja de ruta, donde los dos lados sumaban un ítem 125, y el final de la bitácora), resuelto conservando las dos partes, y `npm run check` de nuevo. `loop/174` (#223) sigue abierta y se retoma como la 174; esta sesión no la toca.
- Web publicada: sin publicar (404, has_pages=false; está en Para Benjamin)
- Validado: 505 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. En la reanudación (carga de 9 a 20 en 4 CPU), las dos primeras corridas cayeron en el smoke, en pasos ajenos al cambio: «historial de un archivo» las dos veces (y «filtro por autor» y «ocultar una rama o dejarla sola» la primera). Fallar dos veces es `dev` en rojo (paso 3 de la skill), así que el paso se arregló aquí, en su propio commit («Smoke: historial de un archivo…»): el paso anterior deja el grafo en el primer commit cargado y, con unos minutos de demo, la etiqueta que elegía queda fuera de la vista (`display: none`), el foco no llega y Enter no abre su ficha; ahora vuelve a lo último y elige una rama vigente y a la vista, como el paso siguiente. Va en este PR y no en otro porque a `dev` se llega solo por el PR de `loop/N` y sin él la 173 no pasa la puerta; lo que queda del patrón, en el pendiente 2. Con el arreglo, la tercera corrida pasó el smoke y cayó solo en la e2e de escritorio «--bitbucket-url…» (ajena al cambio: una carrera de la prueba con el llavero, pendiente 3, nuevo), y la cuarta pasó entera.
- **Siguiente:** iteración 174, expansión: ítem 99 (Salud del repo: tendencia de ramas nuevas, Análisis)

### 2026-11-01 · Cambio de maquinaria: lo largo se espera en primer plano, la hoja hecha aparte y la cola sin Acción

- **Medido** (git de `origin/dev` y de las `loop/*`, la bitácora, `--salud` y una puerta corrida sobre `dev` sin
  tocar, el 2026-11-01): `npm run check` tardó 14 min 56 s sin e2e ni auditoría (el smoke solo, 14 min 37 s, con
  la máquina a carga 10 a 13 en 4 CPU) y falló en tres pasos que nadie había tocado («el 3D arranca con un solo
  contexto WebGL», «historial de un archivo» y «editar sin token»). La herramienta de shell corta una llamada en
  primer plano a los 600 s, manda al fondo la que pasa de 120 s sin `timeout` y bloquea un `sleep` suelto; en
  una Routine el turno terminado es la corrida terminada, y la skill no decía cómo esperar: los pendientes 8 y 12
  pedían correr el smoke y la auditoría «en segundo plano», que es justo la trampa (loop/135 dio su última señal a
  los 24 minutos y la relevó el disparo siguiente; la Routine de otro proyecto de Benjamin cerró así su corrida
  del 2026-11-01). En 13 de las 21 iteraciones de la 152 a la 172 la puerta se repitió por pasos ajenos
  intermitentes, y la 168 gastó cinco corridas y un relevo (4 h). La 172, la 173 y la 174 se reclamaron a la vez
  el 2026-10-30, se quedaron esperándose y la reanudación de la 172 se fusionó sola: la 173 quedó 32 h con su PR
  abierto (la reanudó otra sesión el 2026-11-01, mientras se hacía este cambio) y la 174 sigue con el suyo (#223);
  `--salud` lo decía como `Acción: loop/174 … revisar a mano`, que ninguna sesión desatendida puede atender.
  `IMPROVEMENTS.md` pesaba 106 KB, 37 de ellos de los 116 ítems hechos de la hoja de ruta, y cada sesión lo lee
  entero.
- **Lo nuevo:** `tools/esperar.mjs` lanza un comando desprendido (`--lanzar <nombre> -- <comando>`) y lo espera en
  primer plano de a tramos de 9 minutos: sale con el código del comando, 124 si sigue (se vuelve a llamar en el
  mismo turno) o 125 si murió sin dejarlo; el estado vive fuera del repo (las e2e vacían `test-results/`). La
  skill suma «Lo que se lee» y «Comandos largos», y la puerta, la QA, el rendimiento y la reanudación lanzan y
  esperan con él; R8 da error si un bloque de código de la skill corre `npm run check`, el smoke, la auditoría o
  las e2e sueltos. La puerta se repite a lo sumo tres veces por pasos ajenos distintos; a la tercera, el PR queda
  abierto con `Validado: sin verde` para el disparo siguiente. Una reanudación no es la iteración del disparo: se
  sigue con `--reclamar`. Si `git merge origin/dev` no trae nada y solo cambió la bitácora, el paso 5.2 no repite
  la puerta entera. El prompt de la Routine dice que el turno terminado es la corrida terminada (R8: hasta 750
  bytes y rutas que existen) y el comando de OpenCode espera igual. `--salud` da `En cola: loop/K` (sin Acción)
  para una iteración reclamada antes de su turno. `node tools/loop.mjs --rotar` lleva además los ítems hechos de
  la hoja a `docs/HOJA.md` en orden de número (en este cambio, los 116: `IMPROVEMENTS.md` baja de 106 a 61 KB);
  `--siguiente`, `--check`, `--reclamar` y `--salud` leen las dos hojas, R2 da error si `docs/HOJA.md` tiene un
  pendiente, R14 avisa con más de 10 hechos en `IMPROVEMENTS.md` y `--siguiente` dice el número de un ítem nuevo.
  El smoke cuenta las escrituras aparte: «editar sin token» comparaba todas las consultas y un GET del sondeo en
  vivo parecía una escritura.
- **Cierra:** los pendientes de Deuda «`audit --langs` tarda ~145 s» y «el smoke tarda ~8 min» (los dos pedían
  segundo plano) y la parte de «editar sin token» del pendiente 2; los demás se renumeran.
- **Pruebas que fallan sin el cambio:** `tools/esperar.test.mjs` (10: el código del comando, 124 sin matarlo, 125
  con el vigilante muerto, un nombre a la vez, el estado fuera del repo) y `tools/loop.test.mjs` (de 104 a 110):
  R8 con cada comando largo suelto y el prompt con una ruta que no existe, `En cola` sin Acción, y `rotarHoja`
  (los hechos al archivo en orden, idempotente, el aviso aunque la cabecera ya enlace el archivo, R2 y R14);
  mutados, cada guarda hace fallar su prueba. La rotación real conserva cada línea (comparadas ordenadas).
- README: `tools/esperar.mjs` y `docs/HOJA.md` en la estructura, `--rotar` y cuánto tarda la puerta; `CLAUDE.md`
  y «Cómo validar un cambio», cómo esperarla.
- QA: no toca la página ni el escritorio; `esperar.mjs` probado en esta sesión de Claude Code (lanzado en una
  llamada y esperado en otra: 124 a los 10 s y el código 4 a los 25 s); `--salud` contra origin (`En cola:
  loop/174`, sin acciones); `--rotar` sobre una copia y sobre el repo.
- Validado: 521 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio). Antes, con la máquina compartida a carga 10 a 34 en 4 CPU: la puerta sobre `dev` sin tocar falló en 3 pasos del smoke, y cuatro corridas con el cambio (16 a 47 min cada una, lanzadas y esperadas con `tools/esperar.mjs`) fallaron en 2, 6, 51 (todos `page.goto` vencidos) y 2 pasos que el cambio no toca; «editar sin token» pasó en las cinco.
- **Siguiente:** iteración 174, expansión: ítem 99 (Salud del repo: tendencia de ramas nuevas, Análisis)

### 2026-11-02 · Pedido de Benjamin: ver las interacciones también entre agentes

- **Pedido de Benjamin:** «Poder ver las interacciones tambien entre agentes». No es una iteración numerada y la
  proporción de la regla 2 no cambia.
- **Lo nuevo:** el botón del robot (y `?agents=1`) abre **Agentes e interacciones** (`js/agents.js`), con lo ya
  cargado y sin consultas nuevas. Un commit es de un agente si lo dice su cuenta (Copilot, `claude[bot]`, Codex, Devin,
  Jules, Gemini, Dependabot, Renovate, GitHub Actions, cualquier `…[bot]`), su nombre (`Claude` con correo de Anthropic
  o sin correo, `Cursor Agent`, `… (aider)`) o su mensaje (`Co-Authored-By` de Claude, Copilot, Cursor, OpenCode o
  Aider, «Generated with Claude Code»), y cada **sesión** es un participante aparte cuando el commit la nombra
  (`Claude-Session: …/session_…`, `…-Session:` o «sesión cse_…» de los reclamos), con su modelo («Opus 5.5»); un merge
  sin trailer entre commits de una sesión es de esa sesión. Las interacciones: **continuó** (un commit sobre el de otro,
  en una línea sin bifurcaciones: la sesión que retoma la rama que reclamó otra), **fusionó** (un merge trae el trabajo
  de quienes hicieron la rama fusionada, hasta donde salió, con su número de PR), **revisó** y **comentó** (las
  revisiones y comentarios de un PR, frente a quien lo abrió; un PR fusionado sin su merge cargado cuenta por la
  actividad). El panel trae las cifras, la red en SVG (agentes cuadrados, personas redondas, flechas de quien actúa a
  quien recibe, en violeta entre dos agentes), **Quién con quién**, **Agentes** (sesión, modelo, commits, último; fuera
  de la demo, un enlace a la sesión en Claude Code armado solo con su id) y **Lo último**; cada fila lleva a su commit,
  **Solo entre agentes** se recuerda y el panel se rehace en vivo sin perder el foco. La ficha de cada commit de agente
  lo dice. Con token, la consulta GraphQL de GitHub pide además `messageBody` y `email` (texto, sin costo de cuota) y
  guarda solo el agente; GitLab y los repos locales lo leen del correo y del mensaje que ya traían. Los comentarios de
  PR de GitHub llevan su número y «pedir revisión» ya no cuenta como revisar. Los nombres van aislados (FSI…PDI) para
  que en árabe, hebreo, persa y urdu la flecha y el orden no se den vuelta. La demo suma dos sesiones de Claude Code que
  se pasan `claude/search-index`, la app de Claude que abre su PR, Copilot que lo revisa y Dependabot que Matías
  fusiona; en vivo, las ramas `claude/*` las trabajan las sesiones y Copilot revisa a veces.
- **Pruebas que fallan sin el cambio:** `tools/agents.test.mjs` (nueva, 9: detección por cuenta, nombre, co-autor,
  firma y sesión; personas que se llaman como un agente; `compute` con dos sesiones del loop, un merge, revisiones,
  comentarios y una petición de revisión; la sesión heredada por un merge sin trailer; el SVG escapado),
  `tools/demo.test.mjs` (de 2 a 3: los trailers de la demo y el filtro por ruta), `tools/github.test.mjs` (de 34 a 36: el cuerpo de GraphQL da el agente sin guardarse; el número de los comentarios de
  PR y `request` en «review_requested») y el paso del smoke «Agentes e interacciones (?agents=1)» (la red con un
  vínculo entre agentes, Copilot → Claude Code, una sesión que retoma la de otra, «Solo entre agentes», el foco, la URL
  y la ficha 2D de un commit de agente). Sobre la historia real de este repo (400 commits): 100 sesiones de Claude y 9
  vínculos solo entre agentes.
- **Lo que la demo nueva destapó** (la primera puerta cayó en cuatro pasos del smoke; los tres ajenos, reproducidos
  con Playwright aquí y sobre `origin/dev`): el panel de búsqueda se desbordaba 5 px con un autor de nombre largo
  (`dependabot[bot] (1)` en sus selectores; en `dev`, 0 px): su columna ya no crece con el contenido
  (`minmax(0, 1fr)`); «?vista=texto» sacaba una palabra del commit más nuevo y recargaba otra demo, y la semilla
  terminaba en un commit de agente con mensaje al azar: los commits de agente van antes de los últimos de la semilla
  y con mensajes fijos; «?firstparent=1» contaba los nodos del SVG en dos cargas distintas (en `dev` pasaba por uno:
  17 de 18; aquí, 22 de 21), y el 2D solo crea los que están en pantalla: ahora compara la cifra de commits del grafo
  en la misma página, con el interruptor y sin él. El filtro por ruta de la demo solo mira el titular
  («Co-Authored-By» contiene «auth»; prueba en `tools/demo.test.mjs`). El paso nuevo esperaba la URL antes del evento
  `close` del diálogo: ahora espera, como el de `?health=1`.
- README: la función en la lista, los controles, el mapa de archivos, Límites conocidos y Seguridad.
- QA: demo en 3D y 2D (la ficha del commit), español con tema claro a 1280 px y árabe con tema oscuro a 390 px (sin
  desborde: los nombres largos pasan a dos líneas; la flecha en RTL), 27 textos nuevos en los 40 idiomas
  (`check-i18n` 0 errores), teclado (el botón con Intro, Tab por las filas, Esc vuelve al botón), lector de pantalla (la
  red es `role="img"` con su resumen y las listas dicen lo mismo), CSP sin cambios.
- Validado: 533 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. Electron no estaba en la sesión (su instalador falla con el proxy): se bajó el zip de la versión fijada con `curl`, se comprobó su SHA-256 contra `SHASUMS256.txt` y se extrajo como lo hace el instalador. La primera puerta cayó en los cuatro pasos de arriba; la segunda, ya con los arreglos, solo en «filtro por autor…: quitar el filtro no deja el grafo como estaba» (el pendiente 12, intermitente en `dev` con el mismo mensaje; en la primera había pasado), y la tercera pasó entera.
- **Siguiente:** iteración 174, expansión: ítem 117 (Azure DevOps: los PRs en el grafo, Datos)

### 2026-11-02 · Iteración 174 · Expansión · Datos

- **Capacidad nueva: los revisores de un PR de Azure DevOps** (ítem 117 de la hoja de ruta). Los PRs de Azure ya salían
  en el grafo desde #214 (etiqueta `#N`, borradores, fusionados y cerrados; lo comprobaban `tools/azure.test.mjs` y un
  paso del smoke), así que el ítem estaba hecho a medias sin que la hoja lo supiera. Lo que faltaba frente a GitKraken
  («los PRs y sus revisores») eran los revisores: la ficha de una rama con PR de Azure suma «Revisores: Cy (aprobó), Di
  (espera al autor), Ed» con el voto de cada uno (10 y 5 aprobaron, -5 espera al autor, -10 rechazó, 0 aún nada); los
  grupos (equipos) no se listan y se muestran hasta 8. Sin consultas nuevas: la lista de PRs activos ya traía
  `reviewers`. Funciona igual en 2D y 3D (misma ficha) y en las pestañas de Azure; en GitHub y las demás fuentes no
  cambia nada (no traen `reviewers`).
- **Pruebas que fallan sin la capacidad:** `tools/azure.test.mjs` (de 16 a 17: votos, grupo y vacíos) y el paso del smoke
  «la ficha de la rama con PR de Azure DevOps lista sus revisores con el voto».
- README: la función de Azure DevOps y Límites conocidos; la fila de Replica pasa a `yes`.
- QA: ficha de la rama en 2D con tema claro (el texto va escapado con `U.esc`, nombres recortados a 60 letras); 4 textos
  nuevos en los 40 idiomas (`check-i18n` 0 errores); la CSP no cambia; sin consultas nuevas; auditoría: 0 hallazgos nuevos.
- Skills: no aplica: un campo más de una API ya consumida, que no entra en un dominio de guía experta.
- Arena: no aplica: una sola forma obvia (leer `reviewers` y sumarlo a la ficha).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: relevo de loop/174 (1ea0916)
- Validado: 535 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 175, mantenimiento · Deuda: pendiente 1 (El paso del smoke «editar el código: desde los cambios de un commit se abre su …)

### 2026-11-02 · Iteración 175 · Mantenimiento · Deuda

- **Arreglo: el paso del smoke «editar el código…» ya no guarda handles** (pendiente 1). El paso tomaba la ficha de la
  rama (`tipDiff`) y el botón Editar (`edit`) como handles y hacía clic después de otras esperas; si la demo volvía a
  dibujar el panel entre medias, el handle apuntaba a un nodo desmontado. Ahora enfoca y hace clic por selector, que
  Playwright resuelve en el momento (y reintenta) del clic.
- **Reproducción:** `node tools/smoke.mjs` → `✗ editar el código: …: elementHandle.click: Element is not attached to the DOM`
  (la de la iteración 148; es intermitente y no se pudo provocar a voluntad en esta sesión).
- **Pruebas que fallan sin el arreglo:** el mismo paso del smoke; no se midió con 5 corridas (el smoke tarda unos 7 min):
  queda una corrida en verde, no una estadística. Si vuelve a fallar con otro mensaje, se reabre como pendiente.
- README: no cambia (solo `tools/smoke.mjs`).
- QA: no toca la página; auditoría: no toca la página.
- Skills: no aplica: un cambio de selectores en una prueba, que no entra en un dominio de guía experta.
- Arena: no aplica: una sola forma obvia (selector en lugar de handle).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/175, sin colisión
- Validado: 535 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 176, expansión: ítem 127 (Resaltar una rama al pasar el puntero, Análisis)

### 2026-11-02 · Iteración 176 · Expansión · Análisis

- **Capacidad nueva: resaltar una rama al pasar el puntero, comprobada** (ítem 127 de la hoja de ruta). Al revisar el
  código, la capacidad ya existía: pasar el puntero o el foco por el nombre de una rama en la leyenda y las cabezas del
  grafo 2D, o por su etiqueta en el 3D, resalta la rama entera y atenúa el resto sin tocar el filtro ni la URL (README,
  Vista 2D y Vista 3D). Lo que faltaba era la prueba del puntero en la leyenda (el smoke solo cubría el foco) y la
  fila de `replica/features.csv`, que seguía en `partial`. Esta entrega suma el paso del smoke y pasa la fila a `yes`
  (paridad 86,6/100). Las listas de los paneles (salud, bitácora) son diálogos modales que tapan el grafo: resaltar
  desde ellas no se ve, así que no se hizo.
- **Pruebas que fallan sin la capacidad:** el paso nuevo del smoke «pasar el puntero por el nombre de una rama de la
  leyenda 2D resalta solo sus commits, sin tocar filtro ni URL»; no falla sin el cambio porque la capacidad ya estaba:
  protege contra una regresión, no se vio fallar.
- README: no cambia (ya lo dice en Vista 2D y Vista 3D).
- QA: la fila de la leyenda 2D con puntero y teclado, mirada con el paso del smoke (puntero) y el existente (foco); 3D sin
  cambios; auditoría: no toca la página.
- Skills: no aplica: la capacidad ya existía; el cambio es una prueba y una fila de la matriz.
- Arena: no aplica: una sola forma obvia (un paso del smoke).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/176, sin colisión
- Validado: 535 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 177, expansión: ítem 128 (Paleta de comandos, Público)

### 2026-11-02 · Iteración 177 · Expansión · Público

- **Capacidad nueva: paleta de comandos con Ctrl+K** (ítem 128 de la hoja de ruta). `Ctrl+K` (o `⌘K`) abre un diálogo con
  un buscador y la lista de las acciones de la app (paneles, 2D/3D, Replay, TV, vuelo, galaxias, zoom, pausa, ajustes…);
  filtra sin acentos ni mayúsculas, ↑ ↓ Home End mueven, Enter acciona y Esc cierra. Cada acción hace `click()` sobre el
  botón que ya existe (`js/cmdk.js`), y solo aparecen las disponibles. Sin consultas, sin CSP nueva. Los nombres reutilizan
  las claves de los botones; 6 claves nuevas (`cmdk.*`) en los 40 idiomas. Lo de «temas» del ítem no aplica: no hay un
  cambio de tema (sigue al sistema); el salto a rama o commit es el ítem 132.
- **Pruebas que fallan sin la capacidad:** `tools/cmdk.test.mjs` (filtro, atajo, cada acción apunta a un botón y a un
  texto que existen) y el paso del smoke «paleta de comandos: Ctrl+K abre la lista…».
- README: Controles, Estructura, Límites conocidos y Seguridad; fila de Replica a `partial`.
- QA: foco al abrir, nombre accesible, teclado completo y Esc, mirados con el paso del smoke; auditoría: la puerta la corre.
- Skills: no aplica: un diálogo con teclado que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (accionar los botones existentes).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/177, sin colisión
- Validado: 540 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 178, expansión: ítem 130 (Blame de un archivo, primera entrega, Datos)

### 2026-11-02 · Iteración 178 · Expansión · Datos

- **Capacidad nueva: «Quién lo tocó» en cada archivo del diff** (ítem 130 de la hoja de ruta, primera entrega de *blame*). Un
  botón junto a Historial despliega, bajo el archivo, los últimos 8 commits que lo cambiaron hasta ese commit, con autor,
  cuánto hace y titular (GitHub: `/commits?sha=&path=&per_page=8`, una consulta solo al pulsar; la demo lo deduce como el
  filtro por ruta). `fileLog` en `js/sources/github.js` y `demo.js`; `canBlame`/`fileLog` en `js/diff.js` y `js/app.js`.
  Sin autor por línea todavía (ítem 133, nuevo). 3 claves nuevas (`diff.blame*`) en los 40 idiomas; sin CSP nueva.
- **Pruebas que fallan sin la capacidad:** `tools/github.test.mjs` y `tools/demo.test.mjs` (`fileLog`) y el paso del smoke «quién tocó un archivo…».
- README: Cambios de cada commit, Límites conocidos y pruebas; fila de Replica «Blame de un archivo» a `partial`.
- QA: demo sin token y cuota (una consulta por pulsación), nombre accesible y `aria-expanded`, mirados con el paso del smoke; 40 idiomas con `check-i18n`; auditoría en la puerta (0 hallazgos nuevos).
- Skills: no aplica: un botón y una lista que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (una consulta de la API y una lista).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/178, sin colisión
- Validado: 542 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 179, mantenimiento · Seguridad: pendiente 10 (La versión de Electron (`44.4.5` en `package.json`) no se pudo comparar con la …)

### 2026-11-02 · Iteración 179 · Mantenimiento · Seguridad

- **Arreglo: Electron sube de 44.4.5 a 45.2.1, la última estable** (pendiente 10). `npm view electron` dio `latest` 45.2.1
  (la página de releases ya no hace falta); `package.json` y `package-lock.json` fijan 45.2.1. Sin cambios en `electron/`:
  el aislamiento, el preload, la navegación y las descargas siguen igual y las e2e del escritorio pasan con la nueva versión.
- **Reproducción:** `npm view electron dist-tags.latest` → `45.2.1`, con `package.json` en `44.4.5` (una mayor atrás).
- **Pruebas que fallan sin el arreglo:** las e2e de escritorio (`e2e/desktop.spec.mjs`) corren con la versión instalada; la
  comparación con la última estable fue manual (no hay prueba que falle por una versión más vieja).
- README: sin cambios (no nombra la versión).
- QA: Seguridad 4: versión de Electron frente a la última estable, vigente; el resto del protocolo no se tocó (solo cambia una dependencia); auditoría: no toca la página.
- Skills: no aplica: subida de versión de una dependencia ya existente.
- Arena: no aplica: una sola forma obvia.
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/179, sin colisión
- Validado: 542 pruebas (`node --test`), smoke, i18n (0 errores) y 28 e2e en verde. La primera corrida falló en «ocultar una rama o dejarla sola» (ajeno al cambio; intermitente, anotado en el pendiente 10).
- **Siguiente:** iteración 180, expansión: ítem 132 (Paleta de comandos, segunda entrega, Público)

### 2026-11-02 · Iteración 180 · Expansión · Público

- **Capacidad nueva: la paleta de comandos salta a una rama o a un commit** (ítem 132 de la hoja de ruta, segunda entrega del 128).
  Al escribir en `Ctrl+K`, además de las acciones, aparecen hasta 8 saltos: las ramas cuyo nombre contiene lo escrito (sin
  acentos ni mayúsculas) y los commits cuyo SHA empieza por 4 o más caracteres hexadecimales, solo entre lo ya cargado y sin
  consultas; Enter lleva el grafo hasta ahí (`focusBranch`/`focusSha`). `jumpTargets` en `js/cmdk.js`, `targets`/`jump` en
  `js/app.js`. 2 claves nuevas (`cmdk.toBranch`, `cmdk.toCommit`) en los 40 idiomas; sin CSP nueva.
- **Pruebas que fallan sin la capacidad:** `tools/cmdk.test.mjs` (`jumpTargets` y los saltos en `mount`) y el paso del smoke «paleta de comandos: escribir el nombre de una rama o el SHA de un commit ofrece saltar a él, sin consultas».
- README: Paleta de comandos, Estructura, Límites conocidos y Seguridad; fila «Paleta de comandos» de Replica a `yes`; Mapa de alcance.
- QA: nombre accesible y sin claves sin resolver, ninguna petición al saltar y consulta sin coincidencias, mirados con el paso del smoke; 40 idiomas con `check-i18n`; auditoría en la puerta (0 hallazgos nuevos).
- Skills: no aplica: una extensión de la lista de un diálogo que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (buscar en lo ya cargado y sumarlo a la lista).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/180, sin colisión
- Validado: 544 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 181, expansión: ítem 133 (Blame de un archivo, segunda entrega, Datos)

### 2026-11-02 · Iteración 181 · Expansión · Datos

- **Capacidad nueva: «Quién lo tocó» pasa a blame por tramos de líneas** (ítem 133 de la hoja de ruta, segunda entrega del 130).
  Con token de GitHub, el botón del diff pide el `blame` de GraphQL del archivo en ese commit (una consulta) y lista cada
  tramo («Líneas 1–20») con autor, fecha y titular; si no hay token, GitHub no lo da o el archivo se quitó, cae a la lista de
  commits de antes. La demo reparte 120 líneas inventadas entre los commits del archivo. `fileBlame` en `js/sources/github.js`
  y `demo.js`, `js/diff.js`, `js/app.js`. 1 clave nueva (`diff.blameLines`) en los 40 idiomas; sin CSP nueva.
- **Pruebas que fallan sin la capacidad:** `tools/github.test.mjs` (`fileBlame` con GraphQL simulado: una consulta, orden, null sin token), `tools/demo.test.mjs` (tramos sin huecos) y el paso del smoke «quién tocó un archivo», que exige tramos de líneas en la demo.
- README: Cambios de cada commit, Límites conocidos y pruebas; fila de Replica «Blame de un archivo» a `yes`.
- QA: botón con nombre y sin claves sin resolver, doble clic que cierra, mirados en el smoke; 40 idiomas con `check-i18n`; auditoría en la puerta.
- Skills: no aplica: una consulta GraphQL más sobre la fuente existente, que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (`Commit.blame` de GraphQL).
- OMC: plan=— · revisión=— · verificación=— (el plan por consenso y la revisión no corrieron: los agentes `omc-*` no están registrados en esta sesión; el ítem lleva esfuerzo 3 pero se entregó acotado a una consulta)
- Reclamo: loop/181, sin colisión
- Validado: 546 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 182, expansión: ítem 102 (Resumen de la semana: ramas nuevas, Salidas)

### 2026-11-03 · Iteración 182 · Expansión · Salidas

- **Capacidad nueva: el resumen de la semana dice cuántas ramas se crearon** (ítem 102 de la hoja de ruta, parte del 23).
  `compute` de `js/digest.js` suma `newBranches`: las actividades «rama creada» ya cargadas de los últimos 7 días, cada nombre una
  vez (como las ramas nuevas por semana de la salud); sale como línea del Markdown y de la imagen PNG, y no aparece si es 0. Sin
  consultas. 1 clave nueva (`digest.newbranches`) en los 40 idiomas; sin CSP nueva.
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` («ramas nuevas: las creadas en la semana, cada nombre una vez»: falla con `newBranches` indefinido sin el cambio).
- README: Salud del repo (Resumen de la semana) y Límites conocidos; Mapa de alcance.
- QA: nombre sin clave sin resolver y sección ausente con 0, mirados con la prueba; 40 idiomas con `check-i18n`; auditoría en la puerta.
- Skills: no aplica: una cifra más en un resumen que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (reusar el conteo de la salud).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: relevo de loop/182 (36ac818), reanudada por el disparo siguiente
- Validado: 547 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. (La primera sesión vio el smoke fallar tres veces en pasos ajenos y distintos; al reanudar pasó entero.)
- **Siguiente:** iteración 183, mantenimiento · QA: pendiente 8 (A 320 px el grafo sigue a ~420 px del inicio con la demo (antes 522; con un rep…)

### 2026-11-03 · Iteración 183 · Mantenimiento · QA

- **Arreglo: a 320 px un enlace «ir al grafo» llega al panel sin recorrer la página** (pendiente 8).
  Bajo la cabecera, solo a ≤560 px, un enlace (`#to-graph`, texto de `graph.aria2d`, ya traducido a los 40 idiomas) salta a
  `#graph-panel`, que recibe el foco (`tabindex="-1"`, sin contorno). No hay texto ni clave nuevos; sin CSP nueva.
- **Arreglo previo, porque `dev` estaba en rojo en este entorno (3 de 3 corridas, también sobre `origin/dev` limpio): el historial de un archivo en la demo
  dejaba fuera al commit que lo cambia.** `fileLog` de `js/sources/demo.js` buscaba solo por palabras del titular; para
  `src/api/index.ts` no traía ni «chore: initial project structure», y el paso «quién tocó un archivo» del smoke no veía ninguna fila
  (`diff.blameNone`). Ahora suma siempre el commit desde el que se pregunta.
- **Reproducción:** `node --test tools/demo.test.mjs` → «el historial de src/api/index.ts no trae al commit «chore: initial project structure» que lo cambia (semilla 7)»; y `node tools/smoke.mjs` (paso «a 320 px, un enlace «ir al grafo» salta al panel…») → sin el arreglo, `#to-graph` no existe y el paso falla.
- **Hallazgos:** 0 nuevos, 0 a la base de la auditoría (auditoría completa sin `--langs`: 0 hallazgos, 79 s; el smoke tres veces y el recorrido a mano de bordes no se hicieron: solo la puerta, una vez)
- **Pruebas que fallan sin el arreglo:** `tools/demo.test.mjs` («el historial de un archivo de un commit siempre incluye ese commit») y ese paso del smoke (enlace visible a 320 px, con texto traducido, el foco en el panel y el panel a menos de 60 px del borde).
- README: sin cambios (no es una función nueva; el detalle está en la bitácora).
- QA: celular angosto (320 px) mirado con el paso del smoke; 40 idiomas con `check-i18n` (sin claves nuevas); auditoría en la puerta.
- Skills: no aplica: un enlace ancla con CSS que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (ancla al panel).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/183, sin colisión
- Validado: 548 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. (Antes, una corrida falló en «filtro por autor», «ocultar una rama», «vista de un PR» y «cambios de un commit: con teclado» —intermitentes del pendiente Media 1— y otra por el alto de 19 px del enlace nuevo, arreglado; la tercera pasó entera.)
- **Siguiente:** iteración 184, expansión: ítem 138 (Constelación: solo los repos con actividad reciente, en la URL, Escala)

### 2026-11-03 · Iteración 184 · Expansión · Escala

- **Capacidad nueva: la constelación solo con los repos de actividad reciente, desde la URL** (ítem 138 de la hoja de ruta).
  `?recent=N` deja en la constelación los repos con algún commit cargado en los últimos N días (`?recent=30` es el mes; acepta
  fracciones, se acota a 3650; vacío, 0, negativo o no numérico no filtra). Un repo sin commits se conserva solo mientras carga. Se
  combina con `?constellation=texto` y lo anuncia con el texto de siempre («Filtradas por «≤ 30 d»: n de m»): sin claves nuevas.
- **Pruebas que fallan sin la capacidad:** `tools/constellation.test.mjs` («?recent=N deja los repos con actividad…»: `recentParam` indefinido sin el cambio) y el paso del smoke de `?recent` (10 galaxias con 30 días, 0 con 0,01).
- README: Constelación (barra superior) y Mapa de alcance; sin cambios en Seguridad (lee un número de la URL, nunca al DOM).
- QA: URL con valores raros mirados con la prueba; 40 idiomas con `check-i18n` (sin claves nuevas); auditoría en la puerta.
- Skills: no aplica: un filtro más sobre una lista que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (filtro puro como `filterItems`).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/184, sin colisión
- Validado: 549 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. (Antes, el paso del smoke de `?recent` falló dos veces por el umbral y por los repos vacíos: ajustados.)
- **Siguiente:** iteración 185, expansión: ítem 103 (Vista de texto: ramas fusionadas, Público)

### 2026-11-03 · Iteración 185 · Expansión · Público

- **Capacidad nueva: la vista de texto dice qué ramas ya están fusionadas** (ítem 103 de la hoja de ruta). Una rama cuya punta
  está en la historia de la por defecto (por cualquier padre, con lo ya cargado) lo dice en su nombre accesible («fusionada en la
  rama por defecto») y con una marca junto al nombre; la por defecto y una rama recién creada sobre su misma punta no cuentan.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` («una rama cuya punta ya está en la por defecto se dice fusionada…»: `merged` indefinido sin el cambio) y el paso del smoke de la vista de texto (árbol montado con una historia fija).
- README: Vista de texto y Límites conocidos (un squash o un rebase no se marca).
- QA: nombres accesibles y marca visible mirados en el smoke; 40 idiomas con `check-i18n` (clave `textview.merged` en todos); auditoría en la puerta. La demo no quedó con una rama fusionada sin borrar: dejar `fix/empty-payload` rompía dos pasos del smoke que cuentan ramas ocultas, así que el paso monta el árbol aparte.
- Skills: no aplica: una marca más en un árbol que ya cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (alcanzabilidad desde la punta de la por defecto).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/185, sin colisión
- Validado: 550 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. (Antes, dos corridas fallaron por el cambio de la demo, revertido.)
- **Siguiente:** iteración 186, expansión: ítem 104 (Salud del repo: tendencia de commits, Análisis)

### 2026-11-03 · Iteración 186 · Expansión · Análisis

- **Capacidad nueva: la salud del repo muestra los commits por semana** (ítem 104 de la hoja de ruta). Una línea más junto a las otras tendencias del ritmo: los commits de las últimas 8 semanas, de la más vieja a la actual, con los commits ya cargados (sin consultas); los de fecha futura o inválida no cuentan.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («tendencia de commits…» y el ritmo con `commitWeeks`: `undefined` sin el cambio) y el paso del smoke de la salud (`#hl-commitweeks` con 8 cifras sobre la demo).
- README: Salud del repo y Límites conocidos (solo cuenta los commits cargados).
- QA: 40 idiomas con `check-i18n` (clave `health.commitWeeks` en todos); texto de la línea y demo mirados en el smoke; auditoría en la puerta.
- Skills: no aplica: una línea más en un panel que ya cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (contar por semana con el mismo `weekly` de las otras tendencias).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/186, sin colisión
- Validado: 551 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 187, mantenimiento · Accesibilidad: auditoría (sin pendientes de Accesibilidad)

### 2026-11-03 · Iteración 187 · Mantenimiento · Accesibilidad

- **Auditoría de Accesibilidad: las teclas de la vista de texto se leen al entrar en el árbol.** La ayuda («Arriba y Abajo mueven…») se
  enlazaba con `aria-describedby` desde `#textview-body`, un `div` sin rol: los lectores de pantalla lo ignoran. Ahora la lleva el
  `ul[role=tree]` que recibe el foco. Auditoría completa y recorrido a mano de la vista de texto y la salud (foco al abrir y al
  cerrar, un solo `tabindex=0`, nombres de los 55 nodos, estado vacío anunciado): sin trampas, sin errores de consola.
- **Hallazgos:** 3 nuevos (pendientes 14 y 15; el tercero, el `aria-describedby` huérfano, arreglado aquí), 0 a la base de la auditoría. La
  auditoría completa sumó una sola medida fuera de la base, `fps2d` 2,9 (≥ 10) en Chromium sin GPU con la máquina cargada: ruido, no se carga.
- **Pruebas que fallan sin el arreglo:** el paso del smoke «vista de texto: árbol con teclado…» (`las teclas del árbol no se describen en el árbol`).
- README: sin cambios (no cambia lo que hace la función).
- QA: vista de texto (foco, roles, filtro sin resultados, flechas) y salud (títulos, líneas por semana) con Playwright sobre la demo; auditoría completa con `--langs`.
- Skills: no aplica: un atributo ARIA que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (el atributo va en el elemento con rol).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/187, sin colisión
- Validado: 551 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 188, expansión: ítem 119 (Azure DevOps: tags en el grafo, Datos)

### 2026-11-03 · Iteración 188 · Expansión · Datos

- **Capacidad nueva: los tags de Azure DevOps salen en el grafo** (ítem 119 de la hoja de ruta, parte del ítem 107). La fuente de Azure pide `refs?filter=tags/` (hasta 100, una consulta cada 15 minutos y solo con «Mostrar tags» activado) y los dibuja como los banderines de GitHub; en un tag anotado el commit es `peeledObjectId`. Si la consulta falla (403, 404), el grafo sigue sin ellos; la cuota o la red cortan el ciclo como siempre.
- **Pruebas que fallan sin la capacidad:** `tools/azure.test.mjs` («los tags salen de refs?filter=tags/…»: sin el cambio `src.data.tags` queda vacío) y el paso del smoke de Azure DevOps (`#graph .tag-flag .tag-text` = `v1.0-azure`).
- README: la lista de Azure DevOps, Límites conocidos (tags y despliegues; Azure DevOps) y la estructura de `azure.js`.
- QA: banderín en 2D y consulta única cada 15 minutos con la API simulada; sin texto nuevo (no hay claves de i18n); auditoría en la puerta.
- Skills: no aplica: una consulta más en una fuente que las reglas del repo ya cubren.
- Arena: no aplica: una sola forma obvia (la misma estructura `data.tags` que usa GitHub).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/188, sin colisión
- Validado: 553 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. La primera puerta falló en dos pasos ajenos e intermitentes («filtro por autor» y «ocultar una rama», pendiente de Deuda 9); la repetición pasó.
- **Siguiente:** iteración 189, expansión: ítem 121 (Primer padre en el grafo 3D, Análisis)

### 2026-11-03 · Iteración 189 · Expansión · Análisis

- **Capacidad nueva: el primer padre se comprueba también en el grafo 3D** (ítem 121 de la hoja de ruta, parte del ítem 111). Al revisar el camino, `drawGraph` ya le pasa al 3D el mismo layout filtrado que al 2D (`viewOf` aplica `firstParent` antes de `layout.compute`), así que el interruptor ya dejaba en el 3D solo la cadena del primer padre; faltaba la prueba que lo fijara y el README ya lo decía. No hay código de la app nuevo: la entrega son las dos pruebas.
- **Pruebas que fallan sin la capacidad:** `tools/layout.test.mjs` («el layout del primer padre … sin aristas de merge»: falla si el layout de `firstParent` deja nodos de la rama fusionada o aristas de merge) y el paso del smoke «el interruptor de primer padre también deja menos commits en el grafo 3D…» (falla si `Graph3D.update` no recibe menos nodos con el interruptor). Honestidad: no fallan «sin el cambio» porque el cambio ya estaba; fallarían si alguien desconecta el 3D del filtro.
- README: sin cambios (ya decía «2D, 3D y vista de texto»); el Mapa de alcance lo nombra.
- QA: interruptor con el 3D en Chromium por software (paso del smoke); sin texto nuevo (no hay claves de i18n); auditoría en la puerta.
- Skills: no aplica: una prueba sobre código que las reglas del repo ya cubren.
- Arena: no aplica: una sola forma obvia (espiar `Graph3D.update` como en los otros pasos del smoke).
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/189, sin colisión
- Validado: 554 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 190, expansión: ítem 124 (Vista de texto: ocultar una rama, Público)

### 2026-11-03 · Iteración 190 · Expansión · Público

- **Capacidad nueva: ocultar una rama o dejarla sola desde la vista de texto** (ítem 124 de la hoja de ruta, parte del ítem 110). El árbol ya respetaba las ramas ocultas (`viewOf`); ahora sobre una rama que no es la por defecto **H** la oculta y **S** la deja sola (repetir S las vuelve a mostrar), o los botones ⊘ y ◎ de su fila, con el mismo `onBranchView` del grafo (se recuerda por repo y viaja en la URL). El árbol y la nota se actualizan sin cerrarse, el foco pasa a la rama que ocupaba su lugar y la región viva lo dice. En la vista conjunta no se ofrece. 5 textos nuevos en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` («viewAction…», «viewNote…»: sin las funciones no existen) y el paso del smoke «vista de texto: H oculta una rama, S la deja sola…» (sin el cambio no hay botones ni la tecla oculta nada).
- README: la sección de la vista de texto, Límites conocidos (vista conjunta) y el Mapa de alcance.
- QA: filas de teclado y lector de pantalla (foco que no cae a `<body>`, región viva, nombres de los botones) con el paso del smoke; 40 idiomas con `check-i18n`; auditoría en la puerta.
- Skills: no aplica: una función del árbol que las reglas del repo ya cubren.
- Arena: no aplica: una sola forma obvia (reusar `onBranchView` y `update` del árbol).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; sin subagentes OMC en esta corrida)
- Hoja de ruta repuesta a 15 (ítems 138 a 143: seguimientos de la vista de texto, la salud, el resumen y la constelación; sin pasada nueva de Replica ni investigación vencida).
- Reclamo: loop/190, sin colisión
- Validado: 556 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 191, mantenimiento · Deuda: pendiente 1

### 2026-11-03 · Iteración 191 · Mantenimiento · Deuda

- **Arreglo: pasos del smoke intermitentes por elegir la rama a ciegas** (pendiente 1, parcial: sigue abierto con lo que falta medir). Un helper `openBranchTip` (`tools/smoke.mjs`) abre la ficha de una rama vigente, a la vista y que no sea la por defecto; lo usan «ocultar una rama o dejarla sola» y «cambios de un commit», que elegían `heads[3]` sin mirar si estaba a la vista. «Ocultar…» espera por conteo de etiquetas vigentes y «filtro por autor» deja de comparar con el conteo base.
- **Reproducción:** `xvfb-run -a node tools/smoke.mjs` → `✗ ocultar una rama o dejarla sola…: page.waitForFunction: Timeout 15000ms exceeded` (iteración 191, antes del arreglo); el de «filtro por autor»: `quitar el filtro no deja el grafo como estaba`.
- **Pruebas que fallan sin el arreglo:** el propio smoke con la demo viva (intermitente, 1 de 1 fallo observado en esta sesión antes del arreglo); 1 corrida en verde después (no son las 5 pedidas).
- README: no toca.
- QA: no toca la página (solo `tools/smoke.mjs`); auditoría: no toca la página.
- Skills: no aplica: un arreglo del propio smoke que las reglas del repo ya cubren.
- Arena: no aplica: una sola forma obvia.
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; sin subagentes OMC en esta corrida)
- Reclamo: loop/191, sin colisión
- Validado: 556 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 192, expansión: ítem 143 (Constelación: ordenar por PRs abiertos, Escala)

### 2026-11-03 · Iteración 192 · Expansión · Escala

- **Capacidad nueva: la constelación ordenada por PRs abiertos** (ítem 143 de la hoja de ruta).
  El selector de orden suma «PRs abiertos» (más PRs primero; empata por el orden de las pestañas) junto a pestañas, actividad y nombre,
  y `?order=prs` abre la constelación ya ordenada así. Cuenta `max(totalPulls, pulls.size)` de lo ya cargado: ninguna consulta nueva.
  Reusa el texto `stats.prs` del selector y del aviso («Ordenadas por …»): sin claves nuevas en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/constellation.test.mjs` («el orden…»: `sortItems(…, 'prs')` deja el orden de las pestañas y `orderParam('prs')` da `null`) y el paso del smoke de `?order=prs`.
- README: Constelación (barra superior) y Mapa de alcance; sin cambios en Seguridad (lee una palabra de la URL contra una lista fija).
- QA: 40 idiomas con `check-i18n` (sin claves nuevas); selector y aviso en el smoke; auditoría en la puerta.
- Skills: no aplica: un orden más en un selector, sin dominio nuevo.
- Arena: no aplica: una sola forma obvia.
- OMC: plan=— · revisión=— · verificación=— (esfuerzo 1, un solo frente; revisión propia del diff)
- Reclamo: loop/192, sin colisión
- Validado: 556 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 193, expansión: ítem 138 (Vista de texto: ver todas las ramas desde la vista, Público)

### 2026-11-04 · Iteración 193 · Expansión · Público

- **Capacidad nueva: ver todas las ramas desde la vista de texto** (ítem 138 de la hoja de ruta, parte del ítem 110). Con ramas ocultas o «solo una», la vista de texto suma el botón «Ver todas las ramas» (visible solo entonces) y la tecla **A** desde el árbol: limpian el filtro con el mismo `setBranchView` del grafo, sin cerrar el árbol, el foco queda en él y la región viva lo dice. Reusa el texto `branchview.reset`: sin claves nuevas en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/textview.test.mjs` («viewAction…», «viewNote…»: A no da `all`) y el paso del smoke «vista de texto: H oculta una rama, S la deja sola…» ampliado (sin el cambio no existe `#textview-showall` ni A hace nada).
- README: la sección de la vista de texto y Límites conocidos; Mapa de alcance (Público).
- QA: teclado y lector de pantalla (foco que no cae a `<body>` al esconderse el botón, región viva, botón oculto sin filtro) con el paso del smoke; 40 idiomas con `check-i18n`; auditoría en la puerta.
- Skills: no aplica: una función del árbol que las reglas del repo ya cubren.
- Arena: no aplica: una sola forma obvia (reusar `setBranchView` y `update` del árbol).
- OMC: plan=— · revisión=— · verificación=— (esfuerzo 1, un solo frente; revisión propia del diff)
- Reclamo: loop/193, sin colisión
- Validado: 556 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. La primera puerta falló en mi propio paso del smoke (el botón dejaba el foco en el filtro y no en el árbol): arreglado y repetido.
- **Siguiente:** iteración 194, expansión: ítem 125 (Alias de las pestañas, Escala)

### 2026-11-04 · Iteración 194 · Expansión · Escala

- **Capacidad nueva: alias de las pestañas** (ítem 125 de la hoja de ruta, fila «Pestañas por repo con alias» de Replica). Doble clic (o **F2** con la pestaña enfocada) abre un campo en la pestaña: Intro guarda el alias, Esc lo descarta y vacío lo quita (hasta 40 letras, `U.cleanAlias`). Se recuerda por repo en este navegador (`alias:<repo>`), sin tocar el repo, la URL ni el título del grafo; el nombre real queda en el título, el texto para lectores de pantalla y el botón de cerrar de la pestaña. La demo no lleva alias. Una sola clave nueva (`tabs.rename`) en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/util.test.mjs` («cleanAlias…») y el paso del smoke «alias de una pestaña: F2 la renombra, se recuerda y el nombre real sigue accesible» (F2, guardado, nombre real accesible, URL intacta, foco, Esc y vaciar).
- README: Varios repos a la vez, lista de funciones de abajo y Límites conocidos; `replica/features.csv` (la fila pasa a `yes`) y Mapa de alcance (Escala).
- QA: teclado (F2, Intro, Esc; el foco vuelve a la pestaña), nombre accesible con el nombre real, 40 idiomas con `check-i18n`; auditoría en la puerta.
- Skills: no aplica: un campo de texto en la pestaña, que las reglas del repo ya cubren.
- Arena: no aplica: una sola forma obvia (campo en línea sobre la pestaña, guardado como el resto de lo por repo).
- OMC: plan=— · revisión=— · verificación=— (esfuerzo 1, un solo frente; revisión propia del diff)
- Reclamo: loop/194, sin colisión
- Validado: 557 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 195, mantenimiento · QA: pendiente 10 (El indicador de estado dice «Sin conexión» (`status.error`) también con un 404 …)

### 2026-11-04 · Iteración 195 · Mantenimiento · QA

- **Arreglo: el indicador de estado ya no dice «Sin conexión» ante un 404 o la cuota agotada** (pendiente 10). `U.statusKey` (`js/util.js`) elige el rótulo del indicador, de la pestaña y de la vista conjunta según el tipo del error: `notfound` → «No encontrado» y `rate` → «Cuota agotada»; lo demás sigue siendo «Sin conexión». Dos claves nuevas (`status.errorNotFound`, `status.errorRate`) en los 40 idiomas.
- **Reproducción:** Playwright, 320×640, `?repo=acme/web&lang=es` con la API en 404 → `#status-text` = «Sin conexión» (antes del arreglo); después, «No encontrado», y con 403 de cuota, «Cuota agotada».
- **Hallazgos:** 0 nuevos, 0 a la base de la auditoría (auditoría completa sin `--langs`: 0 hallazgos, 63 s; el smoke tres veces y el recorrido a mano de todos los bordes no se hicieron: solo 404 y cuota agotada a 320 px, y la puerta, una vez)
- **Pruebas que fallan sin el arreglo:** `node --test tools/util.test.mjs` («statusKey…») → `U.statusKey is not a function`.
- README: no toca.
- QA: celular angosto (320 px) y 40 idiomas a mano con Playwright contra `node e2e/serve.mjs 4173` (404 y cuota agotada); `check-i18n`; auditoría en la puerta.
- Skills: no aplica: un arreglo de un rótulo que las reglas del repo ya cubren.
- Arena: no aplica: una sola forma obvia (elegir la clave por el tipo del error).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff)
- Reclamo: loop/195, sin colisión
- Validado: 558 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 196, expansión: ítem 126 (Varias cuentas del mismo servicio, Fuentes)

### 2026-11-04 · Iteración 196 · Expansión · Fuentes

- **Capacidad nueva: segunda cuenta de GitHub** (ítem 126 de la hoja de ruta, primera entrega que lo cierra). Ajustes suma «Segunda cuenta de GitHub»: un dueño (usuario u organización) y un segundo token. `GitHubSource.tokenFor` (`js/sources/github.js`) da ese token solo a los repos, a las listas `org:`/`@` y al feed de organización de ese dueño (sin distinguir mayúsculas); todo lo demás usa el principal, y nunca el de la segunda. Se guarda atada a su dueño (`pack2`/`unpack2`; web: `account2` en el almacén de secretos; escritorio: servicio `github2` cifrado con el llavero). Una sola cuenta extra, de GitHub.
- **Pruebas que fallan sin la capacidad:** `node --test tools/github.test.mjs` («segunda cuenta: …», dos pruebas: `tokenFor`/`pack2`/`unpack2` y que cada repo manda solo su token a la API simulada) → `GB.GitHubSource.unpack2 is not a function`; paso del smoke «el token de la segunda cuenta va solo a los repos de su dueño…».
- README: Token (la segunda cuenta), Límites conocidos y Seguridad; `replica/features.csv` fila «Varios perfiles o cuentas» a `partial`.
- QA: Ajustes (campo nuevo con nombre accesible y botón Mostrar/Ocultar, «Borrar tokens» también lo vacía) y recorrido con Playwright contra la API simulada: `acme/web` sale con la segunda y `otro/api` con la principal; auditoría en la puerta.
- Skills: no aplica: un campo más de Ajustes y una regla de qué token va a qué repo, que las reglas del repo ya cubren.
- Arena: no aplica: una sola forma obvia (elegir el token por el dueño del repo en un único punto).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; toca tokens y `electron/token.js` pero solo suma un servicio a la lista, con la misma validación del IPC)
- Reclamo: loop/196, sin colisión
- Validado: 560 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. (Reanudada: antes de ese verde el smoke falló 5 corridas en pasos ajenos y cambiantes —historial de un archivo, quién tocó, vista de texto, filtro por autor, editar el código—; la 6.ª pasó entera.)
- **Siguiente:** iteración 197, expansión: ítem 129 (Columnas de autor y fecha en el grafo 2D, Análisis)

### 2026-11-04 · Iteración 197 · Expansión · Análisis

- **Capacidad nueva: columnas de autor y fecha en el grafo 2D** (ítem 129 de la hoja de ruta). En la lupa, el interruptor «Mostrar autor y fecha junto a cada commit (grafo 2D)» escribe, en diagonal junto a cada commit, «Autor · fecha» (`GB.search.columnText` + `Graph.paintMeta`/`setColumns`), con lo ya cargado: sin consultas. Se recuerda en el navegador (`columns`) para todos los repos; con menos de 22 px entre commits no se dibuja. Solo 2D.
- **Pruebas que fallan sin la capacidad:** `node --test tools/search.test.mjs` («columnText arma «Autor · fecha»…») → `S.columnText is not a function`; paso del smoke «el interruptor de columnas pone «autor · fecha» junto a los commits del 2D, se recuerda y al apagarlo se quitan».
- README: Búsqueda de commits, Límites conocidos y Seguridad; `replica/features.csv` fila «Columnas de autor fecha y SHA» sigue en `partial` (falta el SHA y el 3D).
- QA: 2D con la demo (el interruptor tiene nombre, el texto entra con `textContent`, se recuerda al recargar, se quita al apagarlo); el texto nuevo en los 40 idiomas (`check-i18n`); auditoría en la puerta.
- Skills: no aplica: un interruptor y una etiqueta SVG, que las reglas del repo ya cubren.
- Arena: no aplica: una sola forma obvia (un texto SVG por nodo, creado al entrar en pantalla).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; no toca tokens, CSP ni `innerHTML`)
- Reclamo: loop/197, sin colisión
- Validado: 561 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 198, expansión: ítem 133 (Resumen de la semana de la organización: ramas nuevas, Salidas)

### 2026-11-04 · Iteración 198 · Expansión · Salidas

- **Capacidad nueva: el resumen de la semana de la organización suma las ramas nuevas** (ítem 133 de la hoja de ruta, parte del 47).
  `computeOrg` de `js/digest.js` suma `newBranches` de cada repo (el conteo de `compute`: cada nombre una vez por repo, con lo ya
  cargado); sale como línea de totales y como línea de cada repo en el Markdown y en la imagen PNG, y no aparece si es 0. Sin consultas.
  Reusa la clave `digest.newbranches` (ya en los 40 idiomas); sin CSP nueva.
- **Pruebas que fallan sin la capacidad:** `node --test tools/digest.test.mjs` («organización: suma las ramas nuevas de cada repo…») → falla con `o.newBranches` indefinido sin el cambio.
- README: Salud del repo (Resumen de la semana de la organización) y Límites conocidos.
- QA: sección ausente con 0 y nombre repetido en otro repo contado aparte, mirados con la prueba; sin texto nuevo (`check-i18n`); auditoría en la puerta.
- Skills: no aplica: una cifra más en un resumen que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (reusar el conteo de `compute`).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; no toca tokens, CSP ni `innerHTML`)
- Replica: paridad, sin pasada nueva; repuse la hoja de ruta con los ítems 143 a 148 (ideas de `docs/investigacion.md`)
- Reclamo: loop/198, sin colisión
- Validado: 562 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 199, mantenimiento · Rendimiento: auditoría (sin pendientes de Rendimiento)

### 2026-11-04 · Iteración 199 · Mantenimiento · Rendimiento

- **Auditoría de Rendimiento: el camino caliente del 3D no tiene nada caro** (sin pendientes previos). Base (mejor de 3): carga 1758 ms, 10 consultas, tareas largas 895 ms, 3D 10,6 fps y 2D 50,6 fps sin GPU. Con 1.000 ramas en 3D, por cuadro: `placeLabels` 0,36 ms, `placeNotes` 0,03 ms, `stepScene` 1,1 ms (el cuadro lo domina el render por software). El perfil de CPU de la carga no deja ninguna función de la app sobre 70 ms (`drawFx`, los fuegos de la carga). Arreglo: `placeLabels` ordenaba las fechas del eje (`[...days].sort(...)`) en cada cuadro; ahora guarda el orden (`daysByZ`) y lo invalida al sincronizarlas.
- **Hallazgos:** 3 nuevos (pendientes 15, 16 y 17, Baja), 0 a la base de la auditoría
- **Pruebas que fallan sin el arreglo:** `node --test tools/rendimiento.test.mjs` («placeLabels no ordena las fechas del eje en cada cuadro…») → `el sort de las fechas no corre por cuadro` sin el cambio.
- README: no cambia (sin función nueva).
- QA: 3D con la demo y con 1.000 ramas, medido con la auditoría completa antes y después (0 hallazgos); `--comparar`: carga +4 %, tareas largas +4 %, 3D −8 % (mejor), nada pasa del 10 %. Es ruido de la máquina, no del cambio (el sort de unas decenas de fechas no se nota).
- Skills: no aplica: perfilar y ajustar un camino caliente propio, que las reglas del repo ya cubren.
- Arena: no aplica: una sola forma obvia (guardar el orden y invalidarlo donde cambian las fechas).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; no toca tokens, CSP ni `innerHTML`)
- Reclamo: loop/199, sin colisión
- Validado: 563 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 200, expansión: ítem 135 (Vista de texto: ramas nuevas, Público)

### 2026-11-04 · Iteración 200 · Expansión · Público

- **Capacidad nueva: la vista de texto dice qué ramas son nuevas** (ítem 135 de la hoja de ruta, parte del 33). `freshBranches` (`js/textview.js`) toma de los eventos `branch-create` ya cargados las ramas creadas en los últimos 7 días; `build` marca `fresh` (nunca la por defecto) y el árbol lo dice en el nombre accesible y en una marca («creada en los últimos 7 días»). Sin consultas. Texto nuevo `textview.fresh` en los 40 idiomas; sin CSP nueva. Los ítems 134 y 141 ya existen desde antes (#118 y #164: despliegues y merges por semana en la salud): no se pueden tachar sin repetir un PR (R3), así que quedan en la hoja y los siguientes iteraciones los toman como «ya hecho» (Para Benjamin).
- **Pruebas que fallan sin la capacidad:** `node --test tools/textview.test.mjs` («una rama creada en los últimos 7 días se dice nueva…») → `ctx.window.GB.textview.freshBranches is not a function` sin el cambio.
- README: Vista de texto y Mapa de alcance (Público).
- QA: filas de teclado/lector de pantalla e idiomas: el texto va en `aria-label` y en `textContent` de una marca (sin `innerHTML`); 40 idiomas con `check-i18n`; ventana de 7 días, futuro, sin hora y la por defecto, miradas con la prueba; auditoría en la puerta.
- Skills: no aplica: una marca más en un árbol que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (los eventos `branch-create` que ya usa la salud).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; no toca tokens, CSP ni `innerHTML`)
- Reclamo: loop/200, sin colisión
- Validado: 564 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 201, expansión: ítem 134 (Salud del repo: tendencia de releases, Análisis)

### 2026-11-04 · Iteración 201 · Expansión · Análisis

- **Capacidad nueva: la salud muestra los tags por semana** (ítem 145 de la hoja de ruta, parte del 12). El ítem 134 que tocaba ya estaba hecho (#118, Para Benjamin 7): no se reconstruyó y se tomó el siguiente del mismo eje. `compute` (`js/health.js`) suma `pace.tagWeeks`: cada tag cuenta en la fecha de su commit si está cargado, y el panel lo dice en `#hl-tagweeks` (solo con algún tag). Sin consultas. Texto nuevo `health.tagWeeks` en los 40 idiomas; sin CSP nueva.
- **Pruebas que fallan sin la capacidad:** `node --test tools/health.test.mjs` («tendencia de tags…») → `Cannot read properties of undefined (reading 'tagWeeks')`/`pace.tagWeeks` indefinido sin el cambio.
- README: Salud del repo y Límites conocidos.
- QA: texto escapado con `U.esc`; 40 idiomas con `check-i18n`; tags sin commit cargado, sin fecha, fuera de las 8 semanas y sin `data.tags` miradas con la prueba; paso de formato en el smoke (solo si la línea aparece); auditoría en la puerta.
- Skills: no aplica: una línea más en un panel que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la que ya usan las otras tendencias).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; no toca tokens, CSP ni `innerHTML` con texto de afuera)
- Reclamo: loop/201, sin colisión
- Validado: 565 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 202, expansión: ítem 136 (Resumen de la semana de la organización: rama más activa, Salidas)

### 2026-11-04 · Iteración 202 · Expansión · Salidas

- **Capacidad nueva: la imagen del resumen de la organización nombra la rama más activa de cada repo** (ítem 136 de la hoja de ruta, parte del 47). El Markdown de la organización ya traía esa línea desde #110, pero sin prueba (como el 134 de la 201, Para Benjamin 7); lo que faltaba era la imagen: `imageLinesOrg` (`js/digest.js`) suma «Rama: x (n)» a la fila de cada repo. Sin consultas ni textos nuevos (`digest.branch` ya existe en los 40 idiomas); sin CSP nueva.
- **Pruebas que fallan sin la capacidad:** `node --test tools/digest.test.mjs` («organización: cada repo nombra su rama más activa…») → la fila `C: 5 · Rama: main (5)` no está en la imagen sin el cambio.
- README: Salud del repo (resumen de la organización) y Límites conocidos.
- QA: texto de la rama aplanado (`flat`) y recortado a 70 caracteres en la imagen, escapado en el Markdown; repo sin ramas cargadas no muestra la línea (prueba); sin consultas; auditoría en la puerta.
- Skills: no aplica: una línea más en una función pura que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la misma línea que ya usa el resumen de un repo).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; no toca tokens, CSP ni `innerHTML`)
- Reclamo: loop/202, sin colisión
- Validado: 566 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. La primera corrida falló en un paso ajeno («ocultar una rama o dejarla sola»: las etiquetas no bajaron de 4) y la segunda pasó: intermitencia, anotada en el pendiente 1 de Deuda.
- **Siguiente:** iteración 203, mantenimiento · Deuda: pendiente 1 (Pasos del smoke intermitentes en la sesión cloud: en la iteración 152, `npm run…)

### 2026-11-05 · Iteración 203 · Mantenimiento · Deuda

- **Arreglo: «ocultar una rama o dejarla sola» del smoke ya no depende del conteo de etiquetas** (pendiente 1, parte). Fallaba (202) con `las etiquetas no bajaron de 4`: la demo sigue publicando y una rama nueva compensaba la que se ocultaba. `tools/smoke.mjs` espera ahora a que las ramas concretas dejen de estar (`gone`), sin contar la rama por defecto, que «Solo esta» conserva (`js/search.js`).
- **Reproducción:** `xvfb-run -a node tools/smoke.mjs` → `✗ ocultar una rama o dejarla sola: …: las etiquetas no bajaron de 4` (intermitente, 202; con carga de la demo).
- **Pruebas que fallan sin el arreglo:** el propio paso del smoke, intermitente: no se pudo forzar a demanda; el arreglo quita la condición de carrera (comparar un conteo con la demo viva).
- README: no toca.
- QA: no toca la página; solo `tools/smoke.mjs`. Smoke de 165 pasos en verde una vez; las 5 corridas del pendiente quedan abiertas.
- Skills: no aplica: un ajuste de una espera en el smoke que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (esperar por nombre, como ya hace «filtro por autor»).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; solo `tools/smoke.mjs`)
- Reclamo: loop/203, sin colisión
- Validado: 566 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 204, expansión: ítem 134 (Salud del repo: tendencia de releases, Análisis)

### 2026-11-05 · Iteración 204 · Expansión · Análisis

- **Capacidad nueva: la salud muestra los issues abiertos por semana** (ítem 137 de la hoja de ruta, parte del 12). El ítem 134 que tocaba ya estaba hecho (#118, Para Benjamin 7): en vez de dejarlo atascar otra vez al loop, los ítems 134 y 141 (también hecho, #164) se reemplazaron por ítems nuevos con la misma numeración (PRs cerrados sin fusionar y autores de commits por semana) y se quitó la nota 7 de Para Benjamin. `compute` (`js/health.js`) suma `pace.issueWeeks`: cada número de issue cuenta una vez, con su primera apertura (`issue-open`), y el panel lo dice en `#hl-issueweeks` (solo con algún issue). Sin consultas. Texto nuevo `health.issueWeeks` en los 40 idiomas; sin CSP nueva.
- **Pruebas que fallan sin la capacidad:** `node --test tools/health.test.mjs` («la salud cuenta los issues abiertos por semana…») → `pace.issueWeeks` indefinido sin el cambio.
- README: Salud del repo y Límites conocidos.
- QA: texto escapado con `U.esc`; 40 idiomas con `check-i18n`; duplicados, cierres, eventos sin hora y fuera de las 8 semanas mirados con la prueba; paso de formato en el smoke (solo si la línea aparece); auditoría en la puerta.
- Skills: no aplica: una línea más en un panel que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la que ya usan las otras tendencias).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; no toca tokens, CSP ni `innerHTML` con texto de afuera)
- Reclamo: loop/204, sin colisión
- Validado: 567 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 205, expansión: ítem 139 (Vista de texto: CI de cada rama, Público)

### 2026-11-05 · Iteración 205 · Expansión · Público

- **Capacidad nueva: la vista de texto dice qué ramas tienen el CI fallando** (ítem 139 de la hoja de ruta, parte del 33). `build` (`js/textview.js`) suma `ciFailing` (el estado `failure` de `data.ci` de la rama); el nodo lo dice en su nombre accesible («CI fallando») y con una marca ✗ en rojo (`.tv-ci-fail`). Sin consultas: parte de lo ya cargado; en curso o en verde no se marca. Texto nuevo `textview.ciFailing` en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/textview.test.mjs` («cada rama dice si su último CI cargado falló…») → `ciFailing` indefinido sin el cambio; paso del smoke: la marca, si aparece, está en el nombre accesible.
- README: Vista de texto y Límites conocidos.
- QA: sin `data.ci`, con `success` y con `pending` no marca (prueba); texto con `textContent`; color con `--bad` en claro y oscuro; auditoría en la puerta.
- Skills: no aplica: una marca más en una vista que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la misma de «fusionada» y «quieta»).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; no toca tokens, CSP ni `innerHTML`)
- Reclamo: loop/205, sin colisión
- Validado: 568 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 206, expansión: ítem 134 (Salud del repo: PRs cerrados sin fusionar por semana, Análisis)

### 2026-11-05 · Iteración 206 · Expansión · Análisis

- **Capacidad nueva: la salud cuenta los PRs cerrados sin fusionar por semana** (ítem 134 de la hoja de ruta, parte del 12). `compute` (`js/health.js`) suma `pace.prCloseWeeks`: las actividades `pr-close` ya cargadas, cada número una vez con su primer cierre y sin los que el feed también vio fusionados; el panel lo dice en `#hl-prcloseweeks`. Sin consultas nuevas. Texto nuevo `health.prCloseWeeks` en los 40 idiomas.
- Hoja de ruta repuesta hasta 15 por encargo de Benjamin (2026-11-05): ítems 149 (extensión de Chrome y Firefox), 150 (app móvil: compartir hacia la PWA), 151 (más de 10 repos: tope de 20), 152 (CI de GitLab), 153 (estado de los despliegues) y 154 (resumen de la organización: issues cerrados), puntuados con `a×i/e` y en la tabla de ideas de `docs/investigacion.md`.
- **Pruebas que fallan sin la capacidad:** `node --test tools/health.test.mjs` («PRs cerrados sin fusionar por semana…») → `prCloseWeeks` indefinido sin el cambio; paso del smoke: la línea, si aparece, trae 8 cifras con algún PR.
- README: Salud del repo y Límites conocidos.
- QA: cierres repetidos, fusionados, futuros, fuera de las 8 semanas y de issues no cuentan (prueba); línea con `U.esc`; sin PR cerrado la línea no sale; auditoría en la puerta.
- Skills: no aplica: una línea más en un panel que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la de issues cerrados y abiertos).
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; no toca tokens, CSP ni `innerHTML` con texto de afuera)
- Replica: paridad, sin pasada nueva; la reposición salió del Mapa de alcance (columna Siguiente).
- Reclamo: loop/206, sin colisión
- Validado: 569 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 207, mantenimiento · QA: pendiente 11

### 2026-11-05 · Iteración 207 · Mantenimiento · QA

- **Arreglo: a ≤560 px las cifras conservan su línea de detalle** (pendiente 11). La regla de celular angosto dejaba `.stat-sub` en `display: none`, que la sacaba también del lector de pantalla; ahora queda escondida a la vista con el recorte de `.sr-only` (el alto de las tarjetas no cambia) y `syncStatTitles` (`js/app.js`) pone el detalle de cada cifra de `title` de su tarjeta, en todos los anchos.
- **Reproducción:** `node --test tools/stats-celular.test.mjs` → «a ≤560 px .stat-sub no usa display:none» y «cada cifra lleva su detalle como title de la tarjeta» fallan sin el arreglo.
- **Hallazgos:** 0 nuevos, 0 a la base de la auditoría (iteración de un pendiente: sin pasada exploratoria completa)
- **Pruebas que fallan sin el arreglo:** `tools/stats-celular.test.mjs` (2 pruebas; sin el arreglo, 0 de 2 pasan).
- README: sin cambios (comportamiento de celular ya descrito; no hay texto nuevo).
- QA: fila «Celular angosto» y «Teclado y lector de pantalla»: el detalle sigue en el DOM a 320 px y en la tarjeta como `title`; auditoría en la puerta. Se cerró el pendiente 11; no se hizo la pasada completa de QA exploratoria (auditoría `--langs`, smoke ×3), por ser una iteración de un pendiente.
- Skills: no aplica: un arreglo de CSS y un `title` que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia.
- OMC: plan=— · revisión=— · verificación=— (revisión propia del diff; no toca tokens, CSP ni `innerHTML`)
- Reclamo: loop/207, sin colisión
- Validado: 571 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 208, expansión: ítem 150 (App móvil, primera entrega: compartir hacia la PWA, Plataformas)

### 2026-11-05 · Pedido de Benjamin: las interacciones de los agentes en el grafo, en 2D y 3D

- **Pedido de Benjamin:** «En Graph branch quiero que se vea las interacciones de los agentes ahi tanto en graficos de 2D
  como en 3D». No es una iteración numerada y la proporción de la regla 2 no cambia.
- **Lo nuevo:** **Verlas en el grafo** (interruptor del panel de agentes, `?interactions=1` y la paleta de comandos)
  dibuja las interacciones sobre el grafo mismo. `GB.agents.compute` dice ahora de qué commit a qué commit va cada una
  (`target`: el anterior si continuó, el más nuevo de quien recibe en la rama fusionada si fusionó, la punta del PR (la
  cabeza de su rama o su merge) si revisó o comentó) y de quién es cada commit (`owners`); `GB.agents.overlay` arma lo que
  se dibuja: el color de cada participante (los 7 agentes más activos de todo lo cargado, para que «Solo entre agentes» no
  repinte a nadie; desde el octavo, «otros agentes»; las personas en gris), las marcas, los arcos y las insignias (los
  240 y 120 más recientes), sin las interacciones entre dos personas. En 2D (`js/graph.js`, `setAgents`): un marco
  cuadrado en cada commit de agente, un arco curvo con punta de flecha (a trazos si fusionó) y una insignia con ✓ o …
  sobre la punta del PR, cada uno con su `<title>`. En 3D (`js/graph3d.js`, `setAgents` y `writeAgents`): un cubo de
  vidrio alrededor de cada commit de agente, arcos de tubos instanciados que se curvan hacia afuera del tronco con un
  cono de punta, e insignias que flotan sobre el commit con su tallo (seis lotes instanciados nuevos, que se reescriben
  con las aristas). La ficha de cada commit (la misma en las dos vistas) cuenta sus interacciones. La leyenda va en una
  franja bajo el grafo (flotando tapaba lo más nuevo, que queda a la derecha), se pliega, en el celular empieza plegada,
  y su × las quita sin dejar el foco en `<body>`. Los 8 colores (`--ag1`…`--ag8`, claros y oscuros) pasaron el validador
  de paletas: banda de luminosidad, croma, separación con daltonismo y contraste ≥ 3:1 sobre `--surface`. Las
  interacciones se dibujan después de que la actividad nueva llega al panel: antes, con la demo en pausa, la revisión de
  Copilot no salía (lo encontró el smoke).
- **Pruebas que fallan sin el cambio:** `tools/agents.test.mjs` (de 9 a 11: `target` y `owners` de cada interacción,
  `overlay` con sus arcos, insignias, marcas y colores, «Solo entre agentes» sin repintar, el tope, los «otros agentes»
  desde el octavo y nada entre dos personas) y tres pasos del smoke en «Agentes e interacciones»: en 2D los marcos, el
  arco de la sesión que retoma la de otra, la insignia de Copilot, la leyenda y la URL; en 3D los cubos, arcos e
  insignias (`data-agents` del contenedor, porque el lienzo no se puede consultar) y la ficha; «Solo entre agentes» en el
  grafo y el ×.
- README: la función, los controles, el mapa de archivos, Seguridad y Límites conocidos.
- QA: demo en 2D y 3D en español claro a 1280 px (de lejos y de cerca, con la ficha), árabe oscuro a 1280 px (RTL),
  tamil a 390 px y alemán a 320 px (sin desborde; con la leyenda desplegada el grafo conserva su alto: en el celular el
  panel crece), 10 textos nuevos en los 40 idiomas (`check-i18n` 0 errores), teclado (las filas de la leyenda y sus dos
  botones son botones, Tab y Enter), movimiento reducido (nada se anima de más: los arcos son fijos), CSP sin cambios y
  sin consultas nuevas.
- Validado: 573 pruebas (`node --test`, ya sobre las iteraciones 206 y 207), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. Electron no estaba en la sesión (su instalador falla con el proxy): se bajó el zip de la 45.2.1 con `curl`, se comprobó su SHA-256 contra `SHASUMS256.txt` y se extrajo como lo hace el instalador. La primera puerta cayó solo en «editar el código» (intermitente en la sesión cloud, ya anotado en la iteración 200; no pasa por nada de esto); las tres siguientes, enteras.
- **Siguiente:** iteración 208, expansión: ítem 150 (App móvil, primera entrega: compartir hacia la PWA, Plataformas)

### 2026-11-05 · Iteración 208 · Expansión · Plataformas

- **Capacidad nueva: compartir hacia la PWA** (ítem 150 de la hoja de ruta, parte del mapa: Plataformas). `manifest.webmanifest` declara `share_target` (GET a `./` con `shared_title`, `shared_text` y `shared_url`, nombres propios para no chocar con `?title=`); `U.sharedRepo` (`js/util.js`) toma el primer enlace http(s) de esos campos cuyo host es exactamente el de un servicio que se sigue (sin las páginas propias de github.com como `orgs/` o `settings/`) y que `parseRepo` acepta; `js/app.js` lo pone primero entre los repos de la URL y quita los `shared_*` de la dirección. Sin consultas nuevas ni CSP nueva; sin conexión abre igual (el service worker sirve `index.html` con cualquier query).
- **Pruebas que fallan sin la capacidad:** `node --test tools/pwa.test.mjs` («compartir hacia la PWA…») → sin `share_target` ni `U.sharedRepo`; paso del smoke «compartir hacia la PWA: el enlace dentro del texto abre ese repo y sale de la dirección».
- README: Instalable y sin conexión, la estructura, Límites conocidos y Seguridad.
- QA: enlaces de las cinco plataformas, dentro de un texto con puntuación (también de ancho completo), hosts parecidos, gist y páginas propias de GitHub, `javascript:` y nada compartido (prueba); a mano con Playwright contra `node e2e/serve.mjs 4173`: la pestaña abre, se guarda y la dirección queda en `?repo=ana/notas`, sin errores de consola; auditoría en la puerta.
- Skills: no aplica: la búsqueda con `npx skills@1.7.4 find` fue denegada por el clasificador de permisos de la sesión; el `share_target` lo cubren el manifiesto y las reglas del repo.
- Arena: no aplica: una sola forma obvia (GET a la propia página, la única que funciona sin servidor y sin conexión).
- OMC: plan=— · revisión=5 hallazgos (3 arreglados: host exacto y páginas propias de GitHub, MEDIUM; hosts parecidos y puntuación de ancho completo, LOW; quedan 2 LOW documentados: desplazar un repo guardado con 10 pestañas, como `?repo=`, y el recorte a 4.000 caracteres) · verificación=PASS
- Reclamo: loop/208, sin colisión
- Validado: 574 pruebas (`node --test`, ya sobre el #264), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde (la primera corrida falló en el smoke «vista de texto: H oculta una rama…», ajeno al cambio: anotado en el pendiente 1).
- **Siguiente:** iteración 209, expansión: ítem 151 (Más de 10 repos: subir el tope a 20, Escala)

### 2026-11-05 · Iteración 209 · Expansión · Escala

- **Capacidad nueva: hasta 20 repos a la vez** (ítem 151 de la hoja de ruta, parte del ítem 26: Escala). `MAX_REPOS` pasa de 10 a 20: las pestañas, `org:`/`@usuario`, los repos guardados y de la URL, y la constelación admiten 20 (el reparto de cuota de la API es el que ya había: `share` por pestaña). La vista conjunta avisa en su cabecera («más de 1.500 ramas entre todos: la vista puede ir lenta, cierra algún repo», `all.heavy` en los 40 idiomas) cuando la suma de ramas pasa `GB.overview.HEAVY_BRANCHES`.
- **Pruebas que fallan sin la capacidad:** `node --test tools/overview.test.mjs` («heavy…») y `tools/constellation.test.mjs` («20 repos (el tope)…»); el paso del smoke «se siguen hasta 20 repos a la vez» (20 pestañas, la 21 se rechaza, 20 galaxias, el enlace a otro repo desplaza al último).
- README: Varios repos a la vez, Una organización entera, Límites conocidos (tope de 20 pestañas, constelación y resumen de la organización).
- QA: el smoke con 20 pestañas (constelación llena, orden, filtro, `?recent`); a mano con Playwright, 20 repos que dan 404: la constelación pierde galaxias a medida que cada pestaña termina de cargar (comportamiento previo, ahora visible por el escalonado de 700 ms × 20), por eso el paso `?recent=30` pide «alguna» y no «las 20»; auditoría en la puerta.
- Skills: no aplica: subir un tope y un aviso de texto no entran en un dominio con guía experta.
- Arena: no aplica: una sola forma obvia (la constante y la suma de ramas que la vista ya calculaba).
- OMC: no disponible (la sesión programada no corrió plan ni revisión; cambio de una constante, un aviso y sus pruebas)
- Reclamo: loop/209, sin colisión
- Validado: 576 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 210, expansión: ítem 152 (CI de GitLab, primera entrega, Datos)

### 2026-11-05 · Iteración 210 · Expansión · Datos

- **Capacidad nueva: CI de GitLab, primera entrega** (ítem 152 de la hoja de ruta, parte del mapa: Datos). `GitLabSource.syncCiGitlab` pregunta `/projects/:id/pipelines?ref=…&per_page=1` por la rama por defecto, las fijadas y las de una MR abierta (hasta 6 por ciclo, solo las que se movieron) y deja el estado ('success', 'failure', 'pending'; `skipped` y `manual` no cuentan) en el mismo `data.ci` que GitHub: la marca del grafo, el tooltip, la salud, la vista de texto y el aviso `ci-fail` de la rama por defecto salen solos. Un pipeline de otro commit que la cabeza no cuenta y se vuelve a preguntar; sin pipelines (403/404) deja de preguntar; un proyecto privado sin token no pregunta.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitlab.test.mjs` («CI: el estado del pipeline…» y «CI: una rama con MR abierta también…») → `data.ci.get('main')` da `undefined` en vez de `success`; paso del smoke «CI de GitLab: la rama por defecto lleva la marca de su último pipeline».
- README: También GitLab y Límites conocidos (el CI de GitLab).
- QA: marca de CI en 2D con la API simulada (success en main, pending en la rama de la MR; a mano con Playwright salen las dos marcas); 40 idiomas: sin textos nuevos (reusa `ci.*` y `act.ciFailed`); sin servidor nuevo en la CSP; auditoría: ver Validado.
- Skills: no aplica: una consulta REST más en una fuente que ya las hace; la API de pipelines no pide una guía experta.
- Arena: no aplica: una sola forma obvia (la misma de `syncCiRest`, con el endpoint de GitLab).
- OMC: no disponible (la sesión programada no corrió plan ni revisión; entrega de esfuerzo 2 en un solo frente)
- Reclamo: loop/210, sin colisión
- Validado: 578 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde (el smoke falló una vez, antes, en «se siguen hasta 20 repos a la vez: ?recent=…», ajeno al cambio, y pasó en la puerta).
- **Siguiente:** iteración 211, mantenimiento · Seguridad: auditoría (sin pendientes de Seguridad)

### 2026-11-05 · Iteración 211 · Mantenimiento · Seguridad

- **Auditoría de Seguridad: Electron sube de 45.2.1 a 45.2.3, la última estable.** El protocolo entero se revisó contra el código de `dev`: CSP sin directivas de más; los `innerHTML` con texto de afuera pasan por `U.esc`/`U.safeUrl` (el HTML de la bitácora ya filtra las URL con `isUrl` en origen); cada token va solo a su API (`Authorization`, nunca a la URL; `sw.js` no guarda respuestas de la API); en `electron/` quedan el aislamiento de contexto y el `sandbox`, el preload mínimo, navegación y ventanas nuevas bloqueadas (`openOutside` solo https), descargas solo de `blob:app://graphbranch/`, webhooks con `redirect: 'error'`, `serve` sin salir de `PUBLIC`, los `git` locales con `execFile` y SHA validados; `npm audit --omit=dev` da 0. El único hallazgo real fue la versión. Se probó (y se descartó) que `git diff --name-status/--numstat` corran el `textconv` del repo: no lo corren (era `git log -p` en el ensayo), así que no hay cambio en `electron/git.js`.
- **Reproducción:** `npm view electron version` → `45.2.3`, con `package.json` en `45.2.1` (dos parches atrás).
- **Hallazgos:** 1 nuevo (el de Electron, arreglado en esta iteración), 0 a la base de la auditoría. No se cargan 3 pendientes porque no se encontraron 3 reales.
- **Pruebas que fallan sin el arreglo:** ninguna; las e2e de escritorio corren con la versión instalada (45.2.3) y la comparación con la última estable es manual (como en la iteración 179).
- README: sin cambios (no nombra la versión).
- QA: Seguridad 1 a 5 (CSP, `innerHTML`, tokens, escritorio, versión de Electron frente a la última estable); auditoría: no toca la página.
- Skills: no aplica: subida de versión de una dependencia ya existente.
- Arena: no aplica: una sola forma obvia.
- OMC: no disponible (la sesión programada no corrió revisión; subida de un parche de la dependencia, sin tocar código)
- Reclamo: loop/211, sin colisión
- Validado: 578 pruebas (`node --test`), smoke, i18n (0 errores) y 28 e2e en verde (con Electron 45.2.3). Las dos primeras corridas del smoke fallaron en el mismo paso ajeno, «se siguen hasta 20 repos a la vez: ?recent=0.000001: 1 galaxias, se esperaban ninguna»: con 20 pestañas escalonadas, las que aún cargan no se descartan y el paso esperaba solo 10 s; ahora espera hasta 30 s (`tools/smoke.mjs`), y la tercera pasó entera.
- **Siguiente:** iteración 212, expansión: ítem 149 (Extensión de Chrome y Firefox, primera entrega, Plataformas)

### 2026-11-05 · Iteración 212 · Expansión · Plataformas

- **Capacidad nueva: extensión de Chrome y Firefox, primera entrega** (ítem 149 de la hoja de ruta, parte del mapa: Plataformas). `browser-extension/` (Manifest V3, sin dependencias, CDN ni compilación): un script de contenido en `https://github.com/*` añade «Abrir en GraphBranch» en las páginas de un repo, con el enlace `…/GraphBranch/?repo=dueño/repo` a la web publicada (`repo.js` saca el repo de la URL, sin las páginas propias de GitHub, y lo codifica). Sin permisos ni `host_permissions`; solo lee `location.href`. Carpeta lista para cargar en Chrome y Firefox, sin publicar en las tiendas (de Benjamin). El resto (GitLab, Codeberg y Bitbucket) queda como ítem 155.
- **Pruebas que fallan sin la capacidad:** `node --test tools/browser-extension.test.mjs` (4 pruebas: manifiesto sin permisos y solo github.com, código sin red ni almacenamiento, `repoFromUrl` con perfiles, `settings`, hosts parecidos, http y puertos, y `appUrl`).
- README: lista de funciones, sección «Extensión de Chrome y Firefox», estructura, Límites conocidos y Seguridad.
- QA: a mano con Playwright (github.com simulado): el botón sale en `/o/r/pull/3` con el enlace correcto, desaparece en `/settings/profile` y reaparece en `/a/b` al navegar sin recargar, sin errores de consola; sin textos de la app (no hay i18n nuevo); no toca la página: auditoría no aplica.
- Skills: no aplica: un manifiesto MV3 de un script de contenido, sin permisos, entra en lo que cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (script de contenido que arma un enlace; sin permisos no hay otra).
- OMC: no disponible (la sesión programada no corrió plan ni revisión; la primera entrega es un solo frente, sin permisos, sin red y sin tocar `js/` ni `electron/`)
- Reclamo: loop/212, sin colisión
- Validado: 582 pruebas (`node --test`), smoke (170 pasos) e i18n (0 errores) en verde; auditoría y e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 213, expansión: ítem 140 (Vista de texto: autor de la punta de cada rama, Público)

### 2026-11-05 · Iteración 213 · Expansión · Público

- **Capacidad nueva: la vista de texto dice el autor de la punta de cada rama** (ítem 140 de la hoja de ruta, parte del ítem 33; parte del mapa: Público). `GB.textview.build` suma `tipAuthor` a cada rama (el nombre del autor del commit de su punta, o su usuario si no hay nombre; vacío si la fuente no lo trae) con lo ya cargado y sin consultas; con el filtro por ruta sigue siendo la punta. El nombre accesible de la rama lo dice como «último commit de Ana» (clave `textview.tipBy`, en los 40 idiomas).
- **Pruebas que fallan sin la capacidad:** `node --test tools/textview.test.mjs` («cada rama dice quién hizo el commit de su punta…») → `tipAuthor` da `undefined` en vez de `'Ana'`; paso del smoke de la vista de texto «cada rama dice … quién hizo el commit de su punta» (y el de la rama quieta, que compara el nombre accesible entero, pasa a esperarlo).
- README: Vista de texto (lista de funciones), Límites conocidos (es el autor del commit, no quien empujó la rama).
- QA: vista de texto en la demo con el smoke (nombre accesible de cada rama frente al autor de su primer commit; sin textos sin resolver); 40 idiomas (`check-i18n`, 0 errores; «commit» unificado con el término que ya usa cada idioma tras la revisión); auditoría: ver Validado.
- Skills: no aplica: un texto más en un `aria-label` que ya existe; la accesibilidad de la vista la cubren el smoke y el Protocolo de QA.
- Arena: no aplica: una sola forma obvia (el autor del commit de la punta, ya cargado).
- OMC: plan=— · revisión=6 hallazgos (6 arreglados: comentario que contradecía el README, el paso del smoke sin regex frágil ni prefijos, «commit» en bg, hi, ta, th y bn, el orden en bn y las comas dentro de fi, hr, pl, ru, uk y tr) · verificación=PASS
- Reclamo: loop/213, sin colisión
- Validado: 583 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde. La primera corrida falló en el smoke «una rama sin actividad hace más de 30 días…», que compara el nombre accesible entero y no esperaba el autor: del propio cambio, se ajustó a la frase nueva.
- **Siguiente:** iteración 214, expansión: ítem 141 (Salud del repo: autores de commits por semana, Análisis)

### 2026-11-05 · Iteración 214 · Expansión · Análisis

- **Capacidad nueva: la salud del repo dice cuántos autores distintos hicieron commits cada semana** (ítem 141 de la hoja de ruta, parte del ítem 12). `GB.health.compute` suma `pace.authorWeeks`: las últimas 8 semanas (de la más vieja a la actual), cada una con cuántas personas distintas tienen un commit cargado en ella, con su usuario o, sin él, su nombre (sin distinguir mayúsculas, como la búsqueda por autor) y sin consultas nuevas. Un commit sin autor no suma. El panel lo muestra en `#hl-authorweeks` (clave `health.authorWeeks`, en los 40 idiomas) y se oculta si todas las semanas dan cero. Dice cuántas personas, nunca quiénes ni cuánto hizo cada una.
- **Pruebas que fallan sin la capacidad:** `node --test tools/health.test.mjs` («autores por semana…», y la del ritmo, que ahora compara `authorWeeks`) → `pace.authorWeeks is not iterable`; paso del smoke de la salud «los autores por semana no traen 8 cifras con algún autor» (y que ninguna semana tenga más autores que commits).
- README: Salud del repo (lista de funciones) y Límites conocidos (cómo se identifica a un autor y cuándo cuenta de más o de menos).
- QA: salud en la demo a mano con Playwright (`?demo=1&health=1`, español y árabe, 1280 y 320 px: la línea sale con 8 cifras, 8 autores frente a 23 commits esta semana, sin desborde ni errores de consola); 40 idiomas (`check-i18n`, 0 errores); auditoría: ver Validado.
- Skills: no aplica: una cuenta más sobre los commits ya cargados en un panel que ya existe; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (agrupar los commits cargados por semana y contar autores distintos).
- OMC: plan=— · revisión=3 hallazgos LOW (1 arreglado: el README dice también que un usuario y otra persona sin usuario con el mismo nombre cuentan una vez; los otros dos, aceptados: en un repo de una sola persona la línea repite su actividad, como la de commits, y la comparación del smoke con los commits es redundante con el paso anterior) · verificación=PASS
- Reclamo: loop/214, sin colisión
- Validado: 584 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 215, mantenimiento · Accesibilidad: pendiente 12 (La salud del repo repite cinco líneas casi iguales («… por semana, últimas 8 se…)

### 2026-11-05 · Iteración 215 · Mantenimiento · Accesibilidad

- **Arreglo: la salud del repo dice una sola vez el periodo de sus series por semana** (pendiente 12). Las nueve series del bloque de ritmo (PRs fusionados, abiertos y cerrados sin fusionar, issues cerrados y abiertos, ramas nuevas, commits, autores distintos y tags) van juntas en `#hl-weekly`, un grupo (`role="group"`, `aria-labelledby`) cuyo encabezado dice el periodo una vez («Últimas 8 semanas (de la más vieja a la actual)», clave nueva `health.weeksHead`); cada línea queda en «Commits por semana: 0 · … · 23». Las nueve claves se reescribieron en los 40 idiomas partiendo la frase que ya tenían (sin traducir de nuevo). `weeklyLines` (`js/app.js`) reemplaza los nueve bloques copiados; los ids de cada línea no cambian. La línea de despliegues de la entrega (DORA) va sola en su sección y queda igual. Los ceros siguen leyéndose uno por uno: resumirlos era la otra opción del pendiente y queda fuera.
- **Reproducción:** Playwright, demo `?demo=1&health=1&lang=es`, sin el arreglo → sin `#hl-weekly[role=group]` y 9 líneas `#health .hl-line[id$=weeks]` con «últimas 8 semanas (…)» antes de sus cifras.
- **Pruebas que fallan sin el arreglo:** paso del smoke «salud del repo: listas y ritmo…» → `las series por semana no van en un grupo con su encabezado` (con el arreglo exige el encabezado con el 8 y ninguna línea con una cifra antes de sus dos puntos).
- README: Salud del repo (lista de funciones).
- QA: salud en la demo a mano con Playwright (es, ja y ar, 320 y 1280 px: el grupo con su encabezado, 8 series, sin errores de consola; el desborde a 320 px, 28 px en español, es el del pendiente 11 y está igual sin el cambio); 40 idiomas (`check-i18n`, 0 errores, los mismos 39 avisos que en `dev`); auditoría: ver Validado.
- Skills: no aplica: un grupo con encabezado en un panel que ya existe; la accesibilidad la cubren el Protocolo de QA y el smoke.
- Arena: no aplica: una sola forma obvia (el periodo como encabezado del grupo, la primera opción del pendiente).
- OMC: plan=— · revisión=3 hallazgos LOW (0 arreglados: el encabezado es un `<p>` y no un `<h4>`, aceptado porque el grupo ya lo nombra y un `h4` partiría la jerarquía del panel; «古い順から今週まで» en japonés viene tal cual de la frase anterior; el texto no es el «Por semana, …» que proponía el pendiente porque cada línea ya dice «por semana») · verificación=PASS
- Reclamo: loop/215, sin colisión
- Validado: 584 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 216, expansión: ítem 142 (Resumen de la semana: PRs fusionados por autor, Salidas)

### 2026-11-05 · Iteración 216 · Expansión · Salidas

- **Capacidad nueva: el resumen de la semana dice quién fusionó los pull requests** (ítem 142 de la hoja de ruta, parte del ítem 23). `GB.digest.compute` suma `mergers`: las cuentas que fusionaron los PRs de la semana (el actor de cada actividad `pr-merge` ya cargada: en GitHub, el autor del evento o quien lo fusionó según la API), cada PR una vez aunque llegue por el feed y por el sondeo (cuenta la primera copia que dice quién lo fusionó; el sondeo lo guarda en `mergedBy`, sin el respaldo de quien abrió el PR), hasta 5 y ordenadas por PRs y por nombre; un merge sin cuenta no suma. Sale como una línea bajo «Pull requests fusionados» en el Markdown (escapada) y en la imagen PNG (clave nueva `digest.mergers`, en los 40 idiomas). Sin consultas nuevas.
- Hoja de ruta repuesta hasta 15: ítems 156 (SHA junto a cada commit del grafo 2D), 157 (Launchpad: fijar un PR), 158 (Launchpad: filtrar por persona), 159 (CI de GitLab en el resto de las ramas), 160 (token para un Forgejo o Gitea propio) y 161 (resumen de la organización: quién fusionó), puntuados con `a×i/e` y en la tabla de ideas de `docs/investigacion.md`.
- **Pruebas que fallan sin la capacidad:** `node --test tools/digest.test.mjs` («quién fusionó: cuenta los PRs de la semana por la cuenta que los fusionó…») → `Cannot read properties of undefined (reading 'total')`.
- README: Salud del repo (resumen de la semana, lista de funciones), Límites conocidos (de dónde sale la cuenta que fusionó y qué no suma) y la estructura (`js/digest.js`).
- QA: resumen de la semana en la demo a mano con Playwright (`?demo=1&health=1`, español y japonés a 1280 px y árabe a 320 px: «Quién fusionó: vrojas (2) · msoto (1)», sin desborde ni errores de consola); 40 idiomas (`check-i18n`, 0 errores, los mismos 39 avisos que en `dev`); auditoría: ver Validado.
- Skills: no aplica: una línea más en un resumen que ya existe, con lo ya cargado; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (contar los `pr-merge` de la semana por su actor, como «Quién aportó» cuenta los commits).
- OMC: plan=— · revisión=5 hallazgos (2 MEDIUM y 1 LOW arreglados: una copia del mismo PR sin cuenta ya no tapa a la que la trae; el sondeo guarda `mergedBy` aparte, así que quien abrió el PR no pasa por quien lo fusionó; el README nombra las fuentes y la excepción de Bitbucket Data Center. 2 LOW aceptados: el desempate distingue mayúsculas como «Quién aportó», y `md()` no escapa `&`, como antes) · verificación=PASS
- Replica: paridad, sin pasada nueva (92,7/100, must hechos 13 de 13); ítems 156, 157 y 158 de lo que falta («should» y «could»), los demás del Mapa de alcance.
- Reclamo: loop/216, sin colisión
- Validado: 585 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 217, expansión: ítem 156 (Grafo 2D: el SHA junto a cada commit, Análisis)

### 2026-11-05 · Iteración 217 · Expansión · Análisis

- **Capacidad nueva: las columnas del grafo 2D suman el SHA corto de cada commit** (ítem 156 de la hoja de ruta, parte de «Columnas de autor fecha y SHA a la vista en el grafo» de Replica). `GB.search.columnText` antepone los 7 primeros caracteres del SHA a «Autor · fecha» («2b7a0aa · Valentina Rojas · 2 nov 2026»), con el mismo interruptor de la lupa, que pasa a llamarse «Mostrar SHA, autor y fecha junto a cada commit (grafo 2D)» (clave `search.columns`, reescrita en los 40 idiomas). El SHA va primero para que el recorte (de 34 a 44 caracteres) nunca lo corte; un SHA que no es texto no se escribe. Sin consultas nuevas, con lo ya cargado; funciona en la demo y con todas las fuentes.
- **Pruebas que fallan sin la capacidad:** `node --test tools/search.test.mjs` («columnText antepone el SHA corto…») → `actual: 'Ana · d5'`; paso del smoke de las columnas: cada una es «SHA · autor · fecha» con 7 caracteres hexadecimales primero, y buscar ese SHA en la lupa encuentra un commit cargado que empieza por él.
- README: Búsqueda de commits (lista de funciones), Límites conocidos (recorte a 44 y prefijos repetidos en repos enormes) y Seguridad; `replica/features.csv`: la fila sigue `partial`, ahora solo le falta el 3D.
- QA: columnas a mano con Playwright en la demo (es y ta a 1280 px, ar a 320 px: el interruptor con su texto nuevo, 21 a 25 columnas «SHA · autor · fecha», la búsqueda por el SHA de la primera da 1 commit, sin errores de consola; captura del 2D: se pisan con muchos commits seguidos, como ya decía Límites conocidos); 40 idiomas (`check-i18n`); auditoría: ver Validado.
- Skills: no aplica: un dato más en una columna del grafo que ya existe; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (anteponer el SHA corto al texto que ya arma `columnText`).
- OMC: plan=— · revisión=4 hallazgos (1 MEDIUM y 1 LOW arreglados: el paso del smoke ya no exige exactamente 1 resultado ni prefijos distintos, que con los SHA al azar de la demo y la búsqueda por subcadena podían fallar alguna vez, y su mensaje dice «SHA · autor · fecha»; 2 LOW aceptados: el número del PR se confirma al abrirlo, y en árabe, hebreo, persa y urdu el bidi puede dejar el SHA al otro extremo de la diagonal, que se sigue leyendo) · verificación=PASS
- Reclamo: loop/217, sin colisión
- Validado: 586 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 218, expansión: ítem 143 (Resumen de la semana de la organización: PRs abiertos, Salidas)

### 2026-11-05 · Iteración 218 · Expansión · Salidas

- **Capacidad nueva: el resumen de la semana de la organización suma los pull requests abiertos** (ítem 143 de la hoja de ruta, parte del ítem 47). `GB.digest.computeOrg` suma `opened`: los PRs abiertos en la semana de cada repo seguido, con el mismo conteo que el resumen de un repo (las actividades `pr-open` ya cargadas, cada número una vez). El Markdown y la imagen PNG de la organización llevan el total bajo «Pull requests fusionados» y, en la sección de cada repo, los números de sus PRs abiertos (hasta 10, con «… +n» por el resto); un repo cuyo único movimiento de la semana es un PR abierto ahora sale en el resumen. Usa la etiqueta `digest.opened` que ya estaba en los 40 idiomas: sin textos nuevos y sin consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/digest.test.mjs` («organización: suma los PRs abiertos en la semana de cada repo…», con dos repos fabricados) → `expected: 3` (`o.opened` sin el cambio es `undefined`).
- README: Salud del repo (resumen de la semana de la organización, lista de funciones) y Límites conocidos (qué repos salen y cómo se cuentan sus PRs abiertos).
- QA: el resumen de la organización no está en la demo (pide seguir `org:`); lo cubren la prueba nueva (Markdown, imagen, sin PRs, más de 10) y el paso del smoke «el resumen de la semana de la organización junta sus repos abiertos» (Markdown sin `undefined`, `.md` y `.png`); 40 idiomas (`check-i18n`, 0 errores: la etiqueta ya existía); auditoría: ver Validado.
- Skills: no aplica: una cifra más en un resumen que ya existe, con lo ya cargado; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (sumar el `opened` que `compute` ya da por repo, como `merged`).
- OMC: plan=— · revisión=3 hallazgos LOW (2 arreglados: la lista de PRs fusionados de cada repo también dice «… +n» cuando pasa de 10, y el comentario de `computeOrg` nombra qué cuenta como actividad; 1 aceptado: en la imagen la línea de cada repo se recorta a 70 caracteres y, con muchos PRs, lo último queda fuera, como ya pasaba con los fusionados) · verificación=PASS
- Reclamo: loop/218, sin colisión
- Validado: 587 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 219, mantenimiento · Deuda: pendiente 1 (Pasos del smoke intermitentes en la sesión cloud: en la iteración 152, `npm run…)

### 2026-11-05 · Iteración 219 · Mantenimiento · Deuda

- **Arreglo: los pasos intermitentes del smoke en la nube, y la carrera de la app que tapaba uno** (pendiente 1; cierra también el 9, el mismo «filtro por autor»). Los pasos que cuentan ramas o leen la región viva («vista de texto: árbol con teclado…», «vista de texto: H oculta una rama, S la deja sola…», «filtro por autor…») corren ahora con la demo en pausa (`quieta` en `tools/smoke.mjs`: pausa con `#pause-btn` y la deja como estaba, también si el paso falla): la demo publicaba a mitad y descuadraba la cuenta o cambiaba la región viva a «Novedades». «Al cerrar el último repo de la organización…» era un fallo de la app: una renovación de la lista de la organización en vuelo, al volver tras cerrar su último repo, la guardaba de nuevo y reabría sus repos como nuevos; `connectOwner` (`js/app.js`) ya no sigue si la organización se dejó mientras llegaba la lista.
- **Reproducción:** con la demo sin pausa, abrir la vista de texto y leer la región viva 9 s después (script de Playwright en el scratchpad) → `Novedades: 0 ramas, 1 commits` (el fallo del paso); con pausa no cambia. `node tools/smoke.mjs` con el paso nuevo y sin el arreglo de `js/app.js` → `✗ al cerrar el último repo de la organización deja de seguirse: sigue guardada: {"acme":["nuevo","api","web","viejo"]}`.
- **Pruebas que fallan sin el arreglo:** el paso del smoke «al cerrar el último repo de la organización deja de seguirse», ahora determinista: la lista de acme tarda 2 s (más que el intervalo de renovación del smoke), así que al cerrar siempre hay una renovación en vuelo, y además de lo guardado comprueba que no vuelvan las pestañas. Medida: antes, una reproducción puntual (no una tasa) y el historial del pendiente; después, 5 corridas seguidas en verde de los tres pasos con `quieta` (4 smoke sueltos y una puerta, antes de tocar `connectOwner`) y una puerta completa con todo (el paso de la organización, que ahora fuerza la carrera, falla sin el arreglo y pasa con él).
- README: sin cambios (ni la función ni sus límites cambian: el arreglo deja la app como el README ya la describe).
- QA: seguir una organización (paso del smoke con la renovación en vuelo) y vista de texto y filtro por autor (sus pasos del smoke, 6 de 6; el de la organización con su forma nueva, en la puerta final); auditoría: ver Validado.
- Skills: no aplica: pruebas del smoke propias y una carrera de la app; lo cubren las reglas del repo y el Protocolo de QA.
- Arena: no aplica: una sola forma obvia (quietar la demo durante el paso, como ya hacían otros, y cortar la renovación de una organización dejada).
- OMC: plan=— · revisión=3 hallazgos (HIGH arreglado: la causa de «al cerrar el último repo…» era la carrera de `connectOwner`, no la prueba; MEDIUM arreglado: el comentario de «filtro por autor» decía más de lo que comprueba; LOW arreglado: si la página cae, el `finally` de `quieta` no tapa el error del paso) · verificación=PASS
- Reclamo: loop/219, sin colisión
- Validado: 587 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 220, expansión: ítem 146 (Vista de texto: ramas sin PR, Público)

### 2026-11-05 · Iteración 220 · Expansión · Público

- **Capacidad nueva: la vista de texto dice qué ramas no tienen pull request abierto** (ítem 146 de la hoja de ruta, parte del ítem 33; parte del mapa: Público). `GB.textview.build` suma `noPr` a cada rama que no es la por defecto ni está fusionada y de la que no sale ningún PR abierto del mismo repo (uno de un fork con el mismo nombre de rama no cuenta); su nombre accesible lo dice como «sin PR abierto» (clave `textview.noPr`, en los 40 idiomas). Solo cuando la lista ya cargada está completa: `GB.textview.pullsComplete`, sobre el estado sin filtrar, pide que la fuente traiga PRs (no un repo local ni la práctica de git), que el repo ya cargó, que haya menos de 50 abiertos y no menos que el total que da la fuente, y que el token pueda leerlos (`pullsUnknown`, nuevo en `js/sources/github.js`: con GraphQL, un token sin permiso de PRs ya no deja la lista como vacía). Sin consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/textview.test.mjs` («con la lista de PRs completa, una rama sin PR abierto propio lo dice…») → `actual` sin `noPr`, y «la lista de PRs está completa solo si…» → `TypeError` (`pullsComplete` no existe); `node --test tools/github.test.mjs` («GraphQL: un token sin permiso de PRs deja la lista… como desconocida») → `undefined !== true`; paso del smoke de la vista de texto: en la demo, cada rama dice «sin PR abierto» si y solo si no es la por defecto, no tiene PRs abiertos y no está fusionada (y el de las ramas quietas ahora la exige en `gh-pages`).
- README: Vista de texto (lista de funciones) y Límites conocidos (cuándo se dice, el tope de 50, los forks, el token sin permiso y los Forgejo propios con otro tope).
- QA: vista de texto en la demo a mano con Playwright (`?demo=1&view=text`, español a 1280 px, inglés y árabe a 320 px: `develop` dice «sin PR abierto», las ramas con PR y `main` no; sin errores de consola ni desborde); 40 idiomas (`check-i18n`, 0 errores); auditoría: ver Validado.
- Skills: no aplica: una marca más en el nombre accesible de una vista que ya existe, con lo ya cargado; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (contar los PRs abiertos por rama, como ya hace `prs`, y decir el cero solo con la lista completa).
- OMC: plan=— · revisión=4 hallazgos (1 MEDIUM arreglado: un token de GitHub sin permiso de PRs hacía decir «sin PR abierto» de todas las ramas; 1 MEDIUM y 1 LOW a Mantenimiento como pendientes 14 y 15: un Forgejo propio con tope menor que 50 y `sameRepo` de Bitbucket Data Center con un repo renombrado; 1 LOW aceptado: sin token, un PR recién abierto tarda hasta 3 min en quitar la marca, «con lo ya cargado») · verificación=PASS
- Reclamo: loop/220, sin colisión
- Validado: 590 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 221, expansión: ítem 144 (Resumen de la semana de la organización: autores nuevos, Salidas)

### 2026-11-05 · Iteración 221 · Expansión · Salidas

- **Capacidad nueva: el resumen de la semana de la organización suma los autores nuevos** (ítem 144 de la hoja de ruta, parte del ítem 47). `GB.digest.computeOrg` suma `newcomers`: las personas que firmaron un commit de la semana en algún repo seguido y ninguno cargado anterior a la semana en cualquiera de ellos (quien es nueva en dos repos cuenta una vez; quien ya firmaba en otro repo de la organización no es nueva en ella), con los commits ya cargados de cada pestaña. El Markdown y la imagen PNG de la organización llevan el total bajo los commits y, en la sección de cada repo, sus autores nuevos en ese repo. El conteo de autores de `compute` pasa a una función `authors()` que comparten los dos, sin cambiar lo que da `compute`. Usa la etiqueta `digest.newcomers` que ya estaba en los 40 idiomas: sin textos nuevos y sin consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/digest.test.mjs` («organización: suma los autores nuevos de los repos seguidos, cada persona una vez…», con dos repos fabricados) → `expected: 2` (`o.newcomers` sin el cambio es `undefined`).
- README: Salud del repo (resumen de la semana de la organización, lista de funciones) y Límites conocidos (cómo se cuentan los autores nuevos de la organización y por qué el total puede ser menor que la suma de los repos).
- QA: el resumen de la organización no está en la demo (pide seguir `org:`); lo cubren la prueba nueva (Markdown, imagen, sin autores nuevos) y el paso del smoke «el resumen de la semana de la organización junta sus repos abiertos» (Markdown sin `undefined`, `.md` y `.png`); 40 idiomas (`check-i18n`, 0 errores: la etiqueta ya existía); auditoría: ver Validado.
- Skills: no aplica: una cifra más en un resumen que ya existe, con lo ya cargado; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (juntar los autores de la semana y los de antes de cada repo, como `compute` ya hace por repo).
- OMC: plan=— · revisión=4 hallazgos (0 arreglados; 1 MEDIUM aceptado: «Autores nuevos» del total es nuevo en la organización y el de cada repo es nuevo en ese repo, así que el total puede ser menor que la suma, como dice el README; 3 LOW aceptados: `authors()` recorre los commits de cada repo dos veces, O(n); la misma persona con usuario en un repo y solo nombre en otro cuenta dos veces, ya documentado; la prueba no fija un commit con fecha futura o sin autor en la organización, que el código descarta igual que en un repo) · verificación=PASS
- Reclamo: loop/221, sin colisión
- Validado: 591 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 222, expansión: ítem 147 (Constelación: ordenar por ramas nuevas, Escala)

### 2026-11-05 · Iteración 222 · Expansión · Escala

- **Capacidad nueva: la constelación ordenada por ramas nuevas de la semana** (ítem 147 de la hoja de ruta, parte del ítem 26). El selector de orden suma «Ramas nuevas» (más ramas creadas en los últimos 7 días primero; empata por el orden de las pestañas) junto a pestañas, actividad, PRs abiertos y nombre, y `?order=new` abre la constelación ya ordenada así. `GB.constellation.newBranches` cuenta las creaciones de rama de la actividad ya cargada de cada repo con la misma regla que el resumen de la semana (cada nombre una vez, la ventana `(ahora − 7 d, ahora]`); la lista de órdenes queda en una sola constante (`ORDERS`) que comparten el selector y la URL. Clave nueva `constellation.orderNew` en los 40 idiomas (la misma frase que «Ramas nuevas: {n}» del resumen). Sin consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/constellation.test.mjs` («el orden…»: `sortItems(…, 'new')` deja el orden de las pestañas y `orderParam('NEW')` da `null`; «las ramas nuevas de la semana…» y «ordenar por ramas nuevas con la actividad de cada repo…», con repos fabricados → `TypeError`: `newBranches` no existe) y el paso del smoke de `?order=new` (selector en «new» y anuncio «Ordenadas por Ramas nuevas»).
- README: Constelación (lista de funciones: el orden, `?order=new` y de dónde sale la cifra) y Mapa de alcance; sin cambios en Seguridad (lee una palabra de la URL contra una lista fija).
- QA: selector, URL y anuncio en el smoke (40 idiomas); 40 idiomas con `check-i18n` (0 errores); auditoría en la puerta.
- Skills: no aplica: un orden más en un selector que ya existe, con lo ya cargado; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (contar las creaciones de rama como ya hace el resumen de la semana y ordenar como los demás órdenes).
- OMC: plan=— · revisión=5 hallazgos LOW, 0 de seguridad (2 arreglados: la lista de órdenes repetida pasa a `ORDERS` y una prueba encadena la actividad de dos repos con el orden; 3 aceptados: el conteo repite el de `js/digest.js` en vez de compartirlo, la etiqueta no dice «7 días» y la galaxia no muestra su cifra, igual que con los PRs abiertos) · verificación=PASS
- Reclamo: loop/222, sin colisión
- Validado: 593 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde (la primera corrida tras el último commit falló en un paso ajeno, la vista de texto «sin PR abierto»: intermitente, la repetición pasó; pendiente 2 de Mantenimiento).
- **Siguiente:** iteración 223, mantenimiento · Errores: pendiente 15 (Forgejo o Gitea propio: los PRs abiertos se piden con `limit=50` (`js/sources/c…)

### 2026-11-05 · Iteración 223 · Mantenimiento · Errores

- **Arreglo: un Forgejo o Gitea propio con tope menor que 50 ya no recorta los PRs abiertos sin decirlo** (pendiente 15). `syncPulls` de `js/sources/codeberg.js` pasa a `applyPulls` el total de la cabecera `X-Total-Count` (si falta o no es válida, sigue siendo lo que llegó): con un servidor que recorta a 30 y 40 PRs, `totalPulls` es 40 y la vista de texto ya no dice «sin PR abierto» de una rama que sí lo tiene. Mismo patrón buscado en las demás fuentes: Bitbucket Data Center pagina con `isLastPage`, sin el problema.
- **Reproducción:** `node --test tools/codeberg.test.mjs` → `un servidor propio con un tope menor que 50…`: `expected: 40, actual: 30` (`data.totalPulls`).
- **Pruebas que fallan sin el arreglo:** la misma («…el total sale de X-Total-Count…») y su contraparte «sin X-Total-Count el total sigue siendo lo que llegó».
- README: sin cambios (no cambia lo que hace la función, solo cuándo dice «sin PR abierto»).
- QA: filas de fuentes y vista de texto cubiertas por la prueba con la API simulada; auditoría: no toca la página.
- Skills: no aplica: una cabecera más leída en una fuente que ya existe; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (leer la cabecera que el servidor ya manda).
- OMC: plan=— · revisión=3 hallazgos LOW (0 arreglados: la regla repetida de `#agents-body`, la prueba que busca el texto del CSS y el viewport del smoke sin `finally`; quedan como están, sin efecto) · verificación=— (no se lanzaron los agentes: el cambio es una cabecera leída en una fuente, con su prueba; revisión propia del diff)
- Reclamo: loop/223, sin colisión
- Validado: 595 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 224, expansión: ítem 148 (Práctica: restore --staged y clean, Público)

### 2026-11-06 · Iteración 224 · Expansión · Público

- **Capacidad nueva: la práctica de git con área de preparación y `clean`** (ítem 148 de la hoja de ruta, parte del ítem 16). El intérprete suma `add <archivo>|.`, `restore --staged <archivo>|.`, `clean` (`-n` lista, `-f` borra; sin bandera se niega como git) y `touch --new` (un archivo sin seguir); `status` separa «Changes to be committed», «Changes not staged» y «Untracked files»; lo preparado bloquea cambiar de commit y el rebase, `stash` lo guarda y `reset` lo saca (`--hard` lo tira). Ejercicio 10 «Deshacer un add y limpiar» (`?practice=10`) con su título y meta en los 40 idiomas. `commit` sigue guardando todo (sin commit de solo lo preparado).
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs` («add, restore --staged y clean…», «el ejercicio de limpiar no se da por resuelto con el atajo equivocado» y «cada ejercicio parte sin resolver…») → fallan los tres sin el cambio (`add` no es un comando de git).
- README: Aprender git (comandos, diez ejercicios, `?practice=1` a `10`, pruebas) y Límites conocidos (el área de preparación es una lista; `commit` guarda todo).
- QA: terminal y ejercicio cubiertos por `node --test`; 40 idiomas con `check-i18n` (0 errores); auditoría y smoke en la puerta.
- Skills: no aplica: más comandos en un intérprete que ya existe, con lo ya cargado; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (una lista de preparados junto a la de cambios, como ya hace `stash`).
- OMC: plan=— · revisión=3 hallazgos LOW (0 arreglados: la regla repetida de `#agents-body`, la prueba que busca el texto del CSS y el viewport del smoke sin `finally`; quedan como están, sin efecto) · verificación=— (revisión propia del diff: sin DOM, sin red, sin textos de afuera; los archivos de `touch` pasan por la misma validación)
- Replica: paridad 92,7/100, sin pasada nueva (13 de 13 must hechos); ítems 162 a 167
- Reclamo: loop/224, sin colisión
- Validado: 597 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 225, expansión: ítem 165 (Constelación: ordenar por issues abiertos, Escala)

### 2026-11-06 · Iteración 225 · Expansión · Escala

- **Capacidad nueva: la constelación ordenada por issues abiertos** (ítem 165 de la hoja de ruta, parte del ítem 26). El selector de orden suma «Issues abiertos» (más issues abiertos primero; empata por el orden de las pestañas) y `?order=issues` abre la constelación ya ordenada así. El número sale del `open_issues_count` de la consulta del repo que cada fuente ya hacía al abrirlo, sin consultas nuevas: GitLab y Forgejo/Gitea/Codeberg lo dan solo de issues (`repo.openIssues`); GitHub lo da junto con los PRs (`repo.openItems`) y `GB.constellation.openIssues` le resta los PRs abiertos conocidos (nunca baja de 0). Bitbucket, Azure DevOps y los repos locales no lo dan: cuentan como 0. Clave nueva `constellation.orderIssues` en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/constellation.test.mjs` («el orden…»: `sortItems(…, 'issues')` deja el orden de las pestañas y `orderParam('Issues')` da `null`; «issues abiertos con lo ya cargado…» → `TypeError`: `openIssues` no existe), `tools/github.test.mjs`, `tools/gitlab.test.mjs` y `tools/codeberg.test.mjs` (el total sale de la consulta del repo) y el paso del smoke de `?order=issues` (tres repos simulados con 1, 3 y 4 issues, el de 3 con 2 PRs que no cuentan: `o/c o/b o/a`, y el anuncio «Ordenadas por Issues abiertos»).
- README: Constelación (el orden nuevo y `?order=issues`) y Límites conocidos (el total no se refresca con el repo abierto; sin token, con más de 50 PRs abiertos en GitHub los issues salen de más; las fuentes sin el dato cuentan como 0).
- QA: constelación con teclado y anuncio en la región viva por el smoke; 40 idiomas con `check-i18n` (0 errores); auditoría y e2e en la puerta.
- Skills: no aplica: un orden más en un selector que ya existe, con un campo de una consulta que ya se hacía; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (el mismo camino que el orden por PRs abiertos, con el total que ya da la API).
- OMC: plan=— · revisión=3 hallazgos LOW (1 arreglado: el smoke vuelve los totales a 0 en un `finally`; los otros 2, el tope de 50 PRs sin token y el total sin refrescar, documentados en Límites conocidos) · verificación=PASS
- Puerta: cuatro corridas; la 1.ª y la 2.ª fallaron por el paso nuevo del smoke (las 20 pestañas del paso anterior; después, los repos que sumaba a las pestañas guardadas: pasó a una página aparte); la 2.ª además en «vista de texto…» (pendiente 2) y la 3.ª solo en «editar el código…», ajeno (pendiente 3, nuevo); la 4.ª en verde.
- Hoja de ruta: repuesta a 15 con el ítem 168 (Constelación: ordenar por estrellas, otra parte del ítem 26).
- Reclamo: loop/225, sin colisión
- Validado: 598 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 226, expansión: ítem 162 (Práctica: commit de solo lo preparado, Público)

### 2026-11-06 · Iteración 226 · Expansión · Público

- **Capacidad nueva: `commit` de solo lo preparado en la práctica de git** (ítem 162 de la hoja de ruta, parte del ítem 16). `commit` se lleva lo preparado con `add` y deja lo cambiado sin preparar fuera; con cambios sin preparar y nada preparado se niega como git («no changes added to commit (use "git add" and/or "git commit -a")»); `-a`, `--all` y `-am` se llevan todo lo cambiado, nunca lo sin seguir; `--amend`, el commit que cierra una fusión a medias y `cherry-pick`/`revert --continue` siguen la misma regla. Cada commit anota sus archivos (`files`) y la salida dice « N file(s) changed». Con el árbol limpio el commit sigue pudiendo ir vacío (los ejercicios lo usan). Ejercicio 11 «Commit de solo lo preparado» (`?practice=11`): de `login.js` y `debug.js` cambiados, un commit con solo `login.js` preparado con `add`; título y meta en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs` («commit guarda solo lo preparado; con -a, todo lo cambiado…», «el ejercicio de commit parcial no se resuelve con commit -a ni sin add», «cada ejercicio parte sin resolver…» y «los números de la URL…» con `?practice=11`) → fallan sin el cambio (el commit sin `add` pasa y se lleva todo; no hay ejercicio 11). Tres asserts viejos que daban por hecho que `commit` se llevaba todo pasan a la semántica nueva (`--amend -a`, `commit -am`), sin aflojar lo que miran.
- README: Aprender git (el `commit` nuevo, once ejercicios, `?practice=1` a `11`, pruebas) y Límites conocidos (commit vacío con el árbol limpio, `reset --soft` no vuelve a preparar, banderas pegadas que no se admiten, enlaces de ejercicios propios viejos que hacían `touch` y `commit` sin `add`).
- QA: terminal y ejercicio cubiertos por `node --test`; 40 idiomas con `check-i18n` (0 errores); smoke (los pasos de práctica siguen en verde), auditoría y e2e en la puerta.
- Skills: no aplica: una regla más en un intérprete que ya existe, con lo ya cargado; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (el commit toma la lista de preparados que ya existe).
- OMC: plan=— · revisión=6 hallazgos, 1 MEDIUM y 5 LOW (4 arreglados: `--continue` perdía lo no preparado, el ejercicio se resolvía sin `add`, `-m "-am"`, la razón de la negativa primero; 2 documentados en Límites conocidos: `reset --soft` y las banderas pegadas) · verificación=PASS (criterios del ítem contra la puerta y las pruebas)
- Hoja de ruta: repuesta a 15 con el ítem 169 (Práctica: `add -u`, otra parte del ítem 16).
- Reclamo: loop/226, sin colisión
- Validado: 600 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 227, mantenimiento · QA: pendiente 11 (A 320 px el panel de salud se desborda hacia la derecha (28 px; 46 en tamil): l…)

### 2026-11-06 · Iteración 227 · Mantenimiento · QA

- **Arreglo: el panel de salud ya no se desborda a 320 px** (pendiente 11). `.tr-wrap` (el contenedor del diálogo), `.hl-body` y `.hl-list` eran cuadrículas de una columna automática, que toma el ancho mínimo de su contenido (272 px de las filas, 290 en tamil) aunque el diálogo ofrezca 244: el panel se deslizaba de lado y cortaba la cabecera, los contadores y la edad de los forks. Las tres pasan a `grid-template-columns: minmax(0, 1fr)`, como ya hace `#agents-body`; las filas ya cortaban su texto con puntos suspensivos (`.hl-main`).
- **Reproducción:** Playwright, 320×640, `?lang=es&health=1` → `#health .tr-wrap` con `scrollWidth` 312 y `clientWidth` 284 (en tamil, 330); con el arreglo, 284 y 284 en español, tamil y árabe.
- **Pruebas que fallan sin el arreglo:** el paso nuevo del smoke «a 320 px el panel de salud no se desborda hacia el lado (en español y en tamil)» y `node --test tools/health.test.mjs` («el panel de salud tiene una columna que puede encogerse…»).
- **Hallazgos:** ninguno nuevo; la iteración cerró el pendiente 11 sin auditoría completa (el pendiente trae su reproducción).
- README: sin cambios (un arreglo de CSS sin función nueva ni límite nuevo).
- QA: panel de salud a 320 px en es, ta y ar con Playwright; el resto lo cubre la puerta; auditoría en la puerta.
- Skills: no aplica: un arreglo de CSS de una regla; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la columna `minmax(0, 1fr)` que el repo ya usa en `#agents-body`).
- OMC: plan=— · revisión=3 hallazgos LOW (0 arreglados: la regla repetida de `#agents-body`, la prueba que busca el texto del CSS y el viewport del smoke sin `finally`; quedan como están, sin efecto) · verificación=—
- Reclamo: loop/227, sin colisión
- Validado: 601 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 228, expansión: ítem 168 (Constelación: ordenar por estrellas, Escala)

### 2026-11-06 · Iteración 228 · Expansión · Escala

- **Capacidad nueva: la constelación ordenada por estrellas** (ítem 168 de la hoja de ruta, parte del ítem 26). El selector de orden suma «Estrellas» (más estrellas primero; empata por el orden de las pestañas) y `?order=stars` abre la constelación ya ordenada así. El total sale de la consulta del repo que cada fuente ya hacía al abrirlo, sin consultas nuevas: `stargazers_count` en GitHub, `star_count` en GitLab y `stars_count` en Forgejo/Gitea/Codeberg, guardado como `repo.stars`; `GB.constellation.starsOf` lo lee (nunca negativo, `null` sin dato). Bitbucket, Azure DevOps, los repos locales y la demo no lo dan: cuentan como 0. Clave nueva `constellation.orderStars` en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/constellation.test.mjs` («el orden…»: `sortItems(…, 'stars')` deja el orden de las pestañas y `orderParam('STARS')` da `null`; «estrellas con lo ya cargado…» → `TypeError`: `starsOf` no existe), `tools/github.test.mjs`, `tools/gitlab.test.mjs` y `tools/codeberg.test.mjs` (el total sale de la consulta del repo: 5 pruebas en rojo sin el cambio) y el paso del smoke de la constelación por estrellas (tres repos simulados con 50, 0 y 7 estrellas: `o/a o/c o/b`, y el anuncio «Ordenadas por Estrellas»).
- README: Constelación (el orden nuevo y `?order=stars`) y Límites conocidos (el total no se refresca con el repo abierto; las fuentes sin el dato cuentan como 0).
- QA: constelación con el selector y el anuncio en la región viva por el smoke; 40 idiomas con `check-i18n` (0 errores); auditoría y e2e en la puerta.
- Skills: no aplica: un orden más en un selector que ya existe, con un campo de una consulta que ya se hacía; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (el mismo camino que el orden por issues abiertos, con el total que ya da la API).
- Hoja de ruta: repuesta a 15 con el ítem 170 (Constelación: ordenar por forks, otra parte del ítem 26).
- OMC: plan=— · revisión=2 hallazgos LOW (1 arreglado: el comentario de `starsOf` nombra todas las fuentes sin el dato; el otro, el número del PR provisional, se confirma al abrirlo) · verificación=PASS
- Reclamo: loop/228, sin colisión
- Validado: 602 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 229, expansión: ítem 169 (Práctica: add -u, Público)

### 2026-11-06 · Iteración 229 · Expansión · Público

- **Capacidad nueva: `add -u` en la práctica de git** (ítem 169 de la hoja de ruta, parte del ítem 16). `add -u` (o `--update`) prepara solo lo cambiado que git ya sigue y deja fuera los archivos sin seguir de `touch --new`, que `add .` sí prepara. Sin rutas o con `.` toma todo el árbol; con rutas, solo las cambiadas que git sigue: un archivo sin seguir nombrado se queda fuera sin error (como git) y una ruta que no existe da `fatal: pathspec`. Sin nada cambiado no prepara nada ni falla. La ayuda de la terminal suma la línea de `add -u` (en inglés, como la salida de git; sin claves nuevas de interfaz).
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs` («add -u prepara solo lo cambiado que git sigue; add . también lo sin seguir») → sin el cambio `add -u` responde «Nothing specified, nothing added.» y no prepara `a.txt`.
- README: Aprender git (`add -u`/`--update` en la lista de comandos y en Pruebas) y Límites conocidos (`add` admite `-u`, no `-A`; un archivo sin seguir con `-u` queda fuera sin aviso).
- QA: terminal de práctica cubierta por `node --test` (con `status`, `commit` y `help` después de `add -u`); los pasos de práctica del smoke siguen en verde; auditoría y e2e en la puerta.
- Skills: no aplica: una bandera más en un intérprete que ya existe; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (pasar a lo preparado la lista de cambiados que ya existe, sin los sin seguir).
- OMC: plan=— · revisión=4 hallazgos LOW (0 arreglados: una condición redundante en la validación de rutas, `-uv` pegado que no se admite —como las demás banderas pegadas, ya en Límites conocidos—, y dos que ya tenía `add`: rutas de directorio y archivos sin cambios nombrados) · verificación=PASS
- Hoja de ruta: repuesta a 15 con el ítem 171 (Práctica: `add -A`, otra parte del ítem 16).
- Reclamo: loop/229, sin colisión
- Validado: 603 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 230, expansión: ítem 170 (Constelación: ordenar por forks, Escala)

### 2026-11-06 · Iteración 230 · Expansión · Escala

- **Capacidad nueva: la constelación se ordena por forks** (ítem 170 de la hoja de ruta, parte del ítem 26). El selector de orden suma «Forks» (entre estrellas y ramas nuevas) y `?order=forks` abre la constelación así; reordena también el recorrido con Tab y se anuncia a los lectores de pantalla. El total sale de la consulta del repo que ya se hace al abrirlo (`forks_count` en GitHub, GitLab, Gitea, Forgejo y Codeberg), sin consultas nuevas; Bitbucket, Azure DevOps, los repos locales y la demo no lo dan y cuentan como 0. La etiqueta nueva (`constellation.orderForks`) va en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/constellation.test.mjs tools/github.test.mjs tools/gitlab.test.mjs tools/codeberg.test.mjs` → sin el cambio fallan 5 (el orden `forks`, `forksOf` y el total de forks de las tres fuentes); el smoke ordena tres repos simulados por forks (`o/b o/a o/c`, distinto del orden por estrellas) con el anuncio en español y abre `?order=forks` con el selector de acuerdo.
- README: Constelación (forks en el selector y `?order=forks`) y Límites conocidos (el total de forks, como el de estrellas, no se refresca con el repo abierto y falta en Bitbucket, Azure, locales y demo).
- QA: constelación con el selector y `?order=` cubierta por el smoke (orden, anuncio sin claves crudas, selector al abrir); auditoría y e2e en la puerta.
- Skills: no aplica: un orden más en un selector que ya existe, con el mismo patrón que el de estrellas; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (el total de la consulta del repo que ya se hace, como las estrellas).
- OMC: plan=— · revisión=5 hallazgos LOW (3 arreglados: la etiqueta en zh-Hant, el apóstrofo en turco y el paréntesis de más en hebreo y árabe, más una nota en el JSDoc de `forksOf`; quedan sin cambio el aviso de que GitHub cuenta solo los forks directos y otra palabra en zh-Hant) · verificación=PASS
- Hoja de ruta: repuesta a 15 con el ítem 172 (Constelación: ordenar por último commit, otra parte del ítem 26).
- Reclamo: loop/230, sin colisión
- Validado: 604 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 231, mantenimiento · Rendimiento: pendiente 12 (`placeLabels` (`js/graph3d.js`) crea por cuadro un `{x, y}` por `project()`, un…)

### 2026-11-06 · Iteración 231 · Mantenimiento · Rendimiento

- **Arreglo: `placeLabels` del 3D ya no deja basura por cuadro** (pendiente 12). `project()` devuelve un punto compartido (`projOut`) en vez de un `{x, y}` nuevo por llamada (sus nueve llamadores en `js/graph3d.js` y `js/galaxy.js` copian x e y en el acto; el JSDoc lo dice); las candidatas de las etiquetas de rama salen de un pool que se reusa (y suelta las ramas que ya no están); la grilla de choques pasa a métodos (`gridReset`, `gridRect`, `gridHits`, `gridAdd`) con su `Map` y sus celdas vivas entre cuadros, sin los cierres por cuadro, y los rectángulos de fechas y de notas (`placeNotes`) salen de otro pool. Mismas condiciones de choque, márgenes y orden.
- **Reproducción:** Playwright, `?repo=acme/web` con 1.000 ramas en 3D, `placeLabels` llamado 2.000 veces seguidas sobre la misma instancia (la mejor de 5) → 0,0170 y 0,0142 ms por llamada sin el arreglo; 0,0145 y 0,0138 con él (mediana 0,0187 → 0,0161). La envoltura por cuadro del pendiente ya no lo distingue: 0,2 ms en las dos versiones, en el límite del reloj.
- **Pruebas que fallan sin el arreglo:** `node --test tools/rendimiento.test.mjs` («placeLabels no deja basura por cuadro…») → falla sin el cambio (`project() no crea un objeto por llamada`).
- README: no cambia (sin función nueva ni límite nuevo).
- QA: 3D con 1.000 ramas antes y después (mismas 33 etiquetas a la vista, sin errores de consola); `--comparar` contra la base: carga 1581 → 1520 ms (−4 %), tareas largas 963 → 824 ms (−14 %), 3D 11,7 → 12,2 fps, 2D 52,7 → 52,6 fps, 10 consultas, ninguna medida peor; auditoría completa 0 hallazgos antes y después.
- Skills: no aplica: reusar objetos en un camino caliente propio; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la que el pendiente describe: el punto compartido y pools).
- OMC: plan=— · revisión=5 hallazgos, 1 MEDIUM y 4 LOW (2 arreglados: la prueba prometía más de lo que mira sobre quién retiene el punto, y el corte del fuente dependía del orden de los métodos; quedan sin cambio, por despreciables, las celdas vacías tras achicar la ventana, el pool que retiene las ramas del último cuadro hasta el siguiente, y `near` de `placeNotes`, que sigue creando un `{ it, d2 }` por commit cercano) · verificación=PASS
- Reclamo: loop/231, sin colisión
- Validado: 605 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 232, expansión: ítem 171 (Práctica: add -A, Público)

### 2026-11-06 · Iteración 232 · Expansión · Público

- **Capacidad nueva: `add -A` en la práctica de git** (ítem 171 de la hoja de ruta, parte del ítem 16). `add -A` (o `--all`) prepara todo, lo cambiado y los archivos sin seguir de `touch --new`, como `add .` y a diferencia de `add -u`: sin rutas toma todo el árbol y con rutas solo esas (una que no existe da `fatal: pathspec`). Junto a `-u`, también pegadas (`-Au`, `-uA`), se niega con el mensaje de git (`options '-A' and '-u' cannot be used together`). De paso, `add .`, `add -A` y `add <archivo>` vuelven a preparar un archivo preparado y cambiado otra vez (antes el cambio nuevo quedaba sin preparar; `add -u` ya lo hacía). La ayuda de la terminal suma la línea de `add -A` (en inglés, como la salida de git; sin claves nuevas de interfaz).
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs` («add -A prepara todo: lo cambiado y lo sin seguir, como add . y a diferencia de add -u») → sin el cambio `add -A` responde «Nothing specified, nothing added.» y no prepara ni `a.txt` ni `n.txt`.
- README: Aprender git (`add -A`/`--all` en la lista de comandos y en Pruebas) y Límites conocidos (`add` admite `-u` y `-A`; `add -A` no prepara borrados porque el árbol no los tiene).
- QA: terminal de práctica en la página real con Playwright contra `node e2e/serve.mjs` (390 px, tema oscuro y claro): `add -A -u` se niega, `add -A` deja `a.txt` modificado y `n.txt` nuevo en lo preparado, `help` lista `add -A`, consola sin errores; los pasos de práctica del smoke siguen en verde; auditoría y e2e en la puerta.
- Skills: no aplica: una bandera más en un intérprete que ya existe; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (`-A` sin rutas es `add .`, que ya existe).
- OMC: plan=— · revisión=3 hallazgos, 1 MEDIUM y 2 LOW (2 arreglados: el archivo preparado y cambiado otra vez que `add .` no volvía a preparar, y `-Au` pegadas que se ignoraban; el tercero, `add -n` que prepara de verdad, va a Mantenimiento como pendiente 15) · verificación=PASS
- Hoja de ruta: repuesta a 15 con el ítem 173 (Práctica: `rm` y `mv`, otra parte del ítem 16).
- Reclamo: loop/232, sin colisión
- Validado: 606 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 28 e2e en verde.
- **Siguiente:** iteración 233, expansión: ítem 172 (Constelación: ordenar por último commit, Escala)

### 2026-11-06 · Iteración 233 · Expansión · Escala

- **Capacidad nueva: la constelación se ordena por último commit** (ítem 172 de la hoja de ruta, parte del ítem 26). El selector de orden suma «Último commit» (tras «Actividad») y `?order=recent` abre la constelación así: el repo con el commit más reciente ya cargado primero; los que cargan o están vacíos, sin fecha, al final en el orden de las pestañas. Reordena también el recorrido con Tab y se anuncia a los lectores de pantalla. La fecha es la que ya calculaba `lastCommitAt` para `?recent=` (la del committer), sin consultas nuevas. La etiqueta nueva (`constellation.orderRecent`) va en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/constellation.test.mjs` → sin el cambio falla «el orden: pestañas tal cual…» (`recent` deja el orden de las pestañas y `?order=RECENT` da `null`); el smoke abre `?order=recent` con tres repos simulados en una página aparte (`rec/uno rec/tres rec/dos`, distinto del de las pestañas y del de nombre), con el selector de acuerdo y el anuncio en español.
- README: Constelación (último commit en el selector y `?order=recent`) y Límites conocidos (la fecha es la del committer del commit más reciente ya cargado, no la del push).
- QA: constelación con el selector y `?order=` cubierta por el smoke (orden, empate y sin fecha al final en la prueba unitaria; anuncio sin claves crudas; selector al abrir); auditoría y e2e en la puerta.
- Skills: no aplica: un orden más en un selector que ya existe, con el mismo patrón que el de forks; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la fecha que `?recent=` ya calcula para cada repo).
- OMC: plan=— · revisión=3 hallazgos LOW (1 arreglado: el commit del smoke ya no lleva una fecha futura; quedan sin cambio la nota de que la bitácora no estaba aún —se escribe en este paso— y «最近提交» en chino, aceptable) · verificación=PASS
- Hoja de ruta: repuesta a 15 con el ítem 174 (Constelación: cuánto hace el último commit, otra parte del ítem 26).
- Reclamo: loop/233, sin colisión
- Validado: 622 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 234, expansión: ítem 153 (Estado de los despliegues, primera entrega, Datos)

### 2026-11-06 · Iteración 234 · Expansión · Datos

- **Capacidad nueva: el estado del último despliegue de cada entorno en el panel de salud** (ítem 153 de la hoja de ruta, primera entrega). La sección «Despliegues por entorno» (GitHub y la demo) lista el último despliegue de cada entorno, el más reciente primero, con su commit, si está **al día** con la punta de su rama (la de su `ref` o, si no es una rama cargada, la por defecto), cuántos **commits nuevos** tiene la rama que el despliegue no (como `git rev-list desplegado..rama`, con la historia cargada) o «no está en su rama cargada», y hace cuánto se creó (`created_at`, que ya traía `/deployments`; en la demo, la fecha del commit). Cada fila con rama lleva a ella en el grafo. Sin consultas nuevas; las fuentes sin despliegues no muestran la sección. Si salió bien o falló (`/statuses`, una consulta por entorno) queda como segunda entrega (ítem 175). Cuatro claves nuevas (`health.deploys`, `health.deployCurrent`, `health.deployBehind`, `health.deployUnknown`) en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/health.test.mjs` («despliegues por entorno: al día con su rama, commits nuevos detrás o sin su rama…») → sin el cambio, `TypeError` (`compute` no devuelve `deploys`); el smoke abre la salud de la demo y exige producción y staging, staging «al día con develop» y con su botón a la rama, sin claves crudas.
- README: Salud del repo (los despliegues por entorno), Pruebas (tags y despliegues), Límites conocidos (sin el estado de éxito o fallo; commits que faltan con la historia cargada) y Seguridad (la misma carga, ninguna consulta más).
- QA: panel de salud de la demo en la página real con Playwright contra `node e2e/serve.mjs 4173`, en español, árabe y tamil, a 1280, 390 y 320 px, tema claro y oscuro: sin desborde (a 320 px la primera puerta lo encontró —el texto lateral no se partía— y se arregló con `#hl-deploys .hl-aside`), Enter en la fila de staging cierra el panel y lleva a develop, consola limpia; auditoría 0 hallazgos nuevos y e2e en la puerta.
- Skills: no aplica: una sección más del panel de salud con datos que ya se cargan; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (los ancestros cargados de la punta de la rama frente a los del commit desplegado).
- OMC: plan=— · revisión=7 hallazgos, 1 HIGH, 2 MEDIUM y 4 LOW (5 arreglados: el HIGH —un ancestro común bastaba para decir «detrás» de una rama que no contiene el commit—, la fila sin rama que llevaba a la por defecto, el `ref` de tag o sha que se comparaba con la por defecto sin contener el commit, la sección vacía en repos sin despliegues y un `sha` que no es texto; quedan el clic en una rama filtrada, el mismo patrón que las otras listas, y el costo de recorrer la historia por entorno al abrir el panel, aceptable) · verificación=PASS
- Hoja de ruta: 15 ítems con el 175 (Estado de los despliegues, segunda entrega).
- Reclamo: loop/234, sin colisión
- Validado: 623 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 235, mantenimiento · Deuda: pendiente 1 (La e2e de escritorio «--bitbucket-url suma solo ese host a las conexiones del C…)

### 2026-11-09 · Iteración 235 · Mantenimiento · Deuda

- **Arreglo: la e2e de escritorio de `--bitbucket-url` ya no compite con el arranque de la app** (pendiente 1). Guardaba los tokens de Bitbucket Data Center y de Azure DevOps con `GBDesktop.setToken` mientras la página arrancaba y miraba Ajustes en la misma ventana; `loadDesktopToken` (`js/app.js`) lee el llavero una sola vez al arrancar, así que si ya había leído `azure` el campo quedaba vacío. Ahora los guarda con la app ya cargada, la cierra, la reabre con el mismo perfil (como «el token de GitLab… vuelve al reabrir») y recién entonces mira Ajustes; de paso exige también que vuelva el token del servidor (`#bbdc-token-input`), que tenía la misma carrera y no se miraba. La app no cambia: el fallo era de la prueba.
- **Reproducción:** la prueba con `await loaded(page)` antes de guardar los tokens (el orden que perdía con el equipo cargado), `xvfb-run -a npx playwright test e2e/desktop.spec.mjs -g "bitbucket-url"` → `expect(locator('#azure-token-input')).toHaveValue('az-e2e')` · `Received: ""`, a demanda.
- **Pruebas que fallan sin el arreglo:** la misma e2e, que ahora fija ese orden: sin reabrir la app falla siempre, no solo cuando el arranque ganaba la carrera. Medida: antes, 0 fallas en 20 corridas sueltas (`--repeat-each=20`, carga 6 en 4 CPU) y 2 en las 4 puertas de las reanudaciones de la 173 y la 234 (carga 16 a 18); después, 20 de 20 en verde sueltas y las 29 e2e en la puerta. Ninguna otra e2e guarda un token con `GBDesktop.setToken` (`grep`).
- README: no cambia (ni la función ni sus límites cambian).
- QA: no toca la página; la e2e de `--bitbucket-url` 20 veces seguidas y las 29 e2e en la puerta; auditoría: no toca la página.
- Skills: no aplica: una carrera de una prueba propia, arreglada con el patrón que el mismo archivo ya usa (reabrir con el mismo perfil).
- Arena: no aplica: una sola forma obvia (la que describe el pendiente), y la sesión no tiene la herramienta de subagentes.
- OMC: no disponible (la sesión no tiene la herramienta de subagentes)
- Reclamo: loop/235, sin colisión
- Validado: 632 pruebas (`node --test`), smoke, i18n (0 errores) y 29 e2e en verde (la primera corrida falló en un paso ajeno del smoke, «editar el código…»: intermitente, la repetición pasó; anotado en el pendiente 1 de Mantenimiento).
- **Siguiente:** iteración 236, expansión: ítem 174 (Constelación: cuánto hace el último commit, Escala)

### 2026-11-09 · Iteración 236 · Expansión · Escala

- **Capacidad nueva: cada galaxia de la constelación dice cuánto hace de su último commit** (ítem 174 de la hoja de ruta, parte del ítem 26). Junto a sus commits y ramas, en el globo de la galaxia y en el nombre que lee el lector de pantalla, va cuánto hace de su commit más reciente ya cargado, con el formato relativo de la app (`U.timeAgo`: «hace 3 h», «2 日前», «قبل يومين»; pasado un mes, la fecha) en el idioma activo; nada si aún carga o está vacía. `GB.constellation.describe` arma los dos textos. La fecha es la que ya ordena `?order=recent` (`lastCommitAt`, la del committer): sin consultas nuevas ni claves nuevas (el formato lo da `Intl.RelativeTimeFormat` en los 40 idiomas).
- **Pruebas que fallan sin la capacidad:** `node --test tools/constellation.test.mjs` («cada galaxia dice, junto a sus commits y ramas, cuánto hace…») → sin el cambio, `TypeError` (`describe` no existe); el smoke exige «ahora» o «hace N s|min» en el nombre accesible y en el globo de las tres galaxias de `?order=recent`, y que ninguna de las 20 galaxias de repos sin commits (404) diga nada de tiempo.
- README: Constelación (la lista de funciones) y Límites conocidos (la fecha es la del committer y se calcula al abrir la constelación, sin correr mientras sigue abierta).
- QA: la constelación de la demo en la página real con Playwright contra `node e2e/serve.mjs 4173`, solo con teclado (Enter la abre, el foco entra a la galaxia, Esc la cierra), en español a 1280 px y tema oscuro, árabe a 390 px y claro, tamil a 320 px y oscuro y japonés a 1280 px y claro: «hace 2 d», «قبل يومين», «2 நாட்களுக்கு முன்» y «2 日前» en el nombre y en el globo, sin desborde y con la consola limpia; auditoría 0 hallazgos nuevos y e2e en la puerta.
- Skills: no aplica: un texto más en la constelación con el formato relativo que la app ya usa; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la fecha que ya calcula `lastCommitAt` con el `timeAgo` de siempre), y la sesión no tiene la herramienta de subagentes.
- OMC: no disponible (la sesión no tiene la herramienta de subagentes)
- Hoja de ruta: repuesta a 15 con el ítem 176 (Constelación: las galaxias quietas, tenues, otra parte del ítem 26); Replica: paridad, sin pasada nueva (92,7/100, must hechos 13 de 13).
- Reclamo: loop/236, sin colisión
- Web publicada: sin publicar (404, has_pages=false; está en Para Benjamin)
- Validado: 633 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde (la primera corrida falló en un paso ajeno del smoke, «abre la vista de texto con el filtro por ruta…», por `net::ERR_INSUFFICIENT_RESOURCES` con el equipo a carga 18: intermitente, la repetición pasó; pendiente 3 de Mantenimiento).
- **Siguiente:** iteración 237, expansión: ítem 154 (Resumen de la semana de la organización: issues cerrados, Salidas)

### 2026-11-09 · Iteración 237 · Expansión · Salidas

- **Capacidad nueva: el resumen de la semana de la organización suma los issues cerrados** (ítem 154 de la hoja de ruta, parte del ítem 47). `computeOrg` (`js/digest.js`) suma los issues cerrados de cada repo seguido (cada número una vez, con lo ya cargado, sin consultas); el Markdown y la imagen llevan el total y, por repo, sus números (hasta 10 y «… +n»); un repo cuyo único movimiento es un issue cerrado sale en el resumen. Sin issues cerrados, ni la línea del total ni la del repo. Usa la etiqueta `digest.closed` que ya está en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/digest.test.mjs` («organización: suma los issues cerrados en la semana…») → sin el cambio, falla (`o.closed` es `undefined`).
- README: la lista de funciones (Salud del repo), Límites conocidos (se quita «los issues cerrados no entran al resumen de la organización» y se dice cómo cuentan) y el Mapa de alcance.
- QA: filas del resumen de la semana: lo cubre la prueba con dos repos fabricados (duplicados, fuera de la semana, repo sin commits, sin issues cerrados, más de 10); no toca el DOM ni textos nuevos; auditoría: no cambia la página más que el texto del resumen.
- Skills: no aplica: un total más en un resumen que ya existe, con el mismo patrón que «abiertos»; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (copiar el patrón de los PRs abiertos), y la sesión no usa subagentes en una entrega de esfuerzo 1.
- OMC: plan=— · revisión=— · verificación=—
- Reclamo: loop/237, sin colisión
- Web publicada: sin publicar (404, has_pages=false; está en Para Benjamin)
- Validado: 634 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 238, expansión: ítem 176 (Constelación: las galaxias quietas, tenues, Escala)

### 2026-11-09 · Iteración 238 · Expansión · Escala

- **Capacidad nueva: las galaxias quietas de la constelación se dibujan tenues y lo dicen** (ítem 176 de la hoja de ruta, parte del ítem 26). `isQuiet` (`js/constellation.js`): si el commit más reciente ya cargado de un repo (`last`) tiene más de 30 días, su galaxia lleva `data-quiet`, se dibuja a 0,4 de opacidad y su nombre accesible y su globo suman «sin actividad hace más de 30 días» (la clave `textview.quiet` que ya existe en los 40 idiomas: sin texto nuevo). Sin `last` (carga, vacía, con error) no se marca. Sin consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/constellation.test.mjs` («una galaxia quieta…») → sin el cambio, `C.isQuiet is not a function`; y un paso del smoke con un repo de 45 días y otro reciente.
- README: la lista de funciones (Constelación) y Límites conocidos; el Mapa de alcance.
- QA: constelación en el smoke (repo quieto contra reciente, nombre accesible y globo); la opacidad es la misma que la de las galaxias que cargan; auditoría: 0 hallazgos nuevos.
- Skills: no aplica: un matiz más en la constelación con un texto y un umbral que el repo ya tiene.
- Arena: no aplica: una sola forma obvia (el umbral de `textview.js` aplicado a `last`).
- OMC: plan=— · revisión=3 hallazgos (1 arreglado: una galaxia que aún carga no se marca quieta; 2 LOW sin tocar) · verificación=—
- Reclamo: loop/238, sin colisión
- Web publicada: sin publicar (404, has_pages=false; está en Para Benjamin)
- Validado: 635 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde (la primera corrida falló en un paso ajeno del smoke, «editar el código»; la repetición pasó).
- **Siguiente:** iteración 239, mantenimiento · Seguridad: auditoría (sin pendientes de Seguridad)

### 2026-11-09 · Iteración 239 · Mantenimiento · Seguridad

- **Auditoría de Seguridad: avisos a Discord con Markdown de un texto ajeno** (pendiente: auditoría). Se revisó el CSP de `index.html` (cerrado, sin `eval` ni scripts en línea), los `innerHTML` (los de datos de afuera pasan por `U.esc`; avatares con `data-fb` escapado), los tokens y el preload, la navegación, las descargas y los permisos de `electron/main.js`, los argumentos de `git` (SHA validados, `execFile` sin shell, `--no-ext-diff --no-textconv`) y `electron/webhooks.js`. Lo peor: `payload('discord', …)` no escapaba el Markdown, así que un título o detalle de PR con `[login](https://evil.example)` llegaba al canal como enlace enmascarado (Slack y Teams ya lo evitaban). Arreglo: `discordText` escapa el Markdown de repo, tipo, título y detalle.
- **Reproducción:** `node --test tools/webhooks.test.mjs` → sin el arreglo, `not ok 3 - Discord: un título de GitHub no arma un enlace enmascarado ni formato`.
- **Hallazgos:** 3 nuevos (pendientes 16, 17 y 18), 0 a la base de la auditoría
- **Pruebas que fallan sin el arreglo:** `tools/webhooks.test.mjs` («Discord: un título de GitHub no arma un enlace enmascarado ni formato»).
- README: sin cambios (el aviso sigue igual; el texto llega escapado).
- QA: no toca la página ni textos; auditoría: no toca la página.
- Skills: no aplica: un escape de Markdown con el patrón de `slackText` y `teamsText`; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (escapar como Teams).
- OMC: no disponible (la iteración no lanzó subagentes de revisión; el diff es un escape de 3 líneas leído a mano contra `teamsText`)
- Reclamo: loop/239, sin colisión
- Validado: 636 pruebas (`node --test`), smoke, i18n (0 errores) y 29 e2e en verde.
- **Siguiente:** iteración 240, expansión: ítem 155 (Extensión de Chrome y Firefox: GitLab, Codeberg y Bitbucket, Plataformas)

### 2026-11-09 · Iteración 240 · Expansión · Plataformas

- **Capacidad nueva: la extensión de Chrome y Firefox también en GitLab, Codeberg y Bitbucket** (ítem 155 de la hoja de ruta, parte del 149). El botón «Abrir en GraphBranch» aparece en las páginas de un proyecto de gitlab.com (con sus subgrupos, cortando en `/-/`), codeberg.org y bitbucket.org, con `?repo=https://…`; las páginas que no son un repo (perfiles, `explore`, `account`, `dashboard`…), `http`, puertos, credenciales, `www.` y dominios parecidos no lo llevan. El manifiesto suma solo los cuatro hosts a `content_scripts.matches`, sin permisos ni `host_permissions`.
- **Pruebas que fallan sin la capacidad:** `tools/browser-extension.test.mjs` («targetFromUrl…», «lo que arma la extensión lo entiende la web», y el manifiesto con los cuatro hosts).
- README: la función en la lista, su sección, Límites conocidos y Seguridad.
- QA: la extensión no toca la página ni textos de la web (el botón va en español, como antes); `parseRepo` de la web reconoce lo que arma (prueba); auditoría: no toca la página.
- Skills: no aplica: URL de tres plataformas con el patrón de `repoFromUrl`; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (una función de URL a destino más el manifiesto).
- OMC: no disponible (la iteración no lanzó subagentes; el diff es una función pura y una lista de hosts, leído a mano contra la CSP y los permisos mínimos)
- Reclamo: loop/240, sin colisión
- Web publicada: sin publicar (404, has_pages=false; está en Para Benjamin)
- Validado: 638 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio). La primera corrida falló en un paso ajeno del smoke («la ficha de un commit de agente dice cuál es… (2D)»: intermitente, no lo toca el diff); la segunda pasó.
- **Siguiente:** iteración 241, expansión: ítem 157 (Launchpad: fijar un PR arriba, Escala)

### 2026-11-09 · Iteración 241 · Expansión · Escala

- **Capacidad nueva: fijar un PR arriba en el Launchpad** (ítem 157 de la hoja de ruta, parte de «Launchpad: fijar y posponer PRs e issues»). Cada fila lleva un 📌 (`aria-pressed`, con nombre «Fijar el PR #N de repo arriba» / «Soltar…») que sube el PR al principio de su grupo y lo suelta con el mismo botón; el foco vuelve al botón tras repintar. Lo fijado se guarda en este navegador como `repo#número` (`prpins`, sin títulos); un fijado que ya no existe no hace nada. Sin consultas nuevas.
- **Pruebas que fallan sin la capacidad:** `tools/overview.test.mjs` («groupPulls: los PRs fijados van arriba…») un montaje con `pulls` como iterador de un solo uso (el smoke lo encontró: la app pasa `Map.values()` y repintar al fijar vaciaba el Launchpad) y un paso del smoke (fijar y soltar el PR #7: `aria-pressed`, `prpins`, foco).
- README: la función en el Launchpad de la lista, Límites conocidos y Seguridad.
- QA: filas de la vista conjunta y del Launchpad; textos en 40 idiomas (`check-i18n`); auditoría: 0 hallazgos nuevos.
- Skills: no aplica: un botón y un orden sobre el Launchpad existente; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (un Set de `repo#número` en `U.store`).
- OMC: no disponible (la iteración no lanzó subagentes; el diff es chico y se leyó a mano contra la CSP y el escape: nada nuevo entra por `innerHTML`)
- Reclamo: loop/241, sin colisión
- Validado: 640 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. La primera corrida del smoke falló en mi paso nuevo (el iterador, arreglado) y en «editar sin token» (ajeno, intermitente: pasó en la segunda).
- **Siguiente:** iteración 242, expansión: ítem 159 (CI de GitLab en el resto de las ramas, Datos)

### 2026-11-09 · Iteración 242 · Expansión · Datos

- **Capacidad nueva: la marca del último pipeline de GitLab en el resto de las ramas** (ítem 159 de la hoja de ruta, parte del ítem 152). `syncCiGitlab` (`js/sources/gitlab.js`) pregunta, además de la rama por defecto, las fijadas y las de una MR abierta (tope `CI_MAX` = 6), por las 20 ramas más recientes del listado que no son esas, con tope propio de 2 consultas por ciclo (`CI_REST`); una cabeza ya resuelta no se vuelve a preguntar y las mismas guardas (privado sin token, 403/404 → deja de preguntar) valen para todas.
- **Pruebas que fallan sin la capacidad:** `tools/gitlab.test.mjs` («CI: el resto de las ramas también…» y el conteo de consultas de «CI: el estado del pipeline de la cabeza…», que ahora incluye `feature`).
- README: el párrafo de CI de «Límites conocidos».
- QA: sin cambios en la página ni en textos; la API simulada cuenta las consultas por ciclo; auditoría: no toca la página.
- Skills: no aplica: ampliar un bucle de consultas existente; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (un segundo presupuesto de consultas en el mismo bucle).
- OMC: no disponible (la iteración no lanzó subagentes; el diff es de unas líneas y se leyó a mano)
- Reclamo: loop/242, sin colisión
- Validado: 641 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 243, mantenimiento · Deuda: pendiente 1 (El paso del smoke «editar el código: desde los cambios de un commit se abre su …)

### 2026-11-09 · Iteración 243 · Mantenimiento · Deuda

- **Arreglo: dos esperas por tiempo del smoke ahora esperan una señal** (pendiente 1). En «editar el código…» el avance con «Siguiente» esperaba 200 ms fijos; bajo carga el commit siguiente tarda en cargar y un segundo Enter sobre el panel a medio cambiar se pasaba del commit buscado (la hipótesis más probable del `waitForFunction` de 15 s vencido: no se pudo reproducir a voluntad en una sola sesión), así que ahora espera a que cambie `.df-msg` y termine `.loading`. En «avisos en mazo…» (falló en dos puertas seguidas de esta sesión: «detrás 61 px») se medía el aviso de atrás a mitad de su transición de `max-height` de 0,25 s; ahora espera a que se pliegue antes de medir.
- **Reproducción:** `npm run check` → `✗ avisos en mazo: …: el mazo no se pliega: al frente 60 px, detrás 61 px` (2 de 2 sin el arreglo); con él, 1 de 1 en verde, y «editar el código» pasó en las 3 puertas de la sesión.
- **Pruebas que fallan sin el arreglo:** el propio smoke (es el paso intermitente); no hay prueba unitaria posible de una carrera de temporización.
- README: sin cambios (herramienta interna).
- QA: no toca la página ni textos; auditoría: no toca la página.
- Skills: no aplica: ajuste de esperas de un script del repo.
- Arena: no aplica: una sola forma obvia (esperar una señal del DOM).
- OMC: no disponible (la iteración no lanzó subagentes; el diff son dos esperas en `tools/smoke.mjs`, leído a mano)
- Reclamo: loop/243, sin colisión
- Validado: 641 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 244, expansión: ítem 158 (Launchpad: filtrar por persona, Escala)

### 2026-11-09 · Iteración 244 · Expansión · Escala

- **Capacidad nueva: el Launchpad se filtra por persona** (ítem 158 de la hoja de ruta, parte de «Launchpad: vista de equipo filtrada por colaborador»). Con PRs de dos o más personas, un selector sobre los grupos del Launchpad deja solo los PRs de quien los abrió (todos los repos, con lo ya cargado y sin consultas); «Todas las personas» lo quita y, si la persona elegida ya no tiene PRs, vuelve solo a todas. `groupPulls` recibe la persona y `prAuthors` lista las que hay (`js/overview.js`). La hoja de ruta bajó a 9 y se repuso hasta 15 con seis entregas de ítems ya existentes (177 a 182), sin pasada nueva de Replica.
- **Pruebas que fallan sin la capacidad:** `tools/overview.test.mjs` («groupPulls y prAuthors: el Launchpad se filtra por la persona…»).
- README: la lista de la vista conjunta y sus Límites conocidos (el filtro vive mientras la página está abierta).
- QA: el selector hereda el repintado del Launchpad (el foco vuelve al selector); textos `all.prs.person` y `all.prs.everyone` en los 40 idiomas; no se mira a mano en navegador; auditoría: la puerta la corre.
- Skills: no aplica: un selector sobre una vista existente; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (filtrar en `groupPulls` y repintar).
- OMC: no disponible (la iteración no lanzó subagentes; el diff son unas líneas de `js/overview.js`, leído a mano)
- Reclamo: loop/244, sin colisión
- Validado: 642 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde (a la tercera corrida: dos pasos ajenos del smoke fallaron antes, uno por corrida, anotados en Mantenimiento · Deuda).
- **Siguiente:** iteración 245, expansión: ítem 177 (Launchpad: el filtro por persona en la URL, Escala)

### 2026-11-10 · Iteración 245 · Expansión · Escala

- **Capacidad nueva: el filtro por persona del Launchpad viaja en la URL** (ítem 177 de la hoja de ruta, parte del ítem 158). `?by=login` se lee al abrir (`personParam`, `js/overview.js`) y el Launchpad abre ya filtrado; elegir otra persona (o «Todas») lo escribe o lo quita de la dirección. El login se reconoce sin distinguir mayúsculas (si hay dos iguales salvo la capitalización, gana el exacto) y uno desconocido, o de alguien cuyos PRs aún no cargan, no filtra nada y se conserva hasta que lleguen. Sin textos nuevos ni consultas nuevas; `embed=1` lo ignora.
- **Pruebas que fallan sin la capacidad:** `tools/overview.test.mjs` («personParam…» y «mount: el Launchpad abre con la persona de ?by=…»).
- README: la lista de la vista conjunta y sus Límites conocidos.
- QA: lógica cubierta con el `mount` simulado (apertura con persona, login desconocido, aviso al elegir); no se mira a mano en navegador; auditoría: la puerta la corre.
- Skills: no aplica: un parámetro de URL sobre una vista existente; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (leer el parámetro y avisar al elegir).
- OMC: plan=— · revisión=— · verificación=— (diff de unas líneas, leído a mano; sin subagentes)
- Reclamo: loop/245, sin colisión
- Validado: 644 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 246, expansión: ítem 160 (Token para un Forgejo o Gitea propio, Fuentes)

### 2026-11-10 · Iteración 246 · Expansión · Fuentes

- **Capacidad nueva: token para un Forgejo o Gitea propio** (ítem 160 de la hoja de ruta, parte del ítem 36). Con `?forge=` / `--forge-url`, Ajustes muestra un campo aparte («Token de tu Forgejo o Gitea propio») que nombra el host; el token se guarda atado a la dirección del servidor (`CodebergSource.pack`/`unpack`, en el navegador y en el llavero de la app de escritorio, servicio `forgejo`) y va solo a ese host (`Authorization: token …`); si `?forge=` cambia de host no se usa ni se muestra. Con él se ven los repos privados; un 401 dice que el token no vale y un 404, que el repo no existe o el token no lo lee (textos del Bitbucket propio). El token de Codeberg sigue sin salir hacia un servidor propio, y editar archivos en él sigue sin estar.
- **Pruebas que fallan sin la capacidad:** `tools/codeberg.test.mjs` (el token propio sale solo hacia su host, `pack`/`unpack`, 401 y 404 con token), el paso «Forgejo propio con token» del smoke y la e2e de `--forge-url` con el llavero.
- README: la sección del Forgejo propio, Límites conocidos y «Cada token a su servicio».
- QA: campo oculto sin servidor, aviso con el host, «Abrir Ajustes» lleva al campo, otro `?forge=` no usa el token guardado (smoke); auditoría: la puerta la corre.
- Skills: no aplica: replica un patrón del repo (el token del Bitbucket propio).
- Arena: no aplica: una sola forma obvia (copiar el diseño ya probado del Bitbucket propio).
- OMC: plan=— · revisión=— · verificación=— (sin subagentes; el diff espeja el del Bitbucket propio y se leyó a mano: el token sale solo con `webUrl` válida, hacia ese host)
- Reclamo: loop/246, sin colisión
- Validado: 649 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 247, mantenimiento · Accesibilidad: pendiente 11 (En la vista de texto, las marcas visibles de una rama (`.tv-tag`: «fusionada…»,…)

### 2026-11-10 · Iteración 247 · Mantenimiento · Accesibilidad

- **Arreglo: la vista de texto ya no se lee dos veces** (pendiente 11). Las marcas de una rama (`.tv-tag`: por defecto, PRs, nueva, sin actividad, fusionada, CI fallando) y la nota de cada commit (`.tv-aside`) van `aria-hidden="true"` (`mkSilent`, `js/textview.js`): ya están en el `aria-label` de su `treeitem`, y según el lector se anunciaban dos veces. Se ven igual. Falta confirmarlo con un lector real (Para Benjamin, 5).
- **Reproducción:** Playwright contra la demo, `#textview-btn` → `.tv-tag` y `.tv-aside` dentro de `[role=treeitem][aria-label]` sin `aria-hidden` → 60 de 60 sin el arreglo, 0 con él.
- **Pruebas que fallan sin el arreglo:** el paso de la vista de texto del smoke («marcas que el lector leería dos veces (sin aria-hidden)»).
- README: sin cambios (no cambia lo que hace la función, solo cómo la lee un lector).
- QA: la vista de texto abierta en la demo, marcas y notas con `aria-hidden` y el nombre accesible del nodo intacto; auditoría: la puerta la corre.
- Skills: no aplica: un atributo ARIA sobre una vista existente; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (`aria-hidden` en las marcas repetidas).
- OMC: plan=— · revisión=— · verificación=— (diff de unas líneas, leído a mano; sin subagentes)
- Reclamo: loop/247, sin colisión
- Validado: 649 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 248, expansión: ítem 178 (Launchpad: cuántos PRs tiene cada persona, Escala)

### 2026-11-10 · Iteración 248 · Expansión · Escala

- **Capacidad nueva: el selector de personas del Launchpad dice cuántos PRs tiene cada una** (ítem 178 de la hoja de ruta, parte del 158). Cada opción es `ana (3)`: `prCounts` (`js/overview.js`) cuenta los PRs abiertos por quien los abrió con lo ya cargado, sin consultas; el valor de la opción sigue siendo el login, así que `?by=` no cambia, y el conteo entra en la firma del repintado.
- **Pruebas que fallan sin la capacidad:** `node --test` (`tools/overview.test.mjs`, «prCounts: cada persona dice cuántos PRs abiertos tiene…»: tres autores en dos repos, iterador de un solo uso y PRs sin autor).
- README: la sección «Todos a la vez» dice que cada opción lleva su conteo.
- QA: Launchpad de la vista conjunta (selector, filtro, foco tras elegir); sin texto nuevo, solo el número con el formato local (`num`), así que no suma claves de idioma; auditoría: la puerta la corre.
- Skills: no aplica: una línea sobre una vista existente; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (contar al pintar).
- OMC: plan=— · revisión=— · verificación=— (diff de unas líneas, leído a mano; sin subagentes)
- Reclamo: loop/248, sin colisión
- Validado: 650 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde (la primera puerta falló en un paso ajeno e intermitente, anotado en el pendiente 3 de Deuda; la segunda pasó).
- **Siguiente:** iteración 249, expansión: ítem 161 (Resumen de la semana de la organización: quién fusionó, Salidas)

### 2026-11-10 · Iteración 249 · Expansión · Salidas

- **Capacidad nueva: el resumen de la semana de la organización suma quién fusionó** (ítem 161 de la hoja de ruta, parte del ítem 47). `computeOrg` (`js/digest.js`) junta los PRs fusionados por cuenta entre todos los repos seguidos (la misma cuenta que fusionó en dos repos cuenta una vez, con los PRs de los dos; hasta 5, por PRs); el Markdown y la imagen llevan la línea «Quién fusionó: ana (3), …» tras los fusionados. Sin cuentas, la línea no sale. Con lo ya cargado, sin consultas; usa la etiqueta `digest.mergers` que ya está en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test` (`tools/digest.test.mjs`, «organización: suma quién fusionó entre los repos seguidos…»: dos repos, una cuenta en ambos, tope de 5, PR viejo fuera y caso sin cuentas); sin el cambio de `js/digest.js` falla 1 de 27.
- README: Salud del repo (el resumen de la organización) y Límites conocidos («el resumen de la organización no la trae» ya no vale); el Mapa de alcance.
- QA: resumen de la organización en Markdown e imagen (vía las funciones puras); sin texto nuevo, así que no suma claves de idioma; auditoría: la puerta la corre.
- Skills: no aplica: una línea más en un resumen existente; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (sumar los conteos por repo).
- OMC: plan=— · revisión=— · verificación=— (diff de unas líneas, leído a mano; sin subagentes)
- Reclamo: loop/249, sin colisión
- Validado: 651 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 250, expansión: ítem 182 (Launchpad: filtrar por repo, Escala)

### 2026-11-10 · Iteración 250 · Expansión · Escala

- **Capacidad nueva: el Launchpad se filtra por repo** (ítem 182 de la hoja de ruta, parte del ítem 158). Con PRs abiertos en dos o más repos, un segundo selector sobre los grupos deja solo los PRs de ese repo (cada opción dice cuántos tiene, `owner/api (3)`; «Todos los repos» lo quita) y se combina con el de persona. Con lo ya cargado, sin consultas; no viaja en la URL ni se recuerda, y un repo sin PRs abiertos no filtra. `groupPulls` recibe el repo y `prRepos` lista los que tienen PRs (`js/overview.js`); textos `all.prs.repo` y `all.prs.allRepos` en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test` (`tools/overview.test.mjs`, «groupPulls y prRepos…» y «mount: el selector de repo…»): sin el cambio fallan las 2 nuevas.
- README: la sección Todos a la vez (el selector de repo) y Límites conocidos (no viaja en la URL); el Mapa de alcance.
- QA: Launchpad de la vista conjunta (selector de repo, filtro combinado con persona, foco tras elegir, oculto en modo TV como el de persona); auditoría: la puerta la corre.
- Skills: no aplica: una variante de un selector existente; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (copiar el patrón del filtro por persona).
- OMC: plan=— · revisión=— · verificación=— (diff pequeño, leído a mano; sin subagentes)
- Reclamo: loop/250, sin colisión
- Validado: 653 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 251, mantenimiento · QA: auditoría (sin pendientes de QA)

### 2026-11-10 · Iteración 251 · Mantenimiento · QA

- **Auditoría de QA: un token inválido ya no se rotula «Sin conexión».** La auditoría completa (`--langs`) dio 0 hallazgos; a mano, con la API simulada en es y ar a 1280 y 320 px (404, cuota agotada, repo vacío, sin red, 401): sin errores de consola ni desborde horizontal, pero un 401 (`kind: 'auth'`) salía como «Sin conexión | detenido» aunque `err.auth` ya pide revisar el token. `STATUS_ERROR_KEYS` (`js/util.js`) suma `auth` → `status.errorAuth` («Token no válido»), en los 40 idiomas.
- **Reproducción:** `node --test tools/util.test.mjs` → `expected: 'status.errorAuth'` (daba `status.error`).
- **Hallazgos:** 3 nuevos (pendientes 18, 19 y 20), 0 a la base de la auditoría
- **Pruebas que fallan sin el arreglo:** `node --test` (`tools/util.test.mjs`, «statusKey…»: la línea de `auth`); sin el cambio de `js/util.js` falla 1.
- README: no cambia (un rótulo de estado).
- QA: estados de error de la carga (404, cuota, vacío, sin red, 401) en es y ar a 1280 y 320 px; el resto de las filas, por la auditoría completa; auditoría: 0 hallazgos (0 Alta), 0 fuera de la base. El smoke tres veces no se corrió por tiempo: queda dicho aquí.
- Skills: no aplica: un rótulo de estado; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (una clave más en el mapa de rótulos).
- OMC: plan=— · revisión=— · verificación=— (diff pequeño, leído a mano; sin subagentes)
- Reclamo: loop/251, sin colisión
- Validado: 653 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.

### 2026-11-10 · Iteración 252 · Expansión · Público

- **Capacidad nueva: `stash -u` en la práctica de git** (ítem 163 de la hoja de ruta, parte del ítem 16). `stash -u` (`--include-untracked`, también con `push` y `-m`) aparta además los archivos sin seguir que deja `touch --new`; `stash pop` y `apply` los devuelven, y se niegan como git («already exists, no checkout») si el archivo ya existe. Sin `-u` el archivo nuevo se queda y no cuenta como cambio a guardar. Solo `js/gitsim.js` (la ayuda de la terminal está en inglés, como git).
- **Pruebas que fallan sin la capacidad:** `node --test` (`tools/gitsim.test.mjs`, «stash -u aparta…»): sin el cambio falla 1.
- README: la lista de comandos de Aprender git (`stash -u`) y Límites conocidos (`-a` no existe; el choque al devolver).
- QA: terminal de práctica (comando nuevo, estado `status` tras apartar y devolver); auditoría: no toca la página más que la simulación.
- Skills: no aplica: una bandera más de un comando del intérprete; lo cubren las reglas del repo.
- Hoja de ruta repuesta de 9 a 15 con ideas vigentes de `docs/investigacion.md` (ítems 183 a 188, sin pasada nueva de Replica).
- Arena: no aplica: una sola forma obvia (una lista `untracked` en la entrada del stash).
- OMC: plan=— · revisión=— · verificación=— (diff pequeño, leído a mano; sin subagentes)
- Reclamo: loop/252, sin colisión
- Validado: 654 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 253, expansión: ítem 164 (Resumen de la semana de la organización: PRs cerrados sin fusionar, Salidas)

### 2026-11-10 · Iteración 253 · Expansión · Salidas

- **Capacidad nueva: el resumen de la semana suma los PRs cerrados sin fusionar** (ítem 164 de la hoja de ruta, parte del ítem 47). El resumen de un repo gana la sección «PRs cerrados sin fusionar» (cada PR una vez, sin los que el feed también vio fusionados) y el de la organización, su total, su lista por repo (`#n`, «… +n») y la imagen; un repo cuyo único movimiento es un PR cerrado sin fusionar sale. Clave nueva `digest.dropped` en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test` (`tools/digest.test.mjs`, «organización: suma los PRs cerrados sin fusionar…»): sin el cambio falla 1.
- README: la lista del resumen de la semana, el de la organización y Límites conocidos (solo GitHub emite «PR cerrado»).
- QA: Markdown e imagen del resumen (de un repo y de la organización), sin la sección si no hay ninguno; auditoría: no toca la página más que una etiqueta de texto.
- Skills: no aplica: una sección más de un resumen que ya existe; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (copiar el patrón de los issues cerrados).
- OMC: plan=— · revisión=— · verificación=— (diff pequeño, leído a mano; sin subagentes)
- Reclamo: loop/253, sin colisión
- Validado: 655 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 254, expansión: ítem 166 (Launchpad: posponer un PR, Escala)

### 2026-11-10 · Iteración 254 · Expansión · Escala

- **Capacidad nueva: posponer un PR del Launchpad un día** (ítem 166 de la hoja de ruta, parte de «Launchpad: fijar y posponer PRs e issues»). Cada fila del Launchpad de la vista conjunta suma un 💤 junto al 📌: el PR baja, atenuado, al final de su grupo durante 24 horas y vuelve solo a su lugar al vencer (un temporizador repinta sin esperar datos nuevos); otra vez 💤 lo deja de posponer. Fijar gana a posponer: fijar un pospuesto lo deja de posponer y posponer un fijado lo suelta. Se guarda en este navegador por repo y número con la hora en que vence (`prsnooze`), y lo vencido se limpia al guardar. Claves nuevas `all.prs.snooze` y `all.prs.unsnooze` en los 40 idiomas; en el modo TV el botón no se ve.
- **Pruebas que fallan sin la capacidad:** `node --test` (`tools/overview.test.mjs`, «groupPulls: un PR pospuesto baja…» y «liveSnoozes…»): sin el cambio de `js/overview.js` fallan 2; el smoke suma el paso de posponer, fijar un pospuesto, posponer un fijado y soltar, y el modo TV de la vista conjunta comprueba que `.ap-snooze` no se ve.
- README: «Todos a la vez» (el 💤), Límites conocidos (un día fijo, cuándo se limpia) y Seguridad (qué se guarda); `replica/features.csv`: «Launchpad: fijar y posponer PRs e issues» pasa a `partial` (faltan los issues), paridad 93,3.
- QA: Launchpad con la API simulada en ar a 1280 px, ta a 320 px y es a 390 px, solo con el teclado (Tab hasta 💤 y Enter: la fila baja al final, el foco la sigue y la etiqueta cambia a «dejar de posponer»), sin errores de consola ni desborde horizontal; modo TV y 40 idiomas por el smoke; auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: un botón más en una lista que ya existe; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (copiar el patrón de fijar, con la hora de vencimiento).
- OMC: plan=— · revisión=3 hallazgos LOW (0 arreglados: «al final de su grupo» es a propósito, como lo dice el README; sin sincronía entre pestañas, igual que fijar; la limpieza de lo vencido, pendiente 21) · verificación=PASS
- Reclamo: loop/254, sin colisión
- Validado: 657 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 255, mantenimiento · Errores: pendiente 13 (Bitbucket Data Center: `sameRepo` (`js/sources/bitbucket-server.js`) compara el…)

### 2026-11-10 · Iteración 255 · Mantenimiento · Errores

- **Arreglo: en Bitbucket Data Center, un PR de un repo renombrado vuelve a contar como del mismo repo** (pendiente 13). `mapPull` de `js/sources/bitbucket-server.js` compara el repo de origen del PR (`fromRef.repository`) con el de destino (`toRef.repository`, el nuestro) por su `id` si los dos lo traen y si no por proyecto y slug sin distinguir mayúsculas, en vez de compararlo con el `owner/name` que se escribió: abierto por su nombre viejo, sus ramas ya no pierden el «PR abierto». Sin `toRef` se cae a lo de antes. Mismo patrón buscado en las demás fuentes: Bitbucket Cloud, GitHub y Codeberg ya comparan con el repo de destino, y GitLab y Azure con ids o banderas; sin pendientes nuevos.
- **Reproducción:** `node --test tools/bitbucket-server.test.mjs` → `un repo renombrado (abierto por su nombre viejo)…`: `el PR del repo renombrado es del mismo repo` (`actual: false`).
- **Pruebas que fallan sin el arreglo:** la misma, que también fija que un PR desde un fork personal (`~beto/api`) sigue sin contar como del mismo repo.
- README: sin cambios (no cambia lo que hace la función, solo qué PRs cuentan como del repo).
- QA: fila de fuentes cubierta con la API simulada de Bitbucket Data Center (repo renombrado y fork); auditoría: no toca la página más que la fuente, 0 hallazgos nuevos.
- Skills: no aplica: una comparación corregida en una fuente que ya existe; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la que dice el pendiente: origen contra destino).
- OMC: plan=— · revisión=2 hallazgos LOW (0 arreglados: sin prueba propia para el respaldo sin `toRef` ni para el renombrado sin `id`; la lógica es la misma vía de la clave que ya prueban los PRs por defecto) · verificación=—
- Reclamo: loop/255, sin colisión
- Validado: 658 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 256, expansión: ítem 167 (Salud del repo: tendencia de estrellas, Análisis)

### 2026-11-10 · Iteración 256 · Expansión · Análisis

- **Capacidad nueva: tendencia de estrellas en la salud del repo** (ítem 167 de la hoja de ruta). El panel de salud suma la sección «Estrellas nuevas», debajo de los forks: las estrellas de los últimos 7 días frente a las de los 7 anteriores, con la diferencia («3 esta semana · 1 la anterior (+2)»), con lo ya cargado y sin consultas nuevas. Cada usuario cuenta una vez, con la primera estrella que se le vio (quitarla y volver a ponerla no suma dos). Se ve en la demo: sus estrellas ahora traen su usuario.
- **Pruebas que fallan sin la capacidad:** `node --test tools/health.test.mjs` («estrellas nuevas: la semana actual frente a la anterior…», con estrellas fabricadas: bordes de 7 y 14 días, mismo usuario con otras mayúsculas, sin usuario, sin hora, en el futuro y un fork): sin el cambio de `js/health.js` falla (`TypeError`); el smoke suma a su paso de salud que la demo muestra la línea con su diferencia.
- README: la salud del repo (la sección nueva), Límites conocidos (de dónde salen las estrellas, que solo GitHub las avisa y que quitar una no resta) y la estructura (`js/health.js`); Seguridad sin cambios (sin consultas ni texto de afuera nuevo: solo cifras).
- QA: panel de salud de la demo con `?health=1` en es, en y ar a 320 px (sin desborde ni errores de consola; la línea con su diferencia), tema y 40 idiomas por el smoke; auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: una cifra más en un panel que ya existe; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (contar las actividades «estrella» con la misma `weekly()` del resto del panel).
- OMC: plan=— · revisión=4 hallazgos (2 arreglados: las estrellas de la demo sin usuario y el orden en el README; el MEDIUM de la semana anterior sin cargar, pendiente 4; los signos «+/−» fijos, como el resto de la app) · verificación=PASS
- Reclamo: loop/256, sin colisión
- Validado: 659 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 257, expansión: ítem 173 (Práctica: rm y mv, Público)

### 2026-11-11 · Iteración 257 · Expansión · Público

- **Capacidad nueva: `rm` y `mv` en la práctica de git** (ítem 173 de la hoja de ruta, parte del ítem 16). `git rm <archivo>` borra un archivo que git sigue y deja el borrado preparado (se niega como git si tiene cambios sin commit, salvo con `-f`; `--cached` lo saca del índice y lo deja en el árbol, sin seguir, y un `add` lo vuelve a seguir); `git mv vieja nueva` lo renombra preparado, con sus cambios; `rm` y `mv` sin `git` delante son los de la terminal: borran o mueven el archivo a mano, y `add -A`, `add .`, `add -u` o `commit -a` preparan el borrado (un `mv` a mano se ve como renombre, como en git). `status` dice `deleted:` y `renamed: vieja -> nueva`, el commit guarda lo borrado (un renombre cuenta un archivo), y `restore`, `reset --hard`, `stash`, `rebase` y `cherry-pick` respetan los borrados. Sin textos nuevos de la interfaz: la salida es la de git, en inglés.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs`: sin el cambio de `js/gitsim.js` fallan las 4 nuevas (`git rm` y el commit, `git rm` sin `-f` y `--cached`, `git mv`, y `rm`/`mv` a mano con `add -A`); una quinta fija los bordes que trajo la revisión (add tras `rm --cached`, ida y vuelta, `--amend`, `rebase`, `cherry-pick` y `stash`).
- README: «Aprender git» (los comandos nuevos y que `rm`/`mv` sin `git` son los de la terminal) y Límites conocidos (sin `-n` ni `--ignore-unmatch`, qué borra `git rm -r .`, todo nombre se da por seguido, `stash` y `reset --soft` con borrados); Seguridad sin cambios (sin texto de afuera ni red).
- QA: la terminal de la práctica (`?practice=1`) en es a 1280 px y ar a 320 px con `git mv`, `rm` a mano, `add -A`, `status` y `git rm --cached` (renombre, borrado y archivo sin seguir en la salida; sin errores de consola ni desborde); auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: comandos nuevos en un simulador propio, sin dominio externo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (sumar el borrado y el renombre a las listas del índice que ya existen).
- OMC: plan=— · revisión=10 hallazgos (1 HIGH y 5 MEDIUM arreglados: add tras `rm --cached`, `git mv` y `mv` de ida y vuelta, `--amend` que borra lo que creó, `rebase`/`cherry-pick` que perdían el borrado, `stash` de un `rm --cached`; `git rm -r .` sin archivos ahora avisa; los LOW de `restore --staged` con el nombre viejo y `reset --soft` quedan en Límites conocidos, y el costo de recorrer la historia no pesa al tamaño de la práctica) · verificación=PASS
- Reclamo: loop/257, sin colisión
- Validado: 664 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 258, expansión: ítem 175 (Estado de los despliegues, segunda entrega, Datos)

### 2026-11-11 · Iteración 258 · Expansión · Datos

- **Capacidad nueva: si el último despliegue de cada entorno salió bien, falló o sigue en curso** (ítem 175 de la hoja de ruta, segunda entrega del 153). Los «Despliegues por entorno» del panel de salud suman, tras «al día» o los commits que faltan, «salió bien», «falló» (también si dio error) o «en curso» (en cola o pendiente); `inactive` o un estado desconocido no dicen nada. En GitHub sale de `/deployments/:id/statuses?per_page=1` (el id ahora se guarda con la carga de despliegues): una consulta por entorno, solo al abrir el panel, con ETag y no más de una cada 15 minutos por despliegue (5 por vez sin token, 10 con él); un despliegue nuevo se pregunta enseguida y el reemplazado se olvida con su ETag. En la demo, producción salió bien y staging falló y vuelve a quedar en curso con cada push a develop. Tres claves nuevas (`health.deployOk`, `health.deployFailed`, `health.deployRunning`) en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/github.test.mjs`: las 2 nuevas («estado de los despliegues: una consulta por entorno, solo al pedirla…» y «…sin token pregunta menos, un despliegue nuevo se pregunta enseguida…», con la API simulada: cuántas consultas, ninguna sin pedirla, el borde de 15 minutos, el 404 sin estado, dos aperturas a la vez sin repetir) fallan sin el cambio (`syncDeployStatuses is not a function`); `tools/health.test.mjs` suma la traducción de cada estado de GitHub y de la demo; el smoke exige producción «salió bien» y staging «falló» o «en curso».
- README: Salud del repo (el estado y de dónde sale), Pruebas (tags y despliegues), Límites conocidos (solo con el panel abierto, sin refrescar hasta reabrirlo pasados 15 minutos, sin descripción ni enlace a los registros) y Seguridad (la consulta nueva, a la misma API y con el mismo token; solo se lee una palabra de una lista fija).
- QA: panel de salud de la demo con `?health=1` en es a 1280 px, ar y ta a 320 px (cada entorno con su estado traducido, sin desborde ni errores de consola), 40 idiomas por el smoke; cuota: ninguna consulta sin abrir el panel ni con la carga apagada (`tools/github.test.mjs`); auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: una consulta más a la API de GitHub con el mismo patrón que los forks del panel; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la consulta perezosa del panel, como `syncForks` y `syncFirstCommits`).
- OMC: plan=— · revisión=4 hallazgos y seguridad sin hallazgos (3 arreglados: el MEDIUM de las consultas repetidas si el panel se reabre a mitad de la tanda, la limpieza que un corte de cuota salteaba y el comentario que prometía avisar la cuota; queda el LOW de una prueba de la app que cuente las consultas al abrir el panel, cubierto por la de la fuente) · verificación=PASS
- Reclamo: loop/258, sin colisión
- Validado: 666 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. (A la tercera corrida: las dos primeras fallaron cada una en un paso ajeno distinto del smoke, el interruptor de columnas del 2D y el anuncio de las galaxias; van al pendiente 4.)
- **Siguiente:** iteración 259, mantenimiento · Deuda: pendiente 1 (El paso del smoke «quién tocó un archivo: el botón del diff lista los últimos c…)

### 2026-11-11 · Iteración 259 · Mantenimiento · Deuda

- **Arreglo: el paso intermitente del smoke «quién tocó un archivo»** (pendiente 1). La causa: el panel de cambios rehace sus secciones `.df-file` al terminar de cargar un commit (`show` → `renderFiles` en `js/diff.js`), y el paso usaba un localizador que se volvía a resolver en cada clic; si el redibujo caía entre los dos, el segundo clic iba al botón nuevo, cuya lista estaba cerrada, y la abría. Ahora el paso espera a que el panel deje de cargar y hace los dos clics sobre el mismo botón y su misma lista (el segundo, en el mismo `evaluate` que lee el resultado), y además comprueba que `aria-expanded` vuelva a `false`. La app no cambia.
- **Reproducción:** un script de Playwright en el scratchpad contra `node e2e/serve.mjs 4173` que corre el paso con un redibujo forzado del panel (← y → dentro de él) entre los dos clics → `FALLA: el segundo clic no cerró la lista` con el paso viejo, 3 de 3; con el arreglo, `PASA` 3 de 3.
- **Pruebas que fallan sin el arreglo:** el paso del smoke, con el redibujo entre los clics (la reproducción de arriba); en la puerta pasó en su corrida normal.
- README: sin cambios (no cambia ninguna función ni el modo de probar).
- QA: el paso «quién tocó un archivo» del smoke, 3 veces con el redibujo forzado y una en la puerta; el mismo patrón (un localizador del primer `.df-file` usado en dos acciones) se buscó en el resto del smoke: el paso del historial ya hace ruta y clic en un solo `evaluate`, y no hay otro; auditoría: no toca la página.
- Skills: no aplica: un arreglo de una prueba de Playwright del propio repo, sin dominio nuevo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (atar los dos clics al mismo elemento).
- OMC: plan=— · revisión=3 hallazgos LOW (0 arreglados: el comentario que nombra la iteración queda como historia; el segundo clic por `evaluate` se salta las comprobaciones de un clic real a cambio de no fallar con un redibujo en el medio, y la lista que se llena tras un redibujo se mide sobre los nodos ya desprendidos, el mismo código) · verificación=PASS
- Reclamo: loop/259, sin colisión
- Validado: 666 pruebas (`node --test`), smoke, i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 260, expansión: ítem 179 (Resumen de la semana: quién abrió más PRs, Salidas)

### 2026-11-11 · Iteración 260 · Expansión · Salidas

- **Capacidad nueva: quién abrió más PRs en el resumen de la semana** (ítem 179 de la hoja de ruta, parte del ítem 23). Debajo de «Pull requests abiertos», el resumen de la semana de un repo dice quién abrió más (hasta 5 cuentas, por PRs abiertos en la semana), en el Markdown, el `.md` y la imagen `.png`. Cada PR cuenta una vez, para el autor de su actividad «PR abierto» más vieja de la semana: un PR reabierto o marcado como listo por otra cuenta no suma otra vez, y uno sin autor no cuenta. Sale con lo ya cargado, sin consultas; en la demo, el PR del agente (`claude[bot]`). El de la organización queda para el ítem 186.
- **Pruebas que fallan sin la capacidad:** `tools/digest.test.mjs` («quién abrió más PRs», con PRs de esta semana y de la anterior, repetidos, reabiertos por otra cuenta y sin autor) y un paso del smoke (el resumen de la demo lleva la línea).
- README: «Resumen de la semana» en la lista de funciones y su límite en Límites conocidos (de dónde sale el autor y que el de la organización todavía no lo tiene); Seguridad sin cambios (no hay consultas ni textos nuevos de afuera sin escapar: los nombres pasan por `md()` y la imagen los dibuja en un canvas).
- QA: resumen de la semana de la demo en español, con Playwright contra `node e2e/serve.mjs 4173` (la línea sale debajo de los PRs abiertos, sin errores de consola); el Markdown, el `.md` y el `.png` por el smoke; auditoría: la de la puerta.
- Skills: no aplica: una línea más en un resumen en Markdown y canvas que ya existe, sin dominio nuevo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (el mismo conteo que «quién fusionó», sobre los PRs abiertos).
- Hoja de ruta repuesta de 9 a 15 con partes de ítems vigentes (ítems 189 a 194, en `docs/investigacion.md`).
- Replica: paridad, sin pasada nueva: 93,3/100, must hechos 13 de 13; ítem 193.
- OMC: plan=— · revisión=3 hallazgos (1 arreglado: el MEDIUM, el PR se atribuía a la actividad «PR abierto» más nueva, la de quien lo reabrió o lo marcó listo, y ahora va a la más vieja, con su caso en la prueba; los 2 LOW quedan: el de la organización es el ítem 186, y la etiqueta sin «PRs» se lee bajo su sección) · verificación=PASS
- Reclamo: loop/260, sin colisión
- Validado: 667 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 261, expansión: ítem 180 (Salud del repo: PRs sin revisión hace días, Análisis)

### 2026-11-11 · Iteración 261 · Expansión · Análisis

- **Capacidad nueva: los PRs sin revisión hace días en el panel de salud** (ítem 180 de la hoja de ruta, parte del ítem 12). Debajo de «Pull requests abiertos por estado», la lista «Pull requests sin ninguna revisión hace más de 7 días», con su total, del más viejo al más nuevo y cada fila a su rama en el grafo. Cuenta un PR abierto hace más de 7 días que no es borrador, no está aprobado ni con cambios pedidos (GitHub ahora guarda también `CHANGES_REQUESTED` de su `reviewDecision`, que ya llegaba), no tiene un revisor que ya votó (Azure DevOps) y del que la actividad cargada no trae ninguna revisión (pedir una no cuenta). Con lo ya cargado, sin consultas. En la demo los PRs tienen 3 días, así que sale vacía. Una clave nueva (`health.unreviewed`) en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `tools/health.test.mjs` («PRs sin revisión hace días…», con PRs de 3 a 20 días, borrador, aprobado, con cambios pedidos, revisado en la actividad, con revisión solo pedida, en rojo y con revisores de Azure con y sin voto) falla sin el cambio; un paso del smoke exige la sección en la demo, con su título resuelto y su total en 0.
- README: Salud del repo (la lista y qué cuenta), Límites conocidos (de dónde sale «sin revisión» en cada fuente, las revisiones de solo comentarios más viejas que el feed, Bitbucket sin revisiones y los 7 días desde la apertura); Seguridad sin cambios (sin consultas nuevas; el título pasa por `U.esc`).
- QA: panel de salud de la demo por el smoke (40 idiomas, la sección nueva con su total), el texto en árabe y tamil revisado en `js/locales/`; cuota: ninguna consulta nueva (`reviewDecision` ya venía en la consulta de los PRs); auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: un conteo más sobre lo ya cargado del panel de salud, sin dominio nuevo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (filtrar los PRs ya cargados con su decisión de revisión y la actividad, como los PRs por estado).
- OMC: plan=— · revisión=5 hallazgos (2 arreglados: el MEDIUM de Azure, cuyos PRs aprobados por voto contaban como sin revisión, y el LOW de la prueba, que ahora mira la rama de la fila; el MEDIUM de Bitbucket, que no trae revisiones, va a Límites conocidos; quedan los LOW de los 7 días desde la apertura y no desde «listo para revisión», y del smoke que solo ve la lista vacía) · verificación=PASS
- Reclamo: loop/261, sin colisión
- Validado: 668 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 262, expansión: ítem 181 (Práctica: git clean, Público)

### 2026-11-11 · Iteración 262 · Expansión · Público

- **Capacidad nueva: `clean` con rutas, carpetas sin seguir, `-e` y `-q` en la práctica de git, con su ejercicio** (ítem 181 de la hoja de ruta, parte del ítem 16). El `clean -n`/`-f` básico ya venía del ítem 148; ahora `clean -f '*.tmp'` o `clean -f build/` borran solo eso (los patrones cruzan carpetas, como una ruta de git, y una ruta que cubre una carpeta entera la borra como carpeta); `-d` borra también las carpetas que git no sigue, que `status` muestra enteras como `build/` (y `add build/` prepara lo de adentro) y que sin `-d` quedan; `-e <patrón>` o `--exclude=` deja fuera lo que coincide, como una línea de `.gitignore` (si deja algo de una carpeta, la lista sale archivo por archivo); `-q` borra sin listar; las banderas van juntas (`-fd`, `-nd`, `-fde*.tmp`); `-x` no cambia nada y `-X` no borra nada (sin `.gitignore`), `-i` se niega con un aviso y los errores de git (banderas desconocidas, `-e` sin valor, `-x` con `-X`) no borran nada. Un ejercicio guiado nuevo, el 12 («Borrar una carpeta sin seguir con clean -d»: los temporales y `build/` fuera, `nuevo.js` se queda), con su título y su meta en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs`: sin el cambio de `js/gitsim.js` fallan 5 (cada ejercicio con su solución, el atajo equivocado del 12 —`clean -f` deja `build/` y `clean -fd` se lleva `nuevo.js`—, `?practice=12`, «clean con rutas, patrones, -d, -e, -q y banderas juntas» y «clean -d no toma por carpeta sin seguir una que git sigue»); una sexta, de la revisión, fija que `add build/` y `add build` preparan lo que `status` muestra como carpeta.
- README: «Aprender git» (lo nuevo de `clean`, doce ejercicios y `?practice=1` a `12`), Pruebas y Límites conocidos (sin `-i` ni `-ff`, `-x`/`-X` sin `.gitignore`, `-X` sin `-e`, los patrones solo con `*` y `?`, `-e build/` que también deja un archivo `build`, cuándo una carpeta cuenta como sin seguir); Seguridad sin cambios (sin texto de afuera ni red: los patrones se escapan antes de volverse expresión regular).
- QA: la terminal de la práctica (`?practice=12`) en es a 1280 px y ar a 320 px con Playwright contra `node e2e/serve.mjs 4173`: `status` con `build/`, `clean -f`, `clean -nd`, `clean -fd -e nuevo.js` (sin errores de consola ni desborde; el ejercicio se marca ✓ con `clean -f -d -e nuevo.js`); auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: banderas nuevas en un simulador propio, sin dominio externo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (filtrar la lista de archivos sin seguir que ya existe por ruta, exclusión y carpeta).
- OMC: plan=— · revisión=6 hallazgos (2 arreglados: el HIGH de `status`, que mostraba `build/` y `add build/` lo rechazaba, y el MEDIUM de `clean -n build`, que listaba los archivos y no la carpeta; los LOW de `-X` con `-e`, los corchetes y `-e build/` van a Límites conocidos; queda sin confirmar el MEDIUM de `clean -n .` sin `-d`, que entra a las carpetas, porque la documentación de git dice que con rutas `-d` no hace falta) · verificación=PASS
- Reclamo: loop/262, sin colisión
- Validado: 671 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 263, mantenimiento · Rendimiento: pendiente 12 (Con 1.000 ramas, `stepScene` (`js/graph3d.js`) es lo más caro del JavaScript po…)

### 2026-11-11 · Iteración 263 · Mantenimiento · Rendimiento

- **Arreglo: el 1,1 ms de `stepScene` era la medida, no el código; la auditoría lo mide ahora en tandas** (pendiente 12). Con 1.000 ramas en 3D, en tandas de 300 llamadas (la mejor de 7), `stepScene` cuesta 0,0007 ms en reposo y 0,08 ms con la escena sucia (28 nodos; casi todo `writeEdges`), y `placeLabels` 0,03 ms; el render por software, 0,07 ms de JavaScript. El 1,1 ms salía de envolver una llamada sola: `performance.now()` va de 0,1 ms en 0,1 ms sin aislamiento entre orígenes, y los primeros cuadros, fríos, dan 1,1 ms en `writeEdges`. Sin trabajo caro que quitar en la app (no cambia). Lo que cambia: la auditoría completa guarda en el escenario de 1.000 ramas `escena3dUs` y `etiquetas3dUs` (en tandas, en microsegundos) y `escena3dNodos`, `--comparar` las vigila (subir es peor), una excepción durante la medida no la cuelga y sin medida sale un hallazgo.
- **Reproducción:** Playwright desde el scratchpad contra `node e2e/serve.mjs 4173` con la API simulada de 1.000 ramas, envolviendo cada llamada de `stepScene` → «1 × 1.100 ms» en `writeEdges` y máximo de 1,3 ms en `stepScene` (cuadros en pasos de 0,1 ms); la misma escena en tandas → `stepSceneSucio: 0.083`, `stepSceneReposo: 0.0007`, `placeLabels: 0.0283`.
- **Pruebas que fallan sin el arreglo:** `node --test tools/audit.test.mjs` («el JavaScript por cuadro del 3D con 1.000 ramas se mide en tandas y --comparar lo vigila») falla sin el cambio de `tools/audit.mjs`.
- README: Pruebas (las medidas nuevas de la auditoría, por qué en tandas y que `--repetir` no las repite).
- QA: Rendimiento: base `--repetir 3` antes y `--comparar` después: carga 2046 → 1881 ms (−8 %), tareas largas 1165 → 1204 ms (+3 %), 3D 9,9 → 8,9 fps (+10 %, con carga 1,3: la app no cambió), 2D 42 → 43,9 fps, 10 consultas, nodos y memoria iguales; medidas nuevas `escena3dUs` 261 µs con 124 nodos y `etiquetas3dUs` 29 µs (la escena de la auditoría sigue cargando historia); auditoría completa: 0 hallazgos.
- Skills: no aplica: medir con Playwright una función propia; lo cubren las reglas del repo y el protocolo de Rendimiento.
- Arena: no aplica: una sola forma obvia (repetir la llamada en tanda para pasar la resolución del reloj).
- OMC: plan=— · revisión=6 hallazgos (3 arreglados: el MEDIUM de la medida que colgaba la auditoría si algo lanzaba, el LOW de la medida que faltaba sin aviso y el de los nodos sin guardar; quedan los LOW de `etiquetas3dUs` con la cámara quieta, dicho en el comentario, `--repetir`, dicho en el README, y la prueba que mira el fuente) · verificación=PASS
- Reclamo: loop/263, sin colisión
- Validado: 672 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) en verde; e2e no corridas (no toca la página ni el escritorio).
- **Siguiente:** iteración 264, expansión: ítem 183 (Práctica: stash show, Público)

### 2026-11-11 · Iteración 264 · Expansión · Público

- **Capacidad nueva: `stash show` en la práctica de git, con su ejercicio** (ítem 183 de la hoja de ruta, parte del ítem 16). `stash show [stash@{n}]` lista los archivos que guarda un stash sin devolverlos ni soltarlo: a secas (o `--stat`), cada nombre con lo que le pasó (nuevo, cambiado, borrado) y cuántos son; `--name-only` y `--name-status` (`A`, `M`, `D`) como git; `-u` suma lo sin seguir que apartó `stash -u` y `--only-untracked` muestra solo eso; `--` antes de la referencia; `-p` se niega (no hay contenido) y los errores de git (sin stash, referencia que no existe, dos referencias, bandera desconocida) no tocan nada. `stash show` y `stash list` pasan con un rebase a medias, porque solo leen. Cada stash recuerda lo nuevo preparado (para la `A`) y un archivo nuevo preparado y borrado a mano ya no se aparta como borrado. Un ejercicio guiado nuevo, el 13 («Mirar un stash antes de recuperarlo»: dos stash iguales en `stash list`; hay que mirar con `stash show` y recuperar solo el del login, y el de `notes.txt` se queda), con su título y su meta en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs`: sin el cambio de `js/gitsim.js` fallan 5 (cada ejercicio con su solución, `?practice=13`, «stash show lista lo que guarda un stash sin devolverlo, antes y después de un pop» y «el ejercicio de stash show no se resuelve sin mirar ni con el stash equivocado», que también prueba los atajos de `pop` a secas, soltar el bueno y tocar sus archivos, y mirar solo el otro, y una de la revisión, que fija `stash show` y `stash list` con un rebase a medias y el archivo nuevo borrado a mano).
- README: «Aprender git» (`stash show` y sus formas, trece ejercicios y `?practice=1` a `13`), Pruebas y Límites conocidos (sin líneas contadas ni `-p`, un renombre sale como `A` y `D`, sin `stash.showStat`, las opciones van detrás de `show`, `stash list` y `show` sí pasan con un rebase a medias); Seguridad sin cambios (sin texto de afuera ni red).
- QA: la terminal de la práctica (`?practice=13`) con Playwright contra `node e2e/serve.mjs 4173` en es a 1280 px y en ar y ta a 320 px: `stash list`, `stash show`, `stash show --name-status stash@{1}`, `stash pop stash@{1}` y el ejercicio se marca resuelto, sin errores de consola; a 320 px la práctica desborda en es (5 px) y ta (66 px) con cualquier ejercicio, también en `dev` (pendiente 5 nuevo); auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: un subcomando más en un simulador propio, sin dominio externo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (listar lo que ya guarda cada stash, con el formato de git).
- OMC: plan=— · revisión=8 hallazgos (6 arreglados: el MEDIUM del ejercicio, que se resolvía soltando el stash y tocando sus archivos o mirando el otro; los LOW de las opciones antes de `show`, el `fatal` que en git es `error`, `--`, `show`/`list` bloqueados en un rebase, el nuevo borrado a mano que salía `D` y el registro de ja, ru y uk; el renombre como `A` y `D` va a Límites conocidos y el `pop` que devuelve lo nuevo como cambiado, al pendiente 22) · verificación=PASS
- Reclamo: loop/264, sin colisión
- Validado: 675 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 265, expansión: ítem 186 (Resumen de la semana de la organización: quién abrió más PRs, Salidas)

### 2026-11-11 · Iteración 265 · Expansión · Salidas

- **Capacidad nueva: quién abrió más PRs en el resumen de la semana de la organización** (ítem 186 de la hoja de ruta, parte del ítem 179). Con dos o más repos abiertos de una organización seguida, los totales del resumen dicen, debajo de los PRs abiertos, quién abrió más (hasta 5 cuentas), en el Markdown, el `.md` y la imagen `.png`. La misma cuenta suma los PRs que abrió en cada repo seguido; cada PR cuenta una vez en el suyo, para el autor de su actividad «PR abierto» más vieja de la semana (como en el de un repo), y el mismo número en dos repos son dos PRs. Sale con lo ya cargado, sin consultas ni textos nuevos (la etiqueta es la del resumen de un repo).
- **Pruebas que fallan sin la capacidad:** `node --test tools/digest.test.mjs` («organización: suma quién abrió más PRs entre los repos seguidos…», con PRs de dos repos, uno reabierto por otra cuenta, el mismo número en los dos, uno de hace 20 días, uno sin autor, un nombre con `*` y sin etiqueta) falla sin el cambio de `js/digest.js`.
- README: Salud del repo (el resumen de la organización con «quién abrió más») y Límites conocidos (cómo lo suma la organización, en lugar de «por ahora no está»); Seguridad sin cambios (sin consultas; los nombres pasan por `md()` y la imagen los dibuja en un canvas).
- QA: el resumen de la organización (`org:acme`) por el smoke (Markdown, `.md` y `.png`, sin textos sin resolver); el conteo, el escape y cuándo no sale la línea, por la prueba nueva; auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: una línea más en un resumen en Markdown y canvas que ya existe, sin dominio nuevo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (sumar por cuenta los `openers` de cada repo, como ya se hace con quién fusionó).
- OMC: plan=— · revisión=3 hallazgos (0 arreglados: los 3 LOW quedan; una cuenta con usuario en un repo y solo nombre en otro cuenta dos veces, como en quién fusionó; la condición `o.opened` sobra, y se deja por simetría con el de un repo; la prueba no tiene tres repos, cubierto por el mismo patrón de quién fusionó) · verificación=PASS
- Reclamo: loop/265, sin colisión
- Validado: 676 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 266, expansión: ítem 184 (Práctica: tag anotado, Público)

### 2026-11-11 · Iteración 266 · Expansión · Público

- **Capacidad nueva: etiquetas anotadas en la práctica de git** (ítem 184 de la hoja de ruta, parte del ítem 16). `tag -a <nombre> -m "mensaje" [<commit>]` crea una etiqueta con su mensaje y un objeto con su propio sha (que dice `tag -d` al borrarla); `-m` solo también anota, valen `--annotate`, `-am` y `--message=`, y el `log` la sigue mostrando como `tag: v1`, igual que una ligera. `tag -n` lista cada etiqueta con la primera línea de su mensaje (o el titular de su commit si es ligera), `tag -l` filtra con `*` y `?`, y `-f` pisa una que ya existe (`Updated tag …`). Sin editor, `tag -a` sin `-m` se niega diciendo que lo escriba con `-m`; `-s`, una bandera desconocida, `-n` o `-l` con `-a`, demasiados argumentos y `-d` con un nombre que no existe se niegan sin tocar nada. La terminal separa las palabras como la de verdad: `--message="dos palabras"` es una sola y un apóstrofo suelto (`it's`) queda dentro de la suya.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs`: «tag -a: etiqueta anotada con su mensaje, que tag -n lista y el log decora como tag:» y «tag -f pisa una etiqueta, tag -d borra todas o ninguna y una comilla suelta no corta la palabra» fallan sin el cambio de `js/gitsim.js`.
- README: «Aprender git» (`tag -a`, `-m`, `-n`, `-l` y `-f`), Pruebas y Límites conocidos (las anotadas guardan solo su mensaje, sin autor, fecha ni firma; `tag -n` solo la primera línea; `-l` sin `[abc]`); Seguridad sin cambios (sin texto de afuera ni red; el mensaje se ve tal cual en la terminal).
- QA: la terminal de la práctica (`?practice=1`) con Playwright contra `node e2e/serve.mjs 4173` en es a 1280 px: `tag -a v1 -m "Primera <b>versión</b>"`, `tag -n` (el `<b>` sale como texto), `tag -l "v*"`, `tag -a v2` sin `-m` (el error), `log --oneline` con `tag: v1` y `tag -d v1` con el sha del objeto, sin errores de consola; auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: un subcomando más en un simulador propio, sin dominio externo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (guardar el mensaje junto a la etiqueta, sin cambiar cómo se guardan las ligeras).
- OMC: plan=— · revisión=4 hallazgos (3 arreglados: el MEDIUM de los enlaces de ejercicios propios con `tag -f`, que ahora pisa como git, y los LOW del apóstrofo suelto que cortaba la palabra y de `tag -d` que borraba a medias; queda el LOW del mismo sha al recrear la misma anotada, que sigue siendo determinista; un enlace viejo con `tag -m x <commit>` ahora crea la anotada, como git) · verificación=PASS
- Reclamo: loop/266, sin colisión
- Validado: 678 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 267, mantenimiento · QA: pendiente 5 (Con la práctica de git abierta, a 320 px la página desborda a lo ancho, con cua…)

### 2026-11-11 · Iteración 267 · Mantenimiento · QA

- **Arreglo: la práctica de git ya no ensancha la página a 320 px en ningún idioma** (pendiente 5). El panel `.practice` es una grilla de una columna `auto`, que tomaba el ancho mínimo de su hijo más ancho (la fila de botones con sus textos en ta o de, el `select` en es) y empujaba la página 5 px en es, 57 en de y 66 en ta. Ahora la columna es `minmax(0, 1fr)`: los hijos, que ya tenían `min-width: 0`, `flex-wrap` y `overflow-wrap`, se acomodan al ancho del panel. La auditoría de la puerta abre la práctica a 320 px (`practica-320-es`, `-ar`, `-de` y `-ta`, con `?practice=12`), así que el desborde no vuelve sin que la puerta lo vea.
- **Reproducción:** `node tools/audit.mjs --puerta` con los escenarios nuevos y el CSS de `dev` → `desborde · practica-320-ta · html — 66 px de más` (también `practica-320-de` 57 px y `practica-320-es` 5 px; `ar` no desborda).
- **Hallazgos:** 0 nuevos (la iteración cerró el pendiente 5; con la práctica a 320 px, en los cuatro idiomas de la puerta, la auditoría no ve nada más), 0 a la base de la auditoría
- **Pruebas que fallan sin el arreglo:** `node tools/audit.mjs --puerta` (los tres desbordes de arriba, en dos corridas seguidas) y `node --test tools/audit.test.mjs` («la puerta abre la práctica de git a 320 px en es, ar, de y ta», que falla sin los escenarios).
- README: sin cambios (no cambia ninguna función ni límite; el desborde no estaba en Límites conocidos).
- QA: la práctica a 320 px con Playwright contra `node e2e/serve.mjs 4173` en es, ta, ar y de (`scrollWidth` 320 en los cuatro, ningún elemento del panel fuera de la pantalla, ningún control con texto recortado; captura de ta con los botones uno debajo de otro); auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: una línea de CSS de grilla y un escenario más de la auditoría propia; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (acotar la pista de la grilla con `minmax(0, 1fr)`).
- OMC: plan=— · revisión=2 hallazgos (1 arreglado: el LOW de la prueba unitaria del escenario; el otro, la entrada de la bitácora, es este paso) · verificación=PASS
- Reclamo: loop/267, sin colisión
- Validado: 679 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 268, expansión: ítem 187 (Salud del repo: tendencia de forks, Análisis)

### 2026-11-11 · Iteración 268 · Expansión · Análisis

- **Capacidad nueva: forks nuevos de la semana frente a la anterior en el panel de salud** (ítem 187 de la hoja de ruta). La sección de forks del panel de salud dice, encima de la lista de forks activos, «Forks nuevos: n esta semana · m la anterior (±d)», de las actividades «fork» ya cargadas (en GitHub, el `ForkEvent` del feed y los que llegan en la sesión), sin consultas nuevas: no sale de la lista de forks activos. Cada fork cuenta una vez, por su nombre completo sin distinguir mayúsculas, en la semana en que se vio primero; sin nombre, cada actividad cuenta sola. Con el interruptor «Mostrar forks» apagado (o `?forks=0`) la línea no sale, y sin forks en las dos semanas tampoco. La demo trae un fork de hace uno o dos días, así que se ve sin token. Las estrellas nuevas usan ahora el mismo cálculo de la diferencia.
- **Pruebas que fallan sin la capacidad:** `node --test tools/health.test.mjs` («forks nuevos: la semana actual frente a la anterior, cada fork una vez y sin consultas», con forks fabricados de dos semanas, uno repetido con otras mayúsculas, uno sin nombre, uno sin hora, uno en el futuro, uno de hace 15 días y la lista de forks activos que no cuenta) falla sin el cambio de `js/health.js`; el smoke («la demo trae un fork…»: la línea `#hl-forks-trend` con su formato y que se va con el interruptor apagado).
- README: Salud del repo (los forks nuevos de la semana), la estructura (`js/health.js`) y Límites conocidos (de dónde salen: solo GitHub y la demo emiten forks; un fork borrado no resta); Seguridad sin cambios (la línea lleva solo cifras, escapada con `U.esc`; el nombre del fork es solo la clave del conteo).
- QA: el panel de salud de la demo con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px y en ar y ta a 390 px (la línea traducida, `scrollWidth` igual al ancho, se va con el interruptor apagado, sin errores de consola); texto nuevo en los 40 idiomas (`health.forksNew`); auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: una cuenta más en un panel propio con lo ya cargado, sin dominio externo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (contar las actividades «fork» por semana, como ya se hace con las estrellas).
- OMC: plan=— · revisión=2 hallazgos (2 arreglados: los LOW del fork inicial de la demo, que era de una cuenta que también hace forks en vivo y tapaba los suyos, y su comentario) · verificación=PASS
- Replica: paridad, sin pasada nueva (must hechos 13 de 13); la hoja se repuso hasta 15 con los ítems 195 a 200, entregas nuevas de las fuentes de la investigación del 2026-10-13 (no quedaban candidatas sin ítem)
- Reclamo: loop/268, sin colisión
- Validado: 680 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. La primera corrida falló en un paso ajeno del smoke («la ficha de un commit de agente…», intermitente: anotado en el pendiente 2 [Deuda]); la segunda pasó.
- **Siguiente:** iteración 269, expansión: ítem 185 (Práctica: branch -c, Público)

### 2026-11-12 · Iteración 269 · Expansión · Público

- **Capacidad nueva: copiar ramas en la práctica de git** (ítem 185 de la hoja de ruta, parte del ítem 16). `branch -c [vieja] <nueva>` (o `--copy`) crea otra rama en el mismo commit que la vieja (sin la vieja, la actual), sin mover HEAD ni anotar nada en el `reflog`; la copia sigue sola (un commit en ella no mueve la original) y el grafo y el panel de actividad la muestran como una rama nueva. `-C` (o `-c -f`) pisa una rama que ya existe, salvo la que está en uso o la de un rebase a medias; copiar una rama sobre sí misma no hace nada, como en git. Desprendido sin vieja, un repo vacío, una rama que no existe, un nombre inválido, una repetida sin `-C`, demasiadas ramas, la rama de un rebase a medias y `-c` junto a `-d` o `-m` se niegan con los mensajes de git sin tocar nada. `help` lo lista.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs`: «branch -c copia una rama (la actual si no se dice cuál) con sus commits, sin mover HEAD ni el reflog» y «branch -c se niega como git sin tocar nada» fallan sin el cambio de `js/gitsim.js`.
- README: «Aprender git» (`branch -c`, `--copy` y `-C`), Pruebas y Límites conocidos (copia solo la rama, sin su reflog ni su configuración, en lugar de «no hay `branch -c`»); Seguridad sin cambios (sin texto de afuera ni red; los nombres pasan por `validName` y la terminal los muestra con `textContent`).
- QA: la terminal de la práctica (`?practice=1`) con Playwright contra `node e2e/serve.mjs 4173` en es a 1280 px: `branch -c respaldo` (el grafo y el panel de actividad muestran «Rama respaldo creada», HEAD sigue en main), `branch -c respaldo "<b>x</b>"` (el error, con el `<b>` como texto), `branch -c main` (en ese momento, sin cambios), `branch`, `reflog` sin entrada nueva, `log --oneline` con `(HEAD -> main, respaldo)` y `help`, sin errores de consola; auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: un subcomando más en un simulador propio, sin dominio externo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (otra entrada en el mapa de ramas con el mismo sha, como `renameBranch` sin borrar la vieja).
- OMC: plan=— · revisión=7 hallazgos (4 arreglados: los MEDIUM de la copia sobre sí misma, que se negaba y en git no hace nada, de la rama de un rebase a medias, que se copiaba y git la niega, y del comentario de la prueba sin aserción, y el LOW del mensaje «too many branches»; quedan los LOW de la línea de uso corta, como la de `-m`, de las banderas pegadas `-cf`, que ya era así, y de la rama llamada `HEAD`, que va al pendiente 22) · verificación=PASS
- Reclamo: loop/269, sin colisión
- Validado: 682 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. La segunda corrida falló en `node --test` («IMPROVEMENTS.md real») porque la entrada se escribió mientras corría; la tercera, con el arreglo de la revisión y la entrada terminada, pasó.
- **Siguiente:** iteración 270, expansión: ítem 189 (Resumen de la semana: quién cerró más issues, Salidas)

### 2026-11-12 · Iteración 270 · Expansión · Salidas

- **Capacidad nueva: quién cerró más issues en el resumen de la semana** (ítem 189 de la hoja de ruta, parte del ítem 23). El resumen de la semana de un repo dice, debajo de los issues cerrados, quién cerró más (hasta 5 cuentas), en el Markdown, el `.md` y la imagen `.png`. Cada issue cuenta una vez, para el autor de su actividad «issue cerrado» más nueva de la semana (uno cerrado, reabierto y cerrado otra vez por otra persona cuenta para quien lo dejó cerrado); sin autor no suma, y lo que no es un issue cerrado (un issue abierto, un PR cerrado) no entra. Sale con lo ya cargado, sin consultas; la demo cierra el #84 con autor, así que se ve sin token. Texto nuevo en los 40 idiomas (`digest.closers`). El de la organización todavía no lo suma: queda como ítem 201.
- **Pruebas que fallan sin la capacidad:** `node --test tools/digest.test.mjs` («quién cerró más issues: cuenta los issues cerrados de la semana por quien los cerró…», con issues cerrados fabricados de dos semanas, uno reabierto y cerrado por otra cuenta, la misma actividad dos veces, uno sin autor, un nombre con `*`, un issue abierto y un PR cerrado que no cuentan) falla sin el cambio de `js/digest.js`; el smoke (la línea «quién cerró más» de la demo, debajo del #84).
- README: Salud del repo (el resumen con «quién cerró más»), la estructura (`js/digest.js`) y Límites conocidos (de qué actividad sale, quién se lo lleva si se reabrió y que el de la organización no lo suma); Seguridad sin cambios (sin consultas; los nombres pasan por `md()` y la imagen los dibuja en un canvas).
- QA: el resumen de la semana de la demo con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px y en ar y ta a 390 px (la línea traducida debajo de «Issues cerrados», `scrollWidth` igual al ancho, sin errores de consola); auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: una línea más en un resumen en Markdown y canvas que ya existe, sin dominio nuevo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (contar por cuenta los cierres de cada issue, como ya se hace con quién abrió más).
- OMC: plan=— · revisión=3 hallazgos (1 arreglado: el LOW del smoke, que no comprobaba el orden si faltaba el #84; quedan el LOW de la ventana de la semana repetida a mano, como en quién abrió más, y el de la fila del Mapa de alcance, que es este paso) · verificación=PASS
- Reclamo: loop/270, sin colisión
- Validado: 683 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 271, mantenimiento · Seguridad: pendiente 14 (Avisos a Slack (`electron/webhooks.js`, `payload`): `slackText` escapa `&`, `<`…)

### 2026-11-12 · Iteración 271 · Mantenimiento · Seguridad

- **Arreglo: los avisos a Slack ya no dejan que un texto de GitHub dé formato** (pendiente 14). `mrkdwn` no tiene cómo escapar `*`, `_`, `~` ni `` ` `` (la guía de formato de Slack manda a los objetos `plain_text`), así que el aviso a un webhook entrante (`/services/`) va en bloques: el repo y el tipo en un `header`, el título en una `section` y el detalle en un `context`, todos `plain_text` con `emoji: false`; el único `mrkdwn` es `<enlace>`. El `text` sigue, escapado, como respaldo para las notificaciones. Un webhook de Workflow Builder (`/workflows/`, `/triggers/`) recibe solo `{text}`, porque espera variables de texto. De la revisión de seguridad: `link()` validaba solo los primeros 500 caracteres y devolvía la URL entera, así que lo que pasara de ahí (`> <!channel> *x*`) cerraba el `<enlace>` y mencionaba al canal en Slack (y en Discord quedaba en el cuerpo); ahora se valida entera y una más larga no va. Un texto de puros espacios ya no arma un bloque vacío que Slack rechazaría.
- **Reproducción:** `node --test tools/webhooks.test.mjs` → sin el arreglo, `not ok 9 - Slack: un texto de GitHub sale sin formato mrkdwn (bloques plain_text) y el enlace sigue` (`el aviso lleva bloques`).
- **Pruebas que fallan sin el arreglo:** `tools/webhooks.test.mjs`: «Slack: un texto de GitHub sale sin formato mrkdwn…», «Slack: send manda bloques a un webhook entrante y solo texto a uno de Workflow Builder» y «una URL larga se valida entera: lo que pasa del carácter 500 no cierra el enlace ni menciona».
- README: Pruebas (el cuerpo de cada servicio, sin formato de un texto de GitHub), Límites conocidos (al flujo de Workflow Builder solo le llega el texto) y Seguridad (cómo se escapa cada servicio, los bloques `plain_text` de Slack).
- QA: sin cambios en la página; la e2e de escritorio («Enviar prueba» a un webhook local que hace de Slack) sigue en verde con el cuerpo nuevo; auditoría: no toca la página. Sin un webhook real no se pudo mirar cómo los muestra Slack: va al pendiente 22.
- Skills: no aplica: un cambio del cuerpo JSON de un webhook, con la guía oficial de formato de Slack consultada directamente; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma documentada (Slack no tiene escape para `mrkdwn`; lo que no se formatea es `plain_text`).
- OMC: plan=— · revisión=8 hallazgos (2 arreglados: el MEDIUM de seguridad de `link()` con la URL de más de 500 caracteres, que ya estaba antes del cambio, y el LOW de los textos de puros espacios; 2 MEDIUM de confianza baja, las entidades en `plain_text` y el formato en Workflow Builder, al pendiente 22 y a Límites conocidos; quedan los LOW del corte dentro de un emoji, como el de `str()`, del bucle de `fit`, del respaldo sin formato propio y de la detección de Workflow Builder, que no abre nada si se evade) · verificación=PASS
- Reclamo: loop/271, sin colisión
- Validado: 686 pruebas (`node --test`), smoke, i18n (0 errores) y 29 e2e en verde.
- **Siguiente:** iteración 272, expansión: ítem 188 (Vista de texto: PRs con CI fallido, Público)

### 2026-11-12 · Iteración 272 · Expansión · Público

- **Capacidad nueva: los PRs abiertos con el CI fallando en la vista de texto** (ítem 188 de la hoja de ruta, parte del ítem 110). Debajo del árbol, una lista aparte, «PRs abiertos con CI fallando: n», trae los PRs abiertos ya cargados cuyo último CI falló (hasta 20, el de número mayor primero), cada uno dicho como «#38 título, rama fix/rate-limit»; con una dirección `https://` es un enlace al PR y sin ella (la demo), solo texto. El estado es el del PR o, si la fuente no lo dio y la rama es del mismo repo, el de la cabeza de su rama: la regla de «checks en rojo» de la salud. La región viva los cuenta al abrir. Sin consultas nuevas; la demo arranca con el #38 en rojo, así que se ve sin token. Textos nuevos en los 40 idiomas (`textview.ciPulls`, `textview.ciPull`).
- **Pruebas que fallan sin la capacidad:** `node --test tools/textview.test.mjs` («lista los PRs abiertos con el último CI en rojo (el del PR o, si no lo trae, el de su rama), sin consultas», con CI simulado: rojo propio, rojo de la rama, verde propio sobre rama roja, un fork, en curso, sin número y el tope de 20) falla sin el cambio de `js/textview.js`; el smoke (la lista montada con PRs fijos: enlace solo con https, un título con `<img onerror>` como texto, fuera del árbol y contada por la región viva; y la de la demo).
- README: la Vista de texto en la lista de funciones, Límites conocidos (de dónde sale el estado, los PRs de forks, los 50 ya cargados, que los filtros por nombre y por ruta no la acortan y que un borrador en rojo entra) y Seguridad (el enlace solo con `https://` y `rel="noopener noreferrer"`, el título como texto).
- QA: demo sin token, 40 idiomas y derecha a izquierda, teclado y lector de pantalla, celular angosto y consola: la vista de texto de la demo (`?demo=1&vista=texto`) con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px y en ar y ta a 390 px (el título y la fila traducidos, la sección fuera del árbol con su `h3`, sin desborde, Tab llega a los enlaces sin caer a `<body>`, sin errores de consola); web y escritorio comparten la página (e2e en verde); auditoría: 0 hallazgos nuevos, 0 conocidos.
- Skills: no aplica: una lista más en una vista que ya existe, con el patrón de los forks; lo cubren las reglas del repo y el Protocolo de QA.
- Arena: no aplica: una sola forma obvia (la regla de CI de un PR ya está en la salud y la lista aparte, en los forks).
- OMC: plan=— · revisión=5 hallazgos (3 arreglados: los LOW del CSS repetido, de la fila sin rama y de Límites conocidos sin el filtro por ruta ni los borradores; quedan el LOW del enlace que abre otra pestaña sin decirlo, como el de los forks, y el de un PR sin título, que sale «#5 , rama x») · verificación=PASS
- Reclamo: loop/272, sin colisión
- Validado: 687 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. La primera corrida falló en dos pasos del smoke por el propio cambio (la ✗ de la lista llevaba la clase que el smoke busca dentro del árbol, y la región viva sumaba la cuenta nueva); la segunda, con eso arreglado, pasó.
- **Siguiente:** iteración 273, expansión: ítem 190 (Práctica: git show, Público)

### 2026-11-12 · Iteración 273 · Expansión · Público

- **Capacidad nueva: `git show` en la práctica de git** (ítem 190 de la hoja de ruta, parte del ítem 16). `show [<commit>...]` imprime la cabecera de un commit como el `log` (el sha entero con sus ramas y etiquetas, `Merge:` con los dos padres si es una fusión, el autor y el mensaje) y sus archivos como `--stat` sin contenido (cada uno «new», «changed» o «deleted» y cuántos son), sin mover HEAD ni anotar nada en el `reflog`. Sin commit es HEAD; acepta `HEAD~1`, un sha corto, una rama, una etiqueta (la anotada sale antes con su mensaje) y varios a la vez. `--name-only` y `--name-status` (A, M, D) como git, `-s` (`--no-patch`) calla los archivos y `--oneline` acorta la cabecera. Para saber qué es nuevo, cada commit anota ahora lo que entró preparado como nuevo (`add` de un archivo sin seguir o el nombre nuevo de un `git mv`), y `commit --amend`, `rebase` y `cherry-pick` lo conservan. Un sha que no existe, una opción desconocida, `-p` (no hay contenido), las rutas tras `--` y un repo vacío se niegan con los mensajes de git sin imprimir ningún commit. `help` lo lista. Sin textos nuevos de la interfaz: la salida es la de git, en inglés.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs`: «show imprime el sha, el mensaje y los archivos de un commit (HEAD sin otro) sin mover nada» (HEAD, `HEAD~1 -s`, un sha corto con `--name-status`, `--oneline --name-only`, `-s` seguido de `--name-status`, dos commits, una etiqueta anotada y una ligera, un `git mv`, un archivo nuevo cambiado después, un merge, y las ramas, HEAD y el `reflog` quietos) y «show se niega como git: un sha que no existe, opciones desconocidas, -p sin contenido y un repo vacío» (también `-3` y un archivo creado y borrado en un `--amend`, que no sale como borrado) fallan sin el cambio de `js/gitsim.js`.
- README: «Aprender git» (`show` y sus formas), Pruebas y Límites conocidos (sin diff ni fecha, lo nuevo es solo lo que entró preparado como nuevo, el renombre como borrado y nuevo, el merge con lo de su propio commit); Seguridad sin cambios (sin texto de afuera ni red; la terminal muestra la salida con `textContent`).
- QA: la terminal de la práctica (`?practice=1`) con Playwright contra `node e2e/serve.mjs 4173` en es a 1280 px: `commit -m "<b>x</b>"` y `show` (el mensaje con el `<b>` como texto, `app.js | changed`), `show HEAD~1 --name-status`, `show nada` (el error de git) y `show -s --oneline HEAD HEAD~1`, sin errores de consola; auditoría: 0 hallazgos nuevos, 0 conocidos
- Skills: no aplica: un subcomando más en un simulador propio, sin dominio externo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la cabecera del `log` y la lista de archivos de `stash show`, que ahora comparten `fileLines`).
- OMC: plan=— · revisión=7 hallazgos (4 arreglados: el LOW del `D` fantasma de un archivo creado y borrado con `git rm` en un `--amend`, el de la sangría del mensaje de una etiqueta anotada, el de `-s` que ganaba a un `--name-status` posterior y el de `show -3` como referencia; los 2 MEDIUM, el archivo nuevo que vuelve de un `stash pop` como cambiado y el commit de `revert` sin archivos, a Límites conocidos (el stash ya devolvía todo como cambiado y el revert nunca anotó archivos); queda el LOW del renombre como D y A, ya en Límites, y el de un `git mv` dentro de un `--amend` sobre un archivo que el commit creó) · verificación=PASS
- Reclamo: loop/273, sin colisión
- Validado: 714 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 274, expansión: ítem 193 (Columnas de SHA, autor y fecha en el grafo 3D, Análisis)

### 2026-11-12 · Iteración 274 · Expansión · Análisis

- **Capacidad nueva: las columnas de SHA, autor y fecha en el grafo 3D** (ítem 193 de la hoja de ruta, parte de «Columnas de autor fecha y SHA a la vista en el grafo» de Replica). El interruptor «Mostrar SHA, autor y fecha junto a cada commit» de la lupa (el mismo del 2D, que ya no dice «grafo 2D» en ninguno de los 40 idiomas) rotula también en el 3D: los rótulos que salen junto a los commits cercanos a la cámara llevan, bajo el mensaje, un renglón «SHA corto · Autor · fecha» (un commit sin mensaje lleva solo ese renglón), también en el modo TV y en la demo, con lo ya cargado y sin consultas. Cada parte va en su `<bdi>` y el renglón en orden de izquierda a derecha, así una fecha en árabe no desordena el SHA; el autor se corta a 24 caracteres. El texto se arma una vez por commit (y otra al cambiar de idioma), no por cuadro, y con el interruptor apagado no se arma nada. La fila de `replica/features.csv` pasa de `partial` a `yes`.
- **Pruebas que fallan sin la capacidad:** el paso del smoke «el interruptor de columnas también pone «SHA · autor · fecha» bajo el mensaje de los commits cercanos del 3D, se recuerda y al apagarlo se quitan» (sección «Columnas de SHA, autor y fecha en el 3D»: sin el cambio de `js/graph3d.js` da `page.waitForFunction: Timeout`) y `node --test tools/search.test.mjs` («columnParts da [SHA corto, autor, fecha] con cada parte en su lugar, vacía si falta»).
- README: «Búsqueda de commits» en la lista de funciones (el interruptor también en el 3D), Límites conocidos (en el 3D solo los commits cercanos, hasta 14 y no en el espacio de galaxias ni el de la ficha abierta; el recorte del autor) y Seguridad (entran al 2D y al 3D con `textContent`).
- QA: 2D y 3D, modo TV, demo sin token, 40 idiomas y derecha a izquierda, celular angosto, consola y rendimiento: la demo en 3D con Playwright contra `node e2e/serve.mjs 4173`, con las columnas encendidas y la cámara cerca de una punta de rama, en es, ar y ta a 1280 px, en modo TV a 1920 px y en es a 390 px: el renglón bajo cada mensaje (30 px de alto, 38 en TV), ningún rótulo pisa a otro ni se sale del ancho, la fecha en árabe y en tamil entera tras el SHA y el autor, y 0 errores de consola; por cuadro solo se compara un texto por rótulo (los `<bdi>` se crean una vez por rótulo); teclado y lector de pantalla: los rótulos siguen `aria-hidden` (la ficha del commit ya dice lo mismo) y el interruptor es el de siempre; auditoría: 0 hallazgos nuevos, 0 conocidos
- Skills: no aplica: un renglón más en los rótulos que el 3D ya dibuja, con el texto del 2D; lo cubren las reglas del repo y el Protocolo de QA.
- Arena: no aplica: una sola forma obvia (los rótulos de los commits cercanos ya existen, con su grilla contra choques; un sprite por commit en la escena haría más lenta la carga de quien no lo usa).
- OMC: plan=— · revisión=4 hallazgos (4 arreglados: el MEDIUM de los `<bdi>` creados de nuevo cuando un rótulo cambiaba de commit al moverse la cámara, ahora creados una vez por rótulo; los LOW del autor con « · » que se partía (las partes salen de `columnParts`, sin partir el texto unido), del paso del smoke que podía medir con la cámara en viaje o con listas vacías, y del orden de las partes en árabe y hebreo, ahora fijo como en el 2D) · verificación=PASS
- Reclamo: loop/274, sin colisión
- Validado: 715 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. La puerta anterior, antes de los arreglos de la revisión, también dio verde con un paso ajeno intermitente («la ficha de un commit de agente…», en verde al repetir su sección: anotado en el pendiente 2 [Deuda]).
- **Siguiente:** iteración 275, mantenimiento · Deuda: pendiente 1 (El paso del smoke «abre la vista de texto con el filtro por ruta y el ?q= aplic…)

### 2026-11-12 · Iteración 275 · Mantenimiento · Deuda

- **Arreglo: el smoke ya no deja contextos del navegador vivos entre secciones** (pendiente 1, el paso «abre la vista de texto con el filtro por ruta y el ?q= aplicados…» que en la iteración 236 se quedó sin `js/i18n.js` por `net::ERR_INSUFFICIENT_RESOURCES`). Medido antes: con un contador al entrar en cada sección, el smoke entero dejaba un contexto vivo desde «Codeberg» hasta el final; era el del paso «group:g sigue los proyectos del grupo de GitLab…», que cerraba su página (`other.close()`) y no su contexto. Sin páginas, ese contexto mantenía el service worker de la app en un proceso más de Chromium durante 7 de los 11 minutos (de 8 a 9 procesos, unos 40 descriptores y ~200 MB más), justo cuando el equipo cargado se queda sin recursos. Ahora el paso cierra su contexto entero, también si falla (`try`/`finally`), y el smoke tiene una guarda: al entrar en cada sección y al terminar, un contexto que siga abierto es un fallo («cierra sus contextos del navegador») de la sección que lo dejó, y se cierra. Ningún otro `openPage` se cerraba solo por la página (los 52 revisados con `grep`); el de «?all=1&tv=1…» (sección «Varios repos a la vez») preparaba sus rutas fuera de su `try` y ahora dentro, para que un fallo ahí tampoco deje el contexto vivo. Lo que no se reprodujo: el `ERR_INSUFFICIENT_RESOURCES` mismo, que dependía de la carga de otras sesiones en el equipo; si vuelve con la guarda en verde, la causa es otra y se carga un pendiente nuevo con esa línea.
- **Reproducción:** `node tools/smoke.mjs` con un contador de `browser.contexts()` al entrar en cada sección → `1 contextos, 0 páginas · 9 procs 200 fds 849 MB` desde «Codeberg» hasta «Celular (390×844), 3 idiomas» (antes de «GitLab», 0 contextos y 8 procesos).
- **Pruebas que fallan sin el arreglo:** la guarda nueva del smoke: `node tools/smoke.mjs --seccion GitLab` con el `other.close()` de antes → `✗ la sección «GitLab» dejó 1 contexto(s) del navegador sin cerrar (0 página(s))` (§ GitLab · cierra sus contextos del navegador); con el arreglo, las secciones «GitLab» y «Vista de texto desde la URL (?vista=texto)» juntas, 3 de 3 en verde.
- README: sin cambios (una herramienta de prueba, sin función ni límite nuevo para quien usa la app).
- QA: no toca la página ni el escritorio (solo `tools/smoke.mjs`); el smoke entero corre en la puerta con la guarda; auditoría: no toca la página
- Skills: no aplica: el ciclo de vida de los contextos de Playwright en una herramienta del repo, ya cubierto por el protocolo de Deuda.
- Arena: no aplica: una sola forma obvia (cerrar el contexto que se abrió y vigilar que ninguna sección deje uno).
- OMC: plan=— · revisión=3 hallazgos LOW, APPROVE (2 arreglados: las rutas de «?all=1&tv=1…» fuera del `try` y el mensaje de la guarda, que ahora nombra la sección; queda el cierre sin `await` del contexto que sobró, unos segundos de superposición y solo cuando ya hubo un fallo) · verificación=PASS
- Reclamo: loop/275, sin colisión
- Validado: 715 pruebas (`node --test`), smoke (intermitente, en verde al repetir su sección: «la ficha de un commit de agente dice cuál es, con su modelo y su sesi…»), i18n (0 errores) en verde; e2e no corridas (no toca la página ni el escritorio). El paso ajeno queda anotado en su pendiente 1 [Deuda]; la puerta anterior, antes de los arreglos de la revisión, dio verde sin intermitentes.
- **Siguiente:** iteración 276, expansión: ítem 191 (Práctica: git diff, Público)

### 2026-11-12 · Iteración 276 · Expansión · Público

- **Capacidad nueva: `git diff` en la práctica de git** (ítem 191 de la hoja de ruta, parte del ítem 16). `diff` lista los archivos cambiados o borrados sin preparar (lo que `touch`, `rm` o un cambio tras `add` dejan fuera del índice) y `diff --staged` (o `--cached`) los preparados contra HEAD, con lo que entró como nuevo marcado nuevo; los dos sin mover HEAD, el `reflog` ni lo preparado. Sin contenido no hay parche: a secas cada archivo va como en `--stat` de `show` («new», «changed» o «deleted» y cuántos son), y `--name-only` y `--name-status` (A, M, D) como git, ganando el último formato. Los archivos sin seguir no salen, como en git; un archivo preparado y cambiado otra vez sale en los dos; un `git mv` preparado, como un borrado y un nuevo (igual que en `show`); `rm --cached`, como borrado preparado. Con rutas (tras `--`, o a secas si la práctica conoce el archivo; `.` siempre) solo esas; el nombre viejo de un `git mv` que se vuelve a crear y preparar sale cambiado, no borrado y nuevo. `-p`, una opción desconocida, un commit o un rango (`diff HEAD`, `diff main`, `diff main..HEAD`) y una ruta a secas que no existe se niegan con los mensajes de git; en un repo vacío funciona y `HEAD` no existe. `help` lo lista. Sin textos nuevos de la interfaz: la salida es la de git, en inglés.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs`: «diff lista los archivos cambiados sin preparar y diff --staged los preparados, sin tocar nada» (antes y después de `add`, `--cached`, los formatos, un archivo en los dos, rutas, `git mv`, `rm --cached` y el estado quieto) y «diff se niega como git: opciones desconocidas, -p sin contenido, un commit y una ruta que no existe» (también un rango y un repo vacío, con `diff .`) fallan sin el cambio de `js/gitsim.js` (68 de 70 en verde).
- README: «Aprender git» (`diff` y sus formas), Pruebas y Límites conocidos (sin parche ni líneas, no compara commits, el renombre como borrado y nuevo, sin `--quiet`, `--exit-code` ni `--word-diff`, la ruta a secas tiene que ser conocida, `--staged` no lista lo que trae un `merge --no-commit`, un `cherry-pick -n` o un `revert -n` ni lo de un `reset --soft`, y lo nuevo de un `stash pop` sale cambiado; «no hay `diff`» del árbol de trabajo corregido); Seguridad sin cambios (sin texto de afuera ni red; la terminal muestra la salida con `textContent`).
- QA: la terminal de la práctica (`?practice=1`) con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px y en ar a 390 px: `touch app.js`, `touch --new nuevo.txt`, `diff` (`app.js | changed`), `add .`, `diff` vacío, `diff --staged --name-status` (`M app.js`, `A nuevo.txt`), `diff HEAD` y `diff -p` con sus errores, sin desborde ni errores de consola; auditoría: 0 hallazgos nuevos, 0 conocidos
- Skills: no aplica: un subcomando más en un simulador propio, sin dominio externo; lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (las listas del índice y del árbol ya existen, y `fileLines` ya da los formatos de `show` y `stash show`).
- OMC: plan=— · revisión=8 hallazgos, ninguno CRITICAL ni HIGH (5 arreglados: el MEDIUM del nombre viejo de un `git mv` recreado que salía D y A a la vez, y los LOW del rango con el error de «unknown revision», de `diff .` en un repo vacío, del comentario de `untrackedDir` fuera de lugar con su lista repetida (ahora `knownNames`) y de `reset --soft` sin decir en Límites; los MEDIUM de `--staged` vacío a mitad de un `merge --no-commit`, `cherry-pick -n` o `revert -n` y de lo nuevo de un `stash pop` como cambiado, a Límites conocidos (la fusión a medias no tiene archivos y el stash ya lo devolvía así); queda el LOW de `--name-only` con `--name-status`, que gana el último en vez de negarse como git reciente) · verificación=PASS
- Reclamo: loop/276, sin colisión
- Validado: 717 pruebas (`node --test`), smoke (intermitente, en verde al repetir su sección: «la ficha de un commit de agente dice cuál es, con su modelo y su sesi…»), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. El paso ajeno queda anotado en su pendiente 1 [Deuda]; la puerta anterior, antes de los arreglos de la revisión, dio verde sin intermitentes.
- **Siguiente:** iteración 277, expansión: ítem 194 (Salud del repo: autores nuevos por semana, Análisis)

### 2026-11-12 · Iteración 277 · Expansión · Análisis

- **Capacidad nueva: los autores nuevos por semana en la salud del repo** (ítem 194 de la hoja de ruta, parte del ítem 12). Entre las series de las últimas 8 semanas, «Autores nuevos por semana (primer commit cargado)» cuenta cuántas personas firmaron esa semana su primer commit de los cargados: cada persona una sola vez, en la semana de su primer commit, con la misma clave que los autores distintos (su usuario o, sin él, su nombre sin distinguir mayúsculas); quien firmó por primera vez antes de las 8 semanas, un commit sin autor, sin fecha o con fecha futura no suman. Sin consultas, con los commits ya cargados; en la demo, 8 esta semana. Dice cuántas personas, nunca quiénes.
- **Pruebas que fallan sin la capacidad:** `node --test tools/health.test.mjs`: «autores nuevos por semana: cada persona cuenta una vez, en la semana de su primer commit cargado» (sin el cambio, `h.pace.newAuthorWeeks` no existe) y el ritmo de «salud: listas y ritmo…» con `newAuthorWeeks`; el paso del smoke «salud del repo: listas y ritmo de lo ya cargado…» pide la línea `#hl-newauthorweeks` con 8 cifras, alguna distinta de cero, y nunca más nuevos que distintos en una semana.
- README: «Salud del repo» en la lista de funciones (los autores nuevos por semana) y Límites conocidos (con historia sin cargar alguien que ya había firmado sale como nuevo; quien empezó hace más de 8 semanas no suma; la fecha futura no cuenta); Seguridad sin cambios (una cifra más, escapada como las demás).
- QA: la salud de la demo con Playwright contra `node e2e/serve.mjs 4173`, en es y ar a 1280 px: la línea nueva bajo «Autores distintos por semana», dentro del grupo con su encabezado, sin errores de consola; 40 idiomas con `node tools/check-i18n.mjs`; auditoría: la de la puerta.
- Skills: no aplica: una serie más en un panel propio, con la clave de autor que ya existe; lo cubren las reglas del repo y el Protocolo de QA.
- Arena: no aplica: una sola forma obvia (el primer commit cargado de cada autor, contado con el `weekly` de las demás series).
- OMC: plan=— · revisión=3 hallazgos LOW, APPROVE (1 arreglado: la clave de autor, repetida en los autores distintos y en los nuevos, sale a `authorKey` para que nunca den más nuevos que distintos; quedan la misma persona con usuario en un commit y solo nombre en otro, que cuenta dos veces como ya decía Límites conocidos, y el paréntesis «primer commit cargado», breve a propósito) · verificación=PASS
- Replica: paridad, sin pasada nueva: 94,5/100, must hechos 13 de 13; la hoja se repuso hasta 15 con los ítems 202 a 207, de una investigación nueva del 2026-11-12 (CHAOSS, Git Truck, Oh My Git!, Insights de GitHub y OSS Insight): cinco de alcance 2 (202 a 206).
- Reclamo: loop/277, sin colisión
- Validado: 718 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. La puerta anterior, antes del arreglo de la revisión, también dio verde.
- **Siguiente:** iteración 278, expansión: ítem 203 (Práctica: un remoto con push y fetch, Público)

### 2026-11-12 · Iteración 278 · Expansión · Público

- **Capacidad nueva: un remoto `origin` simulado con `push` y `fetch` en la práctica de git** (ítem 203 de la hoja de ruta, parte del ítem 16; primera entrega). El repo de práctica parte como recién clonado: el remoto tiene `main` y `main` lo sigue. `push` sube la rama actual (`push origin <rama>`, `-u` para dejarla siguiendo a su par, `-f` para pisar) y se rechaza con el «fetch first» o el «non-fast-forward» de git si el remoto tiene trabajo que aquí falta, sin tocarlo; sin `-u` ni rama que seguir pide `--set-upstream` como git. `fetch` copia lo del remoto a `origin/<rama>` sin mover las ramas propias, con la tabla de git. `status` dice si la rama va al día, por delante, por detrás o divergida de `origin/<rama>`. Las ramas `origin/…` salen en el grafo de la práctica (marcadas `remote`), en las decoraciones del `log` y de `show`, en `branch -r` y `-a`, y se resuelven en `merge` (con «Merge remote-tracking branch»), `rebase`, `reset`, `checkout` y `log` (que ahora acepta un ref y `--all`); `checkout`/`switch` de una rama que solo está en el remoto la crea siguiéndola, `branch -m` lleva la rama que sigue y `-d` la olvida. Ejercicio guiado 14 (`?practice=14`): Ana subió un arreglo a `origin/main`, el `push` del commit propio se rechaza, `fetch`, `merge origin/main` (o `rebase`) y `push`; `push -f` o `reset --hard origin/main` no lo resuelven. Los ejercicios propios ganan la condición `pushed:rama`. Un repo sin remoto (vacío, o el ensayo de un repo real) niega `push` y `fetch` como git. Textos nuevos (título y meta del ejercicio, y `pushed:branch` en la ayuda de las condiciones) en los 40 idiomas. Lo que falta (`pull`, `push --delete`, `fetch --prune`, commits ajenos en un ejercicio propio) queda como ítem 208.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs`: «el remoto: push sube la rama, fetch trae lo ajeno y status dice el adelanto y el atraso», «push de una rama nueva: pide -u, la sigue después y fetch, checkout y switch la conocen», «push y fetch se niegan como git…» (con la condición `pushed:`), el ejercicio 14 en «cada ejercicio parte sin resolver…» y sus atajos en «un ejercicio no se da por resuelto con el atajo equivocado», `origin/main` en el grafo de la fuente de práctica y `?practice=14` en la URL; el paso del smoke «el ejercicio de push y fetch: el remoto rechaza el push, fetch trae origin/main al grafo y se resuelve». Las pruebas viejas de `status`, `log` y `show` sobre un ejercicio piden ahora la línea de seguimiento y la decoración `origin/main`, como git (una ayuda `body` corta la cabecera exacta), y el paso del smoke que probaba un comando inexistente con `push` lo hace con `pull`.
- README: «Aprender git» (`push`, `fetch`, `status` con el remoto, las ramas `origin/…`, catorce ejercicios, `?practice=1` a `14`, la condición `pushed:`), Pruebas, Límites conocidos (un solo remoto, sin `remote add`, `pull`, `clone`, `push --delete`, refspecs ni `--prune`; lo ajeno en el remoto solo lo pone un ejercicio guiado; las ramas `origin/…` cuentan en «Ramas visibles» y el panel de actividad no avisa de `push` ni `fetch`; `branch -m` y `-c` con la rama que se sigue) y Seguridad (el remoto es otra lista en la misma memoria, no un servidor); `log <ref>` y `log --all` en «Aprender git».
- QA: la práctica (`?practice=14`) con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px y en ar a 390 px: `origin/main` en el grafo junto a `main`, `push` rechazado con «fetch first», `fetch` suma el commit de Ana al grafo (de 4 a 5 nodos), `status` divergido, `merge origin/main`, `push` y el ejercicio resuelto, sin desborde (390 px de ancho) ni errores de consola; 40 idiomas con `node tools/check-i18n.mjs`; auditoría: la de la puerta.
- Skills: no aplica: dos subcomandos más en un simulador propio, sin dominio externo; lo cubren las reglas del repo y el Protocolo de QA.
- Arena: no aplica: una sola forma obvia (el remoto como otro mapa de ramas sobre los mismos commits, y las de seguimiento como un mapa aparte, como en git).
- OMC: plan=— · revisión=11 hallazgos, ninguno CRITICAL (3 arreglados: el HIGH del paso nuevo del smoke, que buscaba en la terminal el mensaje del merge que `merge` no imprime —ahora lo mira en `log --oneline`—; el MEDIUM de `log`, que ignoraba el ref y `--all` y tras un `fetch` no mostraba lo traído —ahora `log origin/main` y `log --all`, con prueba—; y el MEDIUM de `push` a secas hacia una rama del remoto con otro nombre tras `branch -m`, que ahora se niega como git, con prueba; los LOW de `branch -d` sin mirar la rama subida, `checkout -b x origin/main` sin seguirla, `branch -c` sin copiarla, la falta de `origin/HEAD` y una rama local llamada `origin/…`, a Límites conocidos o sin cambios; seguridad: sin hallazgos) · verificación=PASS
- Reclamo: loop/278, sin colisión
- Validado: 721 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 279, mantenimiento · Errores: pendiente 3 (Salud del repo: la tendencia de estrellas (`stars` de `js/health.js`, sección `…)

### 2026-11-12 · Iteración 279 · Mantenimiento · Errores

- **Arreglo: la salud del repo ya no compara las estrellas y los forks nuevos con una semana anterior sin cargar** (pendiente 3). `compute` de `js/health.js` mira si la actividad cargada llega entera a la semana anterior (alguna, de cualquier tipo, de hace 14 días o más); si no, `stars.prev` y `forkTrend.prev` son `null` en vez de 0, y el panel dice solo la semana actual, «3 esta semana (la anterior no está cargada entera)», sin el «0 la anterior (+3)» que no se midió. El mismo patrón estaba en los forks nuevos (`#hl-forks-trend`), arreglado igual; las series de 8 semanas ya dicen en Límites conocidos que la historia sin cargar las deja cortas. Dos textos nuevos (`health.starsWeekOnly`, `health.forksNewOnly`) en los 40 idiomas. En la demo, cuya actividad no llega a dos semanas, las dos líneas pasan a la forma sin comparar.
- **Reproducción:** `node --test tools/health.test.mjs` sin el arreglo → `not ok 37 - estrellas y forks nuevos: sin actividad cargada de hace dos semanas, la semana anterior no se mide (null), no es 0` (sale `{ week: 3, prev: 0 }`).
- **Pruebas que fallan sin el arreglo:** esa prueba (solo 5 días cargados, una estrella de hace 10 días que deja la anterior a medias, una actividad de hace 14 días que sí la mide aunque sea 0, y actividades sin hora o futuras que no prueban nada); las dos pruebas viejas de estrellas y forks suman una actividad de hace 20 días para seguir midiendo la anterior, y el smoke de la salud acepta las dos formas de cada línea.
- README: «Salud del repo» (las líneas no comparan si la anterior no está cargada entera) y Límites conocidos (la regla de los 14 días y que un feed cortado dentro de la semana anterior aún puede dejarla corta); Seguridad sin cambios (texto propio, escapado como antes).
- QA: la salud de la demo con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px: «1 esta semana (la anterior no está cargada entera)» en estrellas y en forks nuevos, sin errores de consola; 40 idiomas con `node tools/check-i18n.mjs`; auditoría: la de la puerta.
- Skills: no aplica: un arreglo de una regla en un panel propio, sin dominio externo.
- Arena: no aplica: una sola forma obvia (la actividad más vieja cargada decide si la semana anterior está medida).
- OMC: plan=— · revisión=3 hallazgos, APPROVE, ninguno CRITICAL ni HIGH (0 arreglados: el MEDIUM de la semana actual, que tampoco avisa si está a medias, va como pendiente 21 [Errores]; el LOW de `fullPrev` con cualquier tipo de actividad, coherente mientras las actividades salgan del feed; el LOW del smoke que acepta las dos formas, cubiertas las dos por `node --test`) · verificación=PASS
- Reclamo: loop/279, sin colisión
- Validado: 722 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 280, expansión: ítem 202 (Salud del repo: factor de ausencia, Análisis)

### 2026-11-12 · Cambio de maquinaria: las guías del repo en el loop

- **Pedido de Benjamin:** adjuntar al repo las skills de su cuenta que le sirven y mejorar el loop para que las use.
  No es una iteración numerada y la proporción de la regla 2 no cambia.
- **Lo nuevo:** 15 skills de afuera copiadas en `.claude/skills/`, con su licencia y su registro
  (`.claude/skills/VENDORIZADAS.md`, en el commit anterior), y el mapa `.claude/skills/iteracion/GUIAS.md`, que la
  skill lee en el paso 2 con el ítem elegido: `test-driven-development` en cada expansión, `systematic-debugging` en
  el primer intento de un arreglo (y su `condition-based-waiting.md` en una intermitente; desde el segundo intento,
  `omc-tracer`), `modern-web-guidance` (sus guías locales, sin la CLI) en la página y `sw.js`, `chrome-extensions`
  en la extensión, `ux-copy` y `content-translation` en textos nuevos, `dataviz` en un gráfico, `technical-seo` y
  `schema-markup` en el `<head>`, `skill-creator` en una Deuda de la skill del loop, `accessibility-review` y
  `design-critique` en Accesibilidad y QA, y `verification-before-completion` antes de escribir «Pruebas que fallan
  sin…». `engineering-code-review`, `testing-strategy` y `on-page-seo` quedan de uso a mano, con su motivo. Entre las
  que se parecen, una para cada uso: la revisión sigue siendo la receta 2 de OMC. Desde esta entrada, cada iteración
  lleva `- Guías:` (R5: las skills del mapa que leyó, cada una con su para qué, o «ninguna: <por qué>»); R15 vigila
  que el mapa nombre skills que existen, que cada vendorizada tenga su paso o su motivo y que el registro diga la
  verdad del `SKILL.md` de cada copia (sha256 con finales LF, licencia, `disable-model-invocation: true`, su nombre y
  ninguna CLI `@latest` ni sin `DISABLE_TELEMETRY=1`). El comando de OpenCode las lee por ruta.
- **Comprobado:** inyectando cada violación en el repo, `node tools/loop.mjs --check` sale 1 con R15 en ERROR: el mapa
  con `design-critique-v2` («nombra la skill design-critique-v2 (línea 27), que no está…» y «design-critique está
  vendorizada y GUIAS.md no la cita…»), la fila de `ux-copy` quitada, `testing-strategy` de uso a mano sin motivo y la
  copia de `modern-web-guidance` vuelta a `@latest` («no es la copia registrada» y «corre una CLI sin versión fija»);
  la misma copia en CRLF, como la deja un clon de Windows, sale ok; restaurado, 0 errores. Con cada guarda nueva
  anulada (la vendorizada sin cita, el sha256, el CRLF, la skill de `- Guías:` fuera del mapa y la viñeta con algo
  que no es `<skill> (<para qué>)`), su prueba falla.
- **Pruebas que fallan sin el cambio:** `tools/loop.test.mjs` (de 116 a 123): `- Guías:` tras la marca (sin la
  viñeta, «ninguna» sin el porqué, sin `<skill> (<para qué>)`, una skill inventada o con el prefijo del plugin) y
  R15 (una skill del mapa que no existe, una vendorizada sin paso ni motivo, el registro sin mapa, la copia editada,
  borrada, sin licencia, que se dispara sola, con otro nombre, con una CLI `@latest` (también citada en la prosa) o
  con telemetría (`npx`, `bunx`, `pnpm dlx`), la copia en CRLF que sigue valiendo, y el repo real), más los
  protocolos de la skill, que ahora son cinco.
- OMC: no disponible (la sesión no tiene herramienta de subagentes); la revisión la hizo `code-review` (la de Claude
  Code, nivel medio) sobre el diff: 10 hallazgos, 7 arreglados (la viñeta tomaba cualquier palabra antes de un «(»
  y dejaba pasar una skill sin su para qué, R5 no pedía que estuviera en el mapa, el sha256 cambiaba en un clon de
  Windows, solo miraba `npx`, daba `@latest` por malo también en la prosa y leía dos veces cada copia); los
  archivos de apoyo fuera del sha256 quedan dichos en `VENDORIZADAS.md`, y dos no eran defectos.
- README: la carpeta de la skill (`GUIAS.md`), lo que vigila `--check` y el registro de las vendorizadas; `CLAUDE.md`
  apunta al mapa.
- Validado: 741 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 280, expansión: ítem 202 (Salud del repo: factor de ausencia, Análisis)

### 2026-11-13 · Iteración 280 · Expansión · Análisis

- **Capacidad nueva: el factor de ausencia en la salud del repo** (ítem 202 de la hoja de ruta). Debajo de las series por semana, una línea dice cuántas personas suman la mitad de los commits cargados (el «Contributor Absence Factor» de CHAOSS: de las que más commits firmaron a las que menos, hasta llegar a la mitad), de cuántos autores y en cuántos commits: «Personas que suman la mitad de los commits (factor de ausencia): 3 de 8 autores, en 23 commits cargados» en la demo. Una sola cifra, sin nombres ni cifras por persona, con la misma clave de autor que los autores por semana; los commits sin autor no entran ni en la mitad ni en el total, y sin ninguno con autor la línea no sale. `absenceFactor` en `js/health.js` (`compute(...).absence`), sin consultas. Texto nuevo (`health.absence`, sin plurales: las cifras van tras los dos puntos) en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/health.test.mjs`: «factor de ausencia: cuántas personas suman la mitad de los commits cargados (CHAOSS), sin nombres» (una autora con 3 de 5, con dos claves que son la misma, da 1; cuatro iguales dan 2, la mitad justa alcanza; los sin autor no cuentan; sin commits con autor, `null`); vista fallar antes de escribir `absenceFactor` (`not ok 39`) y pasar después. El paso del smoke de la salud pide `#hl-absence` con personas ≤ autores ≤ commits.
- README: «Salud del repo» (la línea y qué mide) y Límites conocidos (todos los commits cargados sin mirar la fecha, la misma persona con dos claves cuenta dos, los sin autor no entran); Seguridad sin cambios (texto propio con cifras, escapado como antes).
- QA: la salud de la demo (`?health=1`) con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px y en ar y ja a 390 px: la línea sale con 3 de 8 autores en 23 commits, sin desborde (ancho igual al de la ventana) ni errores de consola; 40 idiomas con `node tools/check-i18n.mjs`; auditoría: la de la puerta.
- Skills: no aplica: una cuenta más sobre los commits ya cargados en un panel propio; la métrica es de CHAOSS, citada en el ítem, y lo demás lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (ordenar las cuentas por autor y sumar hasta la mitad).
- Guías: test-driven-development (la prueba primero, vista fallar), ux-copy (lo que mide primero y el nombre de CHAOSS entre paréntesis), content-translation (el sentido en cada idioma, sin plurales), verification-before-completion (el ciclo rojo-verde de la prueba nueva)
- OMC: plan=— · revisión=4 hallazgos, APPROVE, ninguno CRITICAL, HIGH ni MEDIUM (0 arreglados: el LOW de `authorKey` sin `?.` no lo es, la clave ya usa `c?.author`; el LOW del regex del smoke con separador de miles, pendiente 22 [Deuda]; el LOW del paso que no comprueba que falten nombres, cubierto por la prueba de `node --test`, que solo devuelve cifras; el LOW del lugar de la línea, debajo de las series por semana como dice el README) · verificación=PASS
- Reclamo: loop/280, sin colisión
- Validado: 747 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 281, expansión: ítem 208 (Práctica: pull y borrar ramas del remoto, Público)

### 2026-11-13 · Iteración 281 · Expansión · Público

- **Capacidad nueva: `pull`, `push --delete` y `fetch --prune` en la práctica de git, y otra persona en el remoto de un ejercicio propio** (ítem 208 de la hoja de ruta, parte del ítem 203; segunda entrega del remoto simulado). `pull` hace el `fetch` y trae a la rama actual la que sigue (o `pull origin <rama>`): avanza rápido si puede y, si divergieron, se niega como git desde la 2.33 («Need to specify how to reconcile divergent branches», con el `fetch` ya hecho y dibujado) hasta que se pide `--no-rebase` (fusión «Merge branch 'main' of origin») o `--rebase`; `--ff-only` se niega si no avanza rápido; sin rama que seguir, desprendido, con cambios sin commit o con la rama borrada allá, los errores de git. `push origin --delete <rama>` (o `-d`, o `origin :<rama>`) la borra del remoto y su `origin/<rama>`; la rama propia queda y `status` dice «the upstream is gone»; la rama por defecto se niega como en GitHub. `fetch --prune` (`-p`) quita las `origin/<rama>` de lo borrado allá, con la línea `[deleted]` de git; a secas no poda. `pull --rebase` con cambios sin commit se niega antes de traer, y entre `--rebase` y `--no-rebase` gana la última, como en git; `HEAD` deja de valer como nombre de rama. Un ejercicio propio gana los comandos de partida `origin commit <rama> "<mensaje>"` (un commit de Ana en el remoto, o una rama nueva allá) y `origin delete <rama>`, validados como los demás y solo al partir, y la condición `gone:rama` (ni en `origin` ni su `origin/<rama>` aquí). Ejercicio guiado 15 (`?practice=15`): Ana fusionó `feature` en `origin/main` y la borró allá; se resuelve con `pull`, `fetch --prune`, `branch -d feature` y `push origin --delete experiment`. Textos nuevos (título y meta del ejercicio 15, y `gone:` y `origin …` en la ayuda de las condiciones) en los 40 idiomas. `run()` dice ahora `changed` también cuando un comando falla tras cambiar algo (el `fetch` de un `pull` que se niega), para que el grafo lo dibuje.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs`: «pull: avanza rápido, fusiona con --no-rebase, rebasa con --rebase y, si divergieron, pide cómo», «push --delete y fetch --prune: el borrado sube, la poda quita origin/<rama> y status dice que se fue», «un ejercicio propio puede dejar commits ajenos en el remoto (origin commit), borrar ramas de allá (origin delete) y pedir gone:», el ejercicio 15 en «cada ejercicio parte sin resolver…» y sus atajos (sin poda, sin borrar `experiment` del remoto, sin `pull`) en «un ejercicio no se da por resuelto con el atajo equivocado», y `?practice=15` en la URL; vistas fallar (5 en rojo) antes de escribir el código y pasar después. El paso del smoke «el ejercicio de pull y poda: pull trae la fusión de Ana, fetch --prune quita origin/feature del grafo y push --delete borra experiment». Las pruebas que daban `push --delete` y `fetch --prune` por opciones desconocidas usan ahora `--mirror` y `--unshallow`, y las que probaban un comando inexistente con `pull` lo hacen con `push2` (unidad) y `bisect` (smoke).
- README: «Aprender git» (`pull` y sus opciones, `push --delete`, `fetch --prune`, el ejercicio 15, `?practice=1` a `15`, `gone:` y los comandos de partida `origin commit` y `origin delete`), Pruebas, Límites conocidos (`pull` de a una rama, sin `--all`, `--squash`, `--autostash` ni `pull.rebase`; `pull --rebase` sin fork-point; `push --delete` de a una rama; sin `fetch.prune`; lo ajeno en el remoto siempre a nombre de Ana y solo al partir; la lista de condiciones con `gone:`) y Seguridad (`origin …` solo toca la lista en memoria del remoto).
- QA: la práctica (`?practice=15`) con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px y en ar a 390 px: el grafo parte con `origin/feature` y `origin/experiment`, `pull` avanza rápido con la tabla de `fetch` (de 5 a 6 nodos), `fetch --prune` imprime el `[deleted]` y `origin/feature` se va del grafo, `branch -d feature` y `push origin --delete experiment` lo resuelven y `origin/experiment` se va (tras su animación de polvo: el paso del smoke espera la condición, no un tiempo), sin desborde (ancho igual a la ventana) ni errores de consola; 40 idiomas con `node tools/check-i18n.mjs`; auditoría: la de la puerta.
- Skills: no aplica: tres subcomandos más en un simulador propio, sin dominio externo; lo cubren las reglas del repo y el Protocolo de QA.
- Arena: no aplica: una sola forma obvia (`pull` como `fetch` más el `merge` o el `rebase` que ya existen; borrar y podar, quitar claves de los dos mapas del remoto).
- Guías: test-driven-development (las pruebas primero, vistas fallar), ux-copy (la salida imita a git; la meta del ejercicio dice qué pasó y qué comandos usar), content-translation (el sentido en cada idioma, los comandos sin traducir, derecha a izquierda en ar, fa, he y ur), verification-before-completion (el ciclo rojo-verde de las pruebas nuevas)
- OMC: plan=— · revisión=12 hallazgos, ninguno CRITICAL ni HIGH (6 arreglados, con prueba: el MEDIUM de `pull --rebase` con cambios sin commit, que traía y después fallaba —ahora se niega antes del `fetch` con el «cannot pull with rebase» de git—; los LOW de `--rebase --no-rebase`, donde ahora gana la última como en git, del error de un `pull` de partida que mostraba «From origin» en vez del `fatal:`, de `origin commit` con el mensaje sin comillas, de `HEAD` como nombre de rama y de la ayuda y los `usage` sin las formas nuevas; además `snapshot()` en vez de tres copias de lo que mira `run()`. Sin cambios: el aviso de ramas divergentes abreviado y `pull` a secas que se niega si divergieron (git desde la 2.33, en Límites conocidos), `gone:` cierto también para una rama que nunca se subió (es lo que dice: no está en `origin`), una rama local `origin/<x>` que tapa la de seguimiento (de la entrega anterior, en Límites conocidos), y la demo: la capacidad vive en la práctica, que abre sin token ni red; seguridad: sin hallazgos de riesgo, los nombres pasan por `validName` y los textos por `textContent` o `U.esc`) · verificación=PASS
- Reclamo: loop/281, sin colisión
- Validado: 750 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. La puerta anterior, antes de los arreglos de la revisión, también dio verde con un paso ajeno intermitente («la ficha de un commit de agente…», anotado en el pendiente 1 [Deuda]).
- **Siguiente:** iteración 282, expansión: ítem 206 (Salud del repo: líneas añadidas y borradas por semana, Análisis)

### 2026-11-13 · Iteración 282 · Expansión · Análisis

- **Capacidad nueva: líneas añadidas y borradas por semana en la salud del repo** (ítem 206 de la hoja de ruta). Dos series más en el grupo «Últimas 8 semanas»: «Líneas añadidas por semana» y «Líneas borradas por semana», con el separador de miles del idioma. En GitHub salen de `/stats/code_frequency`: `syncCodeFrequency` en `js/sources/github.js`, una consulta solo al abrir el panel, con ETag y no más de una cada 15 minutos; si GitHub responde 202 (la está calculando), una línea pide volver a abrir el panel y la próxima apertura pregunta otra vez (un 202 sin cuerpo ya no se toma por una respuesta cortada); un 204 (repo vacío), un 422 (10 000 commits o más), un 404 o sin permisos dejan la línea fuera, sin error. `codeWeekly` en `js/health.js` reparte cada semana de GitHub en el bloque de 7 días donde empieza. La demo trae cifras propias. Textos nuevos (`health.addedWeeks`, `health.deletedWeeks`, `health.codePending`) en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/github.test.mjs`: «líneas por semana: una consulta al pedirlas (con ETag), el 202 queda «calculando» y se reintenta, el 204 queda vacío» (también el 202 sin cuerpo, el 304, el tope de 15 minutos, el 422 y el 404); `node --test tools/health.test.mjs`: «líneas añadidas y borradas por semana: las de /stats/code_frequency en las mismas 8 semanas, y «calculando» con el 202» (fuera de las 8 semanas, del futuro y cifras raras no suman); las dos vistas fallar antes de escribir el código y pasar después; la prueba del ritmo suma las dos series a su objeto. El paso del smoke de la salud pide `#hl-addedweeks` y `#hl-deletedweeks` con 8 cifras, alguna distinta de cero, y sin el «calculando» en la demo.
- README: «Salud del repo» (las dos series, de dónde salen y cuándo se consultan), Límites conocidos (solo GitHub y la demo, la rama por defecto, sin cifras desde 10 000 commits, la semana de GitHub que empieza el domingo y el primer 202) y Seguridad (una lectura más a `api.github.com`, ya en la CSP, de la que se guardan tres números por semana).
- QA: la salud de la demo (`?health=1`) con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px y en ar y ta a 390 px: las dos líneas salen con sus 8 cifras (con separador de miles en ar y ta), sin «calculando», sin desborde (ancho igual al de la ventana y al del panel), sin errores de consola y sin ninguna consulta a `api.github.com`; cuota: con el panel cerrado no se pide (prueba de `tools/github.test.mjs`); la primera puerta encontró que el smoke de la organización no simulaba `/stats/code_frequency` y el 404 ensuciaba la consola: el simulador del smoke la responde ahora; 40 idiomas con `node tools/check-i18n.mjs`; auditoría: la de la puerta.
- Skills: no aplica: una consulta más a la API de GitHub que el repo ya usa, con el mismo patrón que los forks y los despliegues; lo demás lo cubren las reglas del repo.
- Arena: no aplica: una sola forma obvia (la consulta al abrir el panel, como los forks, y las semanas en los mismos bloques que las demás series).
- Guías: test-driven-development (las pruebas primero, vistas fallar), ux-copy (qué cuenta cada línea y qué hacer con el «calculando»), content-translation (el sentido en cada idioma, derecha a izquierda en ar, fa, he y ur), verification-before-completion (el ciclo rojo-verde de las pruebas nuevas)
- OMC: plan=— · revisión=APPROVE, 2 MEDIUM y 6 LOW, ninguno CRITICAL ni HIGH (5 arreglados: los MEDIUM del 202 sin tope, que hacía una consulta por apertura —ahora espera un minuto— y de dos consultas a la vez —ahora una sola en vuelo—, con prueba; el LOW de la prueba del 304 que no lo comprobaba —ahora mira el `If-None-Match`—; el del 202 sin cuerpo admitido en toda consulta —ahora solo en la que lo pide, con `emptyOk`—; el del README con `api.github.com` fijo y «se guardan»; sin cambios: el comentario que hereda de `syncForks` el error tragado por el panel, y un 404, 422 o sin permisos que deja la línea fuera aunque antes hubiera semanas, a propósito) · verificación=PASS
- Reclamo: loop/282, sin colisión
- Validado: 752 pruebas (`node --test`), smoke (40 idiomas; intermitente, en verde al repetir su sección: «la ficha de un commit de agente dice cuál es, con su modelo y su sesi…», ajeno, ya en el pendiente 1 [Deuda]), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 283, mantenimiento · Accesibilidad: auditoría (sin pendientes de Accesibilidad)

### 2026-11-13 · Iteración 283 · Mantenimiento · Accesibilidad

- **Auditoría de Accesibilidad: el panel de salud ya no tira el foco a `<body>` al rehacerse.** Lo que llega después de abrir la salud (los forks, las líneas añadidas y borradas de la iteración 282, el estado de los despliegues, el primer commit de los PRs) rehacía el panel entero con `innerHTML`, y el control enfocado (un selector de «Comparar ramas», el resumen, una fila) desaparecía: el foco caía a `<body>` y quien navega con teclado o lector perdía el lugar (WCAG 2.4.3, orden del foco; severidad mayor). `renderHealth` (`js/app.js`) recuerda el control enfocado por su id o, si es una fila (de rama, de PR, de despliegue o de fork), por su lista y su clave (`data-key`: la rama, el PR o el fork, no su lugar, para que una lista reordenada no lleve el foco a otra fila), y lo vuelve a enfocar al terminar; si la fila ya no está, o el control no tiene cómo volver a encontrarse, el foco queda en el botón de cerrar del panel. La auditoría (`node tools/audit.mjs`) dio 0 hallazgos de accesibilidad (`sin-nombre`, `foco-*`, `dialogo-foco`, `trampa`, `objetivo-chico`); a mano, la práctica (`?practice=15`) tiene su registro como `role="log"` enfocable y la salud, sus regiones vivas en los resultados.
- **Reproducción:** Playwright contra `node e2e/serve.mjs 4173` con la API de GitHub simulada y `/stats/code_frequency` demorada 2,5 s, `?repo=o/r&health=1`, foco en `#cmp-a` → al llegar las líneas, `document.activeElement` es `BODY` (con el arreglo, `cmp-a`).
- **Hallazgos:** 4 (el del foco, arreglado; pendientes 23 [Errores], 24 y 25 [Accesibilidad]), 0 a la base de la auditoría.
- **Pruebas que fallan sin el arreglo:** el paso del smoke «la salud se rehace al llegar las líneas por semana y el foco sigue donde estaba» (sección «Una organización o un usuario entero»: retiene `/stats/code_frequency` hasta que el foco está en `#digest-org-md`), visto fallar sin el arreglo (`al rehacerse el panel el foco cayó en BODY`) y pasar con él.
- README: sin cambios (no cambia lo que hace el panel, solo dónde queda el foco).
- QA: teclado y lector de pantalla (el foco tras rehacerse la salud, con Playwright y la API simulada; la práctica y sus regiones vivas, en es a 1280 px); auditoría: 0 hallazgos de accesibilidad, 1 de rendimiento fuera de la base (`fps2d` 1,6 en la pasada exploratoria, con el equipo cargado; en las dos puertas, 0 hallazgos nuevos: era la carga).
- Skills: no aplica: un arreglo de foco en un panel propio; lo cubren la skill del repo `accessibility-review` y el Protocolo de QA.
- Arena: no aplica: una sola forma obvia (recordar el control enfocado y devolverle el foco).
- Guías: accessibility-review (cada hallazgo con su criterio WCAG y su severidad), systematic-debugging (la reproducción antes del arreglo), verification-before-completion (el ciclo rojo-verde del paso nuevo)
- OMC: plan=— · revisión=4 hallazgos, COMMENT, ninguno CRITICAL ni HIGH (3 arreglados: el MEDIUM de las filas de forks, enlaces sin clave que seguían tirando el foco a `<body>` —ahora llevan `data-key` y la lista `data-list="forks"`, y todo control sin clave cae en el botón de cerrar—, comprobado con Playwright y un fork simulado; el LOW de la clave por índice, ahora por rama, PR o fork; el LOW de los pendientes sin línea en blanco; sin cambios: el `.focus()` de los interruptores, redundante e inocuo) · verificación=PASS
- Reclamo: loop/283, sin colisión
- Validado: 752 pruebas (`node --test`), smoke, i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. La puerta anterior, antes de los arreglos de la revisión, también dio verde con un paso ajeno intermitente («la ficha de un commit de agente…», ya en el pendiente 1 [Deuda]).
- **Siguiente:** iteración 284, expansión: ítem 204 (Práctica: cartas de comandos, Público)

### 2026-11-13 · Iteración 284 · Expansión · Público

- **Capacidad nueva: cartas de comandos bajo la terminal de la práctica** (ítem 204 de la hoja de ruta, parte del ítem 16). Bajo la línea de la práctica, una fila de diez cartas (`status`, `add`, `commit`, `branch`, `switch`, `merge`, `rebase`, `reset`, `log` y `stash`), cada una con el comando y su descripción corta: pulsar una escribe su comando en la línea, sin ejecutarlo y en lugar de lo que hubiera, y deja el cursor donde va lo que falta (entre las comillas de `commit -m ""`, tras `merge ` o `switch `), para quien todavía no sabe qué escribir. La fila es una barra (`role="toolbar"`) con un solo punto de tabulación: las flechas (al revés en derecha a izquierda), Inicio y Fin se mueven entre las cartas y Enter o Espacio escribe la enfocada. Las cartas viven en `GB.gitsim.CARDS` (`js/gitsim.js`), sin DOM, y las dibuja `js/practice-ui.js` con `textContent`. En el celular el panel del grafo crece con la práctica abierta y el grafo guarda su alto (como con la leyenda de agentes), para que las cartas no queden cortadas. Textos nuevos (`practice.cards` y `practice.card.<comando>`) en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs`: «las cartas de comandos escriben comandos que el simulador entiende, con el cursor donde va lo que falta» (cada carta empieza por su comando, el simulador lo conoce y, completada, corre sin error en el ejercicio 2); el paso del smoke «las cartas de comandos escriben su comando en la línea sin ejecutarlo, y se recorren con el teclado» (sección «Varios repos a la vez»: pulsa `commit`, ve `commit -m ""` en la línea con el cursor en 11 y el registro sin cambios, escribe el mensaje y lo ejecuta, y recorre la barra con Inicio, flechas, Fin y Enter). Las dos vistas fallar sin la capacidad (`CARDS` indefinido; `solo 0 cartas`) y pasar con ella.
- README: «Aprender git» (las cartas, qué escriben y cómo se recorren), Pruebas y Límites conocidos (diez cartas fijas, que no cambian con el ejercicio, y la pulsada reemplaza lo escrito); Seguridad sin cambios (textos propios con `textContent`, nada se ejecuta al pulsar).
- QA: la práctica (`?practice=1`) con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px, en ar a 390 px y en ta a 320 px: diez cartas con su descripción traducida, sin desborde (ancho de la página igual al de la ventana), sin errores de consola, ArrowLeft va a la carta anterior en es y a la siguiente en ar; la primera captura en ar a 390 px mostró las cartas cortadas por el alto fijo del panel en el celular, arreglado con el panel que crece; 40 idiomas con `node tools/check-i18n.mjs`; auditoría: la de la puerta.
- Skills: no aplica: una barra de botones sobre la terminal propia; el patrón de barra con tabindex móvil lo cubren la skill del repo `accessibility-review` y el Protocolo de QA.
- Arena: no aplica: una sola forma obvia (una lista de datos en el simulador y una barra de botones que escribe en la línea).
- Guías: test-driven-development (las pruebas primero, vistas fallar), modern-web-guidance (`accessible-web-components`: el foco móvil, las demás cartas con `tabindex=-1` y `.focus()` en la elegida), ux-copy (cada descripción con su verbo, qué hace el comando), content-translation (el sentido en cada idioma, los comandos sin traducir, derecha a izquierda en ar, fa, he y ur), verification-before-completion (el ciclo rojo-verde de las pruebas nuevas)
- OMC: plan=— · revisión=COMMENT, 1 MEDIUM y 3 LOW, ninguno CRITICAL ni HIGH (2 arreglados: el MEDIUM de la regla del celular que también regía en el modo TV, que esconde la práctica con CSS y no con `hidden` —ahora `html:not(.tv)`—, y el LOW de las flechas en derecha a izquierda sin prueba —el paso del smoke lo prueba ahora en ar—; sin cambios: el grafo a 42vh en pantalla completa en el celular, como con la leyenda de agentes, y las cartas también en el ensayo sobre un repo real, donde no se ejecutan solas) · verificación=PASS
- Reclamo: loop/284, sin colisión
- Validado: 753 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. La puerta anterior, antes de los arreglos de la revisión, también dio verde con tres pasos ajenos intermitentes (anotados en el pendiente 1 [Deuda]).
- **Siguiente:** iteración 285, expansión: ítem 195 (Salud del repo: forks nuevos por semana, Análisis)

### 2026-11-13 · Iteración 285 · Expansión · Análisis

- **Capacidad nueva: forks nuevos por semana en la salud del repo** (ítem 195 de la hoja de ruta, parte del ítem 187). El grupo de series por semana del panel de salud suma una línea más, «Forks nuevos por semana», con las cifras de las últimas 8 semanas (de la más vieja a la actual). Sale de las mismas actividades «fork» ya cargadas que la tendencia «Forks nuevos: … esta semana · … la anterior» de la sección de forks, sin consultas nuevas: cada fork cuenta una vez, por su nombre completo sin distinguir mayúsculas, en la semana en que se vio primero; sin nombre, cada actividad cuenta sola; la hora futura o sin hora no cuenta. Como las otras series, no sale si da cero las 8 semanas, y con el interruptor «Mostrar forks» apagado (o `?forks=0`) tampoco, igual que la tendencia. `GB.health.compute` la da en `pace.forkWeeks` (la misma cuenta que `forkTrend`, cuya semana actual es la última cifra). Texto nuevo (`health.forkWeeks`) en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/health.test.mjs`: «forks nuevos por semana: las últimas 8, cada fork una vez en la semana en que se vio primero» (forks fabricados de varias semanas, uno repetido con otras mayúsculas, uno visto antes que su repetición reciente, dos sin nombre, uno fuera de las 8, uno futuro, uno sin hora y una estrella) y la de «ritmo» con la serie en ceros; las dos vistas fallar sin el cambio de `js/health.js` (`forkWeeks` indefinido) y pasar con él. El paso del smoke «salud del repo: listas y ritmo…» ahora exige `#hl-forkweeks` con 8 cifras y alguna distinta de cero en la demo, y que el interruptor «Mostrar forks» apagado la quite.
- README: «Salud del repo» (la serie, de dónde sale y que `?forks=0` la calla) y Límites conocidos (las demás fuentes no avisan forks, así que la serie no aparece ahí, y solo llega tan atrás como el feed cargado); Seguridad sin cambios (sin consultas ni textos de afuera nuevos: cifras con `U.esc`).
- QA: el panel de salud de la demo (`?demo=1&health=1`) con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px, en ar a 390 px y en ta a 320 px: la línea traducida con 8 cifras dentro del grupo de series, sin desborde (ancho de la página igual al de la ventana) y sin errores de consola; el apagado de los forks lo mira el smoke; 40 idiomas con `node tools/check-i18n.mjs`; auditoría: la de la puerta.
- Skills: no aplica: una serie más en un panel propio, con la misma cuenta que una tendencia que ya existe; nada de un dominio que el repo no cubra.
- Arena: no aplica: una sola forma obvia (exponer la serie semanal que `compute` ya calculaba y sumarla a la lista de series del panel).
- Guías: test-driven-development (la prueba primero, vista fallar), content-translation (el sentido en cada idioma, «fork» como lo dice ya cada locale), verification-before-completion (el ciclo rojo-verde de la prueba nueva)
- OMC: plan=— · revisión=APPROVE, 3 LOW, ninguno CRITICAL, HIGH ni MEDIUM (2 arreglados: el smoke ahora también exige que la serie vuelva al encender otra vez «Mostrar forks», y el comentario de `weekly()` en `js/health.js`, que no nombraba todas sus series; el tercero, el «hecho en #351» provisional, quedó confirmado con el número del PR) · verificación=PASS
- Reclamo: loop/285, sin colisión
- Validado: 754 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde.
- **Siguiente:** iteración 286, expansión: ítem 205 (Práctica: el índice y el árbol de trabajo a la vista, Público)

### 2026-11-13 · Iteración 286 · Expansión · Público

- **Capacidad nueva: el árbol de trabajo, el índice y HEAD a la vista en la práctica** (ítem 205 de la hoja de ruta, parte del ítem 16). Bajo las cartas de comandos, tres columnas (árbol de trabajo, índice y HEAD) con los archivos de cada área, cuántos son y su estado: en el árbol, cambiado, borrado a mano o sin seguir; en el índice, lo preparado (nuevo, cambiado, borrado o renombrado desde otro nombre); en HEAD, los archivos del último commit. Cambian al momento tras cada comando (`touch`, `add`, `commit`, `reset`, `restore`, `rm`, `mv`, `stash`…) y al cambiar de idioma. Los datos salen de `Repo.areas()` en `js/gitsim.js`, sin DOM; `js/practice-ui.js` los dibuja con `textContent` como tres listas con su título (`aria-labelledby`) dentro de un grupo con nombre, así que un lector de pantalla lee lo mismo que se ve. En el celular (hasta 560 px) las columnas van una debajo de otra. Cada lista se desplaza si pasa de unas 4 líneas y es enfocable (`tabindex=0`, con 24 px de alto como mínimo: la auditoría marcó como objetivo chico la de una sola línea) para llegar a su final con el teclado; los nombres de archivo van en `<code dir="ltr" translate="no">`: son datos, y ni el traductor del navegador ni la auditoría los tratan como texto de la interfaz (la regla `sin-traducir` de `tools/audit.mjs` ya no toma por clave a medio armar, como `a.tmp`, lo que está dentro de `translate="no"`; `{x}`, `undefined` y `NaN` siguen contando ahí). Textos nuevos (`practice.areas`, `practice.area.*` y `practice.state.*`) en los 40 idiomas.
- **Pruebas que fallan sin la capacidad:** `node --test tools/gitsim.test.mjs`: «areas: el árbol de trabajo, el índice y HEAD cambian con touch, add, commit, restore y reset» (un archivo cambiado y uno nuevo pasan del árbol al índice y a HEAD, `restore --staged` y `restore`, un `rm` y un `mv` a mano preparados con `add -A` como borrado y renombre, `reset --soft` que vuelve HEAD atrás y `reset` que saca lo preparado, `stash`, `reset --hard` y `git rm --cached`); vista fallar sin el cambio de `js/gitsim.js` (`r.areas is not a function`) y pasar con él. El paso del smoke «el árbol de trabajo, el índice y HEAD se ven al momento con touch, add y commit» (sección «Varios repos a la vez») hace `touch --new`, `add` y `commit` y mira el archivo pasar por las tres columnas, con sus títulos y el nombre del grupo.
- README: «Aprender git» (las tres columnas, qué muestra cada una y cuándo cambian), Pruebas y Límites conocidos (solo nombres, sin contenido; HEAD lista lo que la historia anotó, así que en los ejercicios y en el ensayo empieza vacía); Seguridad: las columnas también entran con `textContent`.
- QA: la práctica (`?practice=1`) con Playwright contra `node e2e/serve.mjs 4173`, en es a 1280 px, en ar a 390 px y en ta a 320 px, tras `touch`, `touch --new`, `add` y `rm`: las tres columnas con sus títulos y estados traducidos, una debajo de otra en el celular, sin desborde (ancho de la página igual al de la ventana) y sin errores de consola; 40 idiomas con `node tools/check-i18n.mjs`; auditoría: la de la puerta.
- Skills: no aplica: tres listas propias dentro de un panel que ya existe, con datos de un simulador propio; lo de accesibilidad lo cubren la skill del repo `accessibility-review` y el Protocolo de QA.
- Arena: no aplica: una sola forma obvia (una función sin DOM en el simulador que arma las tres listas, y el panel que las dibuja tras cada comando).
- Guías: test-driven-development (la prueba primero, vista fallar), content-translation (el sentido en cada idioma, «HEAD» y «commit» sin traducir, derecha a izquierda en ar, fa, he y ur), verification-before-completion (el ciclo rojo-verde de la prueba nueva)
- OMC: plan=— · revisión=COMMENT, 2 MEDIUM y 4 LOW, ninguno CRITICAL ni HIGH (3 arreglados: las listas que se desplazan, ahora enfocables; la prueba, que ahora cubre `stash`, `reset --hard` y `git rm --cached`; y un chequeo del smoke que no probaba nada, cambiado por el de las listas enfocables; sin cambios: los ids fijos de las columnas, con un solo panel en la página; el nombre viejo de un renombre sin aislar dentro del texto traducido en derecha a izquierda, y `inHistory()` recorrido en cada comando, que en la práctica es corto) · verificación=PASS
- Replica: paridad, sin pasada nueva: 94,5/100, must hechos 13 de 13; la hoja se repuso hasta 15 con los ítems 209 a 214, los seis de alcance 2 (cuatro filas de Replica a medias o sin hacer: 210 a 213; dos ideas de las fuentes del 2026-10-13: 209 y 214).
- Reclamo: loop/286, sin colisión
- Validado: 755 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. Las dos puertas anteriores dieron rojo en la auditoría, por el cambio: los nombres de archivo tomados por claves sin traducir (`a.tmp`) y las listas enfocables de una línea como objetivo chico; arreglados los dos.
- **Siguiente:** iteración 287, mantenimiento · QA: pendiente 14 (Un repo vacío (GitHub responde 409 «Git Repository is empty» en ramas y commits…)

### 2026-11-13 · Iteración 287 · Mantenimiento · QA

- **Arreglo: un repo vacío se dice vacío y no se reintenta cada pocos segundos** (pendiente 14). GitHub responde 409 «Git Repository is empty» a las ramas y los commits de un repo sin ningún commit, y la fuente lo tomaba como un error `http` cualquiera: el indicador decía «Sin conexión» y reintentaba a los 5 s, 10 s, 20 s… como si se cayera la red. Ahora `toError` (`js/sources/github.js`) da ese 409 como un error propio (`kind: 'empty'`, con el mensaje `err.empty`: el repo está vacío y el grafo aparece con el primer push), el ciclo lo reintenta cada 5 minutos sin token (`EMPTY_ANON_MS`: cada intento gasta unas 3 consultas de las 60 por hora) o cada minuto con token (`EMPTY_MS`), sin contarlo como fallo (no sube la espera exponencial ni corta la fuente: el primer push lo llena) y `U.statusKey` (`js/util.js`) lo rotula «Repo vacío» (`status.errorEmpty`); la vista muestra el aviso de repo vacío que ya existía («Este repositorio todavía no tiene commits», `js/app.js`) en vez de la tarjeta «No se pudo cargar el repositorio» con «Reintentar». Con token la carga va por GraphQL, que responde 200 sin ramas a un repo vacío: ese caso queda en el pendiente 25 [QA]. Las consultas secundarias que dejaban pasar un error `http` (tags, forks, despliegues, líneas por semana, primer commit de un PR) dejan pasar también este (`SOFT`). Un 409 con otro mensaje sigue siendo un error `http` (pendiente 14 [QA], el rótulo de los errores del servicio). Textos nuevos (`status.errorEmpty`, `err.empty`) en los 40 idiomas.
- **Reproducción:** `node --test tools/github.test.mjs` con la API simulada respondiendo 409 «Git Repository is empty.» en `/commits` y `/branches` → `expected: 'empty', actual: 'http'`; `node --test tools/util.test.mjs` → `U.statusKey({state: 'error', error: {kind: 'empty'}})` daba `status.error` («Sin conexión»).
- **Hallazgos:** 1 nuevo (pendiente 25 [QA], de la revisión), 0 a la base de la auditoría.
- **Pruebas que fallan sin el arreglo:** `node --test tools/github.test.mjs`: «un repo vacío (409 «Git Repository is empty») se dice vacío y no se reintenta cada pocos segundos» (dos ciclos sin token: el error `empty` con `err.empty`, el rótulo `status.errorEmpty`, la fuente sigue andando, el próximo intento a 5 minutos y sin fallos contados; un 409 con otro mensaje sigue `http`) y la de `statusKey` en `tools/util.test.mjs`; vistas fallar sin el cambio y pasar con él. El paso del smoke «un repo vacío (409 «Git Repository is empty») se rotula «Repo vacío» y no reintenta cada pocos segundos» (sección «Escritorio (1280×800)») abre `acme/vacio` contra la API simulada y mira el rótulo, el detalle, el aviso de repo vacío en la vista y que el reintento no sea de segundos.
- README: «Ciclo de actualización» (el repo vacío: su rótulo, el aviso, el reintento cada 5 minutos sin token o cada minuto con token, y que con token no se reconoce); Límites conocidos y Seguridad sin cambios (sin consultas ni textos de afuera nuevos: el mensaje es propio).
- QA: estados de error de la fuente (repo vacío, con la API simulada en `node --test` y en el smoke, en es a 1280 px); el resto lo mira la puerta (40 idiomas con `node tools/check-i18n.mjs`); auditoría: la de la puerta.
- Skills: no aplica: un caso más en el manejo de errores de una fuente propia; nada de un dominio que el repo no cubra.
- Arena: no aplica: una sola forma obvia (reconocer el 409 donde ya se clasifican los demás errores y darle su espera y su rótulo).
- Guías: test-driven-development (la prueba primero, vista fallar), content-translation (el sentido en cada idioma, «commit» y «push» como ya los dice cada locale), verification-before-completion (el ciclo rojo-verde)
- OMC: plan=— · revisión=COMMENT, 1 HIGH, 1 MEDIUM y 3 LOW (3 arreglados: el HIGH, el reintento cada minuto sin token que gastaba unas 180 consultas por hora de las 60, ahora cada 5 minutos; el MEDIUM, la variante con token de la prueba que simulaba un 409 de GraphQL que GitHub no da, quitada y el caso con token como pendiente 25 [QA]; el LOW de la tarjeta de error, cambiada por el aviso de repo vacío que ya existía; sin cambios: `empty` en `SOFT`, inocuo y coherente, y el smoke en español, como los demás pasos) · verificación=PASS
- Reclamo: loop/287, sin colisión (`--reclamar` salió 5 por un 503 del servicio de credenciales al empujar el reclamo; el push se repitió a mano y entró, sin otra `loop/287` en origin)
- Validado: 756 pruebas (`node --test`), smoke (40 idiomas), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. La puerta anterior, antes de los arreglos de la revisión, también dio verde.
- **Siguiente:** iteración 288, expansión: ítem 210 (Launchpad: filtrar por persona, Análisis)

### 2026-11-13 · Iteración 288 · Expansión · Análisis

- **Capacidad nueva: el Launchpad por persona también muestra lo que le toca revisar y lo asignado** (ítem 210 de la hoja de ruta, fila de Replica «Launchpad: vista de equipo filtrada por colaborador»). El ítem pedía filtrar por autor con `?who=`, pero eso ya estaba desde #307 y #308 (`?by=`): la entrega es lo que faltaba de la fila, la vista de equipo. Elegir una persona en el selector del Launchpad deja los PRs que abrió, aquellos en que **se le pidió revisión** y aquellos en que **está asignada**, de todos los repos seguidos, con lo ya cargado y sin consultas nuevas; los que no abrió llevan una marca («Revisión pedida a ana», «Asignado a ana») que el lector de pantalla oye en el nombre de la fila, y cada opción del selector cuenta los PRs en que está la persona (cada uno una vez). Los datos salen de la misma lista de PRs que ya se pedía: `requested_reviewers` y `assignees` en la API REST de GitHub y de Codeberg (Forgejo, Gitea), `reviewRequests` y `assignees` en la consulta GraphQL de GitHub (dos campos más, sin consultas nuevas, aunque con alrededor de un punto más de cuota GraphQL por ciclo, dicho en Límites conocidos) y `reviewers` y `assignees` en las MR de GitLab; los equipos no cuentan, y en GitHub tampoco los bots (GraphQL solo los trae como usuarios: con token y sin token salen las mismas personas). `?by=` no cambia. La demo pide revisiones y asigna PRs (sin tocar lo que sortea). Textos nuevos (`all.prs.role.review`, `all.prs.role.assignee`) en los 40 idiomas.
- **Hallazgos:** 1 nuevo (pendiente 3 [Deuda], el paso intermitente de la práctica), 0 a la base de la auditoría.
- **Pruebas que fallan sin la capacidad:** `node --test tools/overview.test.mjs`: «el Launchpad por persona: también los PRs en que se le pidió revisión o está asignada, con su papel» (personas, cuentas y papeles con PRs fabricados, listas raras incluidas) y «mount: con una persona elegida, cada fila dice si se le pidió revisión o está asignada»; `node --test tools/github.test.mjs`: «los PRs dicen a quiénes se les pidió revisión y quiénes están asignados (REST y GraphQL)»; vistas fallar sin el cambio de `js/overview.js` y de `js/sources/github.js` y pasar con él. Más las de `mapPull` en `tools/codeberg.test.mjs` y `tools/gitlab.test.mjs`. El paso del smoke «vista conjunta: «Todos»…» (sección «Varios repos a la vez») elige a «ana», que no abrió ningún PR pero tiene una revisión pedida en el #7: queda solo ese, con su marca, en la URL `?by=ana` y con el foco en el selector; con «bea», sus dos PRs sin marca; con «Todas las personas», todo otra vez y sin `?by=`.
- README: «Todos a la vez» (el filtro por persona con revisiones pedidas y asignaciones, y su marca) y Límites conocidos (de qué servicios salen; los equipos y los bots no cuentan; GitHub deja de listar a quien ya revisó, GitLab no; el costo de cuota GraphQL); Seguridad sin cambios (los logins entran con `textContent`, sin consultas nuevas).
- QA: el Launchpad de la vista conjunta con la API simulada en el smoke (es, 1280 px: filtro, marca, nombre accesible, URL y foco); el resto lo mira la puerta (40 idiomas con `node tools/check-i18n.mjs`, contraste del panel en claro y oscuro en el mismo paso); auditoría: la de la puerta.
- Skills: no aplica: un filtro más sobre datos que ya llegan de fuentes propias; nada de un dominio que el repo no cubra.
- Arena: no aplica: una sola forma obvia (sumar las listas al PR donde cada fuente ya lo arma y ampliar la comparación del filtro que existe).
- Guías: test-driven-development (las pruebas primero, vistas fallar), content-translation (el sentido en cada idioma, «review» como lo dice ya cada locale), verification-before-completion (el ciclo rojo-verde)
- OMC: plan=— · revisión=COMMENT, 2 MEDIUM y 7 LOW, ninguno CRITICAL ni HIGH (4 arreglados: los bots fuera de las listas de GitHub en REST, que con token no llegaban, el MEDIUM de intención; la marca con `dir="auto"`; el README, que ahora dice cuándo aparece el selector y el costo de cuota GraphQL, el MEDIUM de estándares, aceptado y dicho en Límites conocidos; sin cambios: el paso del smoke con la API simulada y no con la demo, que da el mismo Launchpad con datos fijos; el «#354» provisional, que se confirma al abrir el PR; los revisores de Azure DevOps y Bitbucket Data Center, que ya llegan y quedan para otra entrega; la demo, que no quita la revisión pedida al revisar; y dos personas con el mismo login en servicios distintos, que el filtro ya juntaba) · verificación=PASS
- Replica: la fila «Launchpad: vista de equipo filtrada por colaborador» pasa a `yes`.
- Reclamo: loop/288, sin colisión
- Validado: 761 pruebas (`node --test`), smoke (40 idiomas; intermitente, en verde al repetir su sección: «la práctica de git responde a los comandos en el grafo», «la ficha de un commit de agente dice cuál es, con su modelo y su sesi…»), i18n (0 errores), auditoría (0 hallazgos nuevos, 0 conocidos) y 29 e2e en verde. Las dos intermitentes son ajenas (pendientes 3 y 1 [Deuda]); la puerta anterior, antes de los arreglos de la revisión, también dio verde.
- **Siguiente:** iteración 289, expansión: ítem 209 (Práctica: conflictos de merge, Público)
