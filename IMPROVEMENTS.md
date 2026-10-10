# Mejora continua

Bitácora y lista de pendientes de las iteraciones de mejora (una cada 4 horas). Cada iteración toma
la tarea de mayor impacto que quede en **Pendientes**, la resuelve de forma acotada, la valida y la
anota en **Bitácora**.

## Cómo validar un cambio

```sh
node --test                    # lógica contra una API de GitHub simulada (tools/*.test.mjs)
node tools/check-i18n.mjs      # traducciones contra el inglés
node tools/smoke.mjs           # la demo en Chromium: 3D, 2D, vuelo, Replay, diálogos, RTL, celular
node tools/smoke.mjs --langs   # además los 40 idiomas en pantalla de celular
xvfb-run -a npm run test:e2e -- --grep-invert @lento   # app de escritorio y web (tras npm ci)
```

Si el Playwright del proyecto no encuentra su Chromium, `PLAYWRIGHT_CHROMIUM_PATH` apunta a otro (lo
leen el smoke y las e2e).

## Pendientes

Ordenados por impacto. Salen de las auditorías del código: datos y lógica, y vistas y accesibilidad
(iteración 1), y el código que llegó después: director, modo TV, mundo abierto, galaxias, 2D y 3D de
#26 y #27 (iteración 6). Cada uno se verificó leyendo el código, y los marcados con *reproducido*
también se probaron. Los números de línea son de cuando se auditó: con los cambios
posteriores pueden haberse movido.

### Baja

1. El detalle de rama o commit pierde el foco al pulsar **Fijar** (`graph.js:92` usa `outerHTML`) y no
    recibe foco al abrirse desde el teclado.
2. Con movimiento reducido, la ayuda del modo vuelo y el combo no se ven nunca (`styles.css:1383`,
    `:2121`): su animación termina en opacidad 0.
3. Replay: `wasPlaying` no se reinicia (`replay.js:79`), y la barra espaciadora sobre una etiqueta de
    rama en 2D también pausa el Replay (`app.js:671` no mira `ev.defaultPrevented`).
4. Durante Replay se actualizan las dos vistas aunque una esté oculta (`app.js:278`).
5. Trabajo por cuadro: lecturas de tamaño que fuerzan maquetación en 3D y 2D (`placeTip`) y un
    `Intl.DateTimeFormat` nuevo por cuadro en Replay (`replay.js:343`). Revisar tras #15, que rehízo
    buena parte de `graph.js` y `graph3d.js` (ya quitó `computeLineDistances()` por cuadro).
6. Accesibilidad menor: etiquetas de rama de 22 px de alto (mínimo 24), botones que cambian a la vez
    `aria-pressed` y el texto, leyenda 2D sin acceso por teclado, el botón de pausa del Replay sin nombre
    accesible (`index.html:190`).
7. La etiqueta de ramas fusionadas de la leyenda está fija en español (`layout.js:264`).
8. `i18n.setLocale`: si se eligen dos idiomas seguidos, gana el que termina de cargar último.
9. `mapPull` compara con el owner/nombre escrito, no con el que devuelve GitHub (repos renombrados).
10. `parseRepo` acepta `..` como owner o nombre (`util.js:39`): rechazar nombres hechos solo de puntos.
11. Valores guardados sin validar el tipo (`pins`, `filter`): un `localStorage` corrupto deja la app en
    blanco al arrancar.
12. Token en `localStorage`: en GitHub Pages lo comparten todos los proyectos de `<usuario>.github.io`.
    Valorar `sessionStorage` con opción "recordar", o recomendar dominio propio.
13. Más pruebas: modo GraphQL y mapeo de eventos (`mapEvent`) con la API simulada; separar `github.js`
    (1.200 líneas) en HTTP/cuota, los tres modos y el mapeo.

- Ideas menores de la auditoría de la iteración 6: la caché de archivos de las galaxias limita
  entradas y no tamaño (`galaxy.js:1987`); `placeLabels`/`placeNotes` crean arreglos por cuadro
  (`graph3d.js:2611`); el contenedor 2D enfocable no tiene rol ni nombre (`graph.js:306`); las marcas
  de la brújula del mundo abierto son botones que se mueven y ocultan cada cuadro (`world.js:849`).

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
