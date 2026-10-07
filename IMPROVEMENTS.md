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
```

## Pendientes

Ordenados por impacto. Salen de dos auditorías del código (datos y lógica; vistas y accesibilidad)
hechas en la primera iteración; cada uno se verificó leyendo el código, y los marcados con
*reproducido* también se probaron. Los números de línea son de cuando se auditó: con los cambios
posteriores pueden haberse movido.

### Alta

1. **Al cambiar de repo quedan los datos del anterior.** `connect()` no limpia `lastRender` ni las
   cifras (`app.js:175`): con un repo que da 404 se ven las cifras del anterior y Replay reproduce su
   grafo. Arreglo: `lastRender = null` y cifras en "–".

### Media

2. **Reloj adelantado → sondeo cada 3 s** (*reproducido*). Si `rate.reset` ya pasó según el reloj
   local, `nextDelay` devuelve 3000 ms y la cuota sin token se agota (`github.js:171`). Arreglo:
   `Math.max(base, …)` o calcular el desfase con la cabecera `Date`.
3. **Efectos 3D acumulados mientras la vista 3D no dibuja.** En 2D o con la pestaña oculta,
   `update()` y `celebrate()` siguen encolando ráfagas (`graph3d.js:846`, `:1691`) y al volver salen
   todas juntas. Arreglo: `fx` también exige `this.active`; descartar efectos con más de 1 s de atraso.
4. **El zumbido del modo vuelo sigue sonando en segundo plano** y sus osciladores nunca se detienen
   (`flight.js:290`, `sound.js:261`). Arreglo: silenciar en `visibilitychange` y `stop()` al llegar a 0.
5. **Contraste insuficiente del texto secundario en el tema claro.** `--ink-3: #78837f` da 3,8:1 sobre
   `--surface` (`styles.css:14`). Arreglo: `#636e6a` (5,1:1).
6. **Los avisos no se pueden retener con el teclado** y algunos lectores los anuncian dos veces
   (`role=status` dentro de un contenedor `aria-live`; `feed.js:232`, `:254`). Arreglo: pausar en
   `focusin`/`focusout` y dejar una sola región viva.
7. **Sin GraphQL, cada PR que sale de la página de 50 cuesta una consulta** (`github.js:927`). Arreglo:
   una sola consulta a `pulls?state=all&sort=updated` (la clave `pulls-all` ya existe).
8. **Un error 5xx suelto apaga funciones para toda la sesión** (`activityOk = false`, `github.js:539`;
    caída permanente de GraphQL a REST, `:311`). Arreglo: degradar solo con 403/404/410.

9. **El modo TV y el director de cámara (llegaron con #13) no tienen pruebas ni auditoría.** Sumar
    `?tv=1` al smoke test (carga, director activo, salida) y revisar `js/director.js` y el modo TV como
    se hizo con el resto.

### Baja

10. El detalle de rama o commit pierde el foco al pulsar **Fijar** (`graph.js:92` usa `outerHTML`) y no
    recibe foco al abrirse desde el teclado.
11. Con movimiento reducido, la ayuda del modo vuelo y el combo no se ven nunca (`styles.css:1383`,
    `:2121`): su animación termina en opacidad 0.
12. Replay: `wasPlaying` no se reinicia (`replay.js:79`), y la barra espaciadora sobre una etiqueta de
    rama en 2D también pausa el Replay (`app.js:671` no mira `ev.defaultPrevented`).
13. Durante Replay se actualizan las dos vistas aunque una esté oculta (`app.js:278`).
14. Trabajo por cuadro: lecturas de tamaño que fuerzan maquetación en 3D y 2D (`placeTip`) y un
    `Intl.DateTimeFormat` nuevo por cuadro en Replay (`replay.js:343`). Revisar tras #15, que rehízo
    buena parte de `graph.js` y `graph3d.js` (ya quitó `computeLineDistances()` por cuadro).
15. Accesibilidad menor: etiquetas de rama de 22 px de alto (mínimo 24), botones que cambian a la vez
    `aria-pressed` y el texto, leyenda 2D sin acceso por teclado, el botón de pausa del Replay sin nombre
    accesible (`index.html:190`).
16. La etiqueta de ramas fusionadas de la leyenda está fija en español (`layout.js:264`).
17. `i18n.setLocale`: si se eligen dos idiomas seguidos, gana el que termina de cargar último.
18. `mapPull` compara con el owner/nombre escrito, no con el que devuelve GitHub (repos renombrados).
19. `stop()` no cancela la consulta en curso al cambiar de repo (usar `AbortController`).
20. `parseRepo` acepta `..` como owner o nombre (`util.js:39`): rechazar nombres hechos solo de puntos.
21. Valores guardados sin validar el tipo (`pins`, `filter`): un `localStorage` corrupto deja la app en
    blanco al arrancar.
22. Token en `localStorage`: en GitHub Pages lo comparten todos los proyectos de `<usuario>.github.io`.
    Valorar `sessionStorage` con opción "recordar", o recomendar dominio propio.
23. Más pruebas: modo GraphQL y mapeo de eventos (`mapEvent`) con la API simulada; separar `github.js`
    (1.200 líneas) en HTTP/cuota, los tres modos y el mapeo.

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
