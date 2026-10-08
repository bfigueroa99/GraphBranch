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

### Alta

1. **En modo TV, mover el ratón vuelve a leer todo el tema en cada evento** (*reproducido*). `wake()`
   quita la clase `tv-idle` aunque no esté, y eso igual despierta los MutationObserver de 3D y 2D
   (`app.js:883`, `graph3d.js:734`, `graph.js:296`): 30 movimientos dieron 30 `readTheme` y 30
   redibujos del grafo 2D oculto. Arreglo: tocar la clase solo si está.
2. **Cortar un salto hiperespacial deja mal el campo de visión** (*reproducido*). Pasar a 2D, apagar
   las galaxias o cambiar de repo durante el salto deja la cámara en 50–70° hasta salir del vuelo
   (`galaxy.js:1629`, `endHyper`). Arreglo: restaurar `fov` a `hyper.fov0`.
3. **El rótulo de llegada a una galaxia le lee al lector de pantalla el nombre "descifrándose"**
   (*reproducido*): unas 48 escrituras con caracteres al azar en una región `role=status`
   (`galaxy.js:959`, `:825`). Arreglo: `aria-hidden` en el efecto y el nombre real, una vez, en un
   texto solo para lectores.
4. **El foco se pierde al entrar y salir del modo TV** (*reproducido*), y no hay `Esc` para salir
   (`app.js:819`). Arreglo: foco al grafo al entrar y al botón TV al salir.
5. **El zumbido del espacio no se apaga** al entrar al modo TV (`app.js:829` no llama a
   `pokeAmbience()`) ni con la pestaña oculta; lo mismo que el motor del vuelo (pendiente 8).
6. **Una consulta de archivos del repo anterior escribe en las galaxias del nuevo** (`galaxy.js:1989`):
   cambiar de repo mientras cargan deja los planetas del anterior en la rama del mismo nombre.
   Arreglo: contador de generación que `reset()` incrementa.

### Media

7. **Efectos 3D acumulados mientras la vista 3D no dibuja.** En 2D o con la pestaña oculta,
   `update()` y `celebrate()` siguen encolando ráfagas (`graph3d.js:846`, `:1691`) y al volver salen
   todas juntas. Arreglo: `fx` también exige `this.active`; descartar efectos con más de 1 s de atraso.
8. **El zumbido del modo vuelo sigue sonando en segundo plano** y sus osciladores nunca se detienen
   (`flight.js:290`, `sound.js:261`). Arreglo: silenciar en `visibilitychange` y `stop()` al llegar a 0.
9. **Contraste insuficiente del texto secundario en el tema claro.** `--ink-3: #78837f` da 3,8:1 sobre
   `--surface` (`styles.css:14`). Arreglo: `#636e6a` (5,1:1).
10. **Los avisos no se pueden retener con el teclado** y algunos lectores los anuncian dos veces
   (`role=status` dentro de un contenedor `aria-live`; `feed.js:232`, `:254`). Arreglo: pausar en
   `focusin`/`focusout` y dejar una sola región viva.
11. **Sin GraphQL, cada PR que sale de la página de 50 cuesta una consulta** (`github.js:927`). Arreglo:
   una sola consulta a `pulls?state=all&sort=updated` (la clave `pulls-all` ya existe).
12. **Un error 5xx suelto apaga funciones para toda la sesión** (`activityOk = false`, `github.js:539`;
    caída permanente de GraphQL a REST, `:311`). Arreglo: degradar solo con 403/404/410.

### Baja

13. El detalle de rama o commit pierde el foco al pulsar **Fijar** (`graph.js:92` usa `outerHTML`) y no
    recibe foco al abrirse desde el teclado.
14. Con movimiento reducido, la ayuda del modo vuelo y el combo no se ven nunca (`styles.css:1383`,
    `:2121`): su animación termina en opacidad 0.
15. Replay: `wasPlaying` no se reinicia (`replay.js:79`), y la barra espaciadora sobre una etiqueta de
    rama en 2D también pausa el Replay (`app.js:671` no mira `ev.defaultPrevented`).
16. Durante Replay se actualizan las dos vistas aunque una esté oculta (`app.js:278`).
17. Trabajo por cuadro: lecturas de tamaño que fuerzan maquetación en 3D y 2D (`placeTip`) y un
    `Intl.DateTimeFormat` nuevo por cuadro en Replay (`replay.js:343`). Revisar tras #15, que rehízo
    buena parte de `graph.js` y `graph3d.js` (ya quitó `computeLineDistances()` por cuadro).
18. Accesibilidad menor: etiquetas de rama de 22 px de alto (mínimo 24), botones que cambian a la vez
    `aria-pressed` y el texto, leyenda 2D sin acceso por teclado, el botón de pausa del Replay sin nombre
    accesible (`index.html:190`).
19. La etiqueta de ramas fusionadas de la leyenda está fija en español (`layout.js:264`).
20. `i18n.setLocale`: si se eligen dos idiomas seguidos, gana el que termina de cargar último.
21. `mapPull` compara con el owner/nombre escrito, no con el que devuelve GitHub (repos renombrados).
22. `parseRepo` acepta `..` como owner o nombre (`util.js:39`): rechazar nombres hechos solo de puntos.
23. Valores guardados sin validar el tipo (`pins`, `filter`): un `localStorage` corrupto deja la app en
    blanco al arrancar.
24. Token en `localStorage`: en GitHub Pages lo comparten todos los proyectos de `<usuario>.github.io`.
    Valorar `sessionStorage` con opción "recordar", o recomendar dominio propio.
25. Más pruebas: modo GraphQL y mapeo de eventos (`mapEvent`) con la API simulada; separar `github.js`
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
