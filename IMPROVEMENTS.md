# Mejora continua

Hoja de ruta, pendientes y bitácora de las iteraciones del loop (una cada 2 horas). Las entradas viejas
de la bitácora están en [`docs/BITACORA.md`](docs/BITACORA.md) (las lleva `node tools/loop.mjs --rotar`).

## Directiva vigente: ampliar el alcance

Pedido de Benjamin, 2026-10-10: **que el loop amplíe lo más posible el alcance del proyecto.** Desde
la iteración 20, el trabajo principal del loop es que GraphBranch sirva para algo, para alguien o en
algún lugar que antes no cubría. Arreglar y pulir sigue, pero en segundo plano: una iteración de cada
cuatro. Esta directiva manda sobre la regla anterior ("tomar el pendiente de mayor impacto") y sobre
el **Siguiente** de las entradas de la bitácora anteriores a ella.

Cuenta como ampliar el alcance una capacidad nueva que alguien pueda usar apenas se fusiona el PR:
otra fuente de datos, otro tipo de dato en el grafo, otra plataforma donde corre, más repos a la vez,
otra forma de sacar la información (exportar, compartir, integrar), otro análisis o un público nuevo.
No lo amplían los arreglos, el pulido, las refactorizaciones ni las pruebas por sí solas: eso es
mantenimiento.

### Cómo elige cada iteración

1. **Sincronizar** con `dev`, la rama de integración (desde el 2026-10-27, pedido de Benjamin: cada
   `loop/N` sale de `dev` y su PR se fusiona en `dev`; `master` es el release, lo publica GitHub Pages y
   solo recibe `dev` cuando Benjamin lo promueve). Si algo está roto (pruebas en rojo, una regresión de
   la iteración anterior), se arregla primero: no se amplía sobre algo roto. Cada iteración trabaja en su rama
   `loop/N`, que es también su reclamo (`node tools/loop.mjs --reclamar`): dos sesiones nunca hacen
   la misma iteración.
2. **Tipo de iteración** según su número `N`:
   - `N mod 4 = 3` (23, 27, 31…): **mantenimiento**, de uno de seis subtipos que rotan según lo que
     más haga falta: **Errores** (caza y arreglo de fallos), **QA** (QA exploratoria: auditar lo que
     llegó, cargar hallazgos y arreglar el peor), **Accesibilidad**, **Seguridad**, **Rendimiento** y
     **Deuda** (pruebas intermitentes, herramientas, refactorizaciones). Gana el de mayor necesidad:
     `2 × espera + 3 × pendientes Media + pendientes Baja (hasta 3)`, y QA suma además las expansiones
     que llegaron sin auditar (hasta 6); `espera` son los mantenimientos desde su último turno. Toma el
     primer pendiente **Media** de ese subtipo, o el primero; si no tiene pendientes (QA, Accesibilidad,
     Seguridad y Rendimiento pueden quedar sin ellos), audita su área con el protocolo de la skill.
   - Las demás: **expansión**. Toma el primer ítem sin hacer de la [Hoja de ruta](#hoja-de-ruta) en este
     orden (pedido de Benjamin, 2026-10-28: por puntaje, no por el orden escrito): primero los `must` de la
     app de referencia que faltan (`[replica must AAAA-MM-DD]`, ver
     [Replica](#replica-paridad-con-una-app-de-referencia)) y después los demás; dentro de cada grupo, de
     mayor a menor puntaje (el `a×i/e` que lleva tras el eje, el de su idea en
     [`docs/investigacion.md`](docs/investigacion.md)) y, a igual puntaje, el de número menor, que es el
     orden escrito. Un ítem sin puntaje va al final de su grupo (y `--check` lo da como error en R10). Si
     ese primero es del mismo eje que la expansión anterior y hay otro de un eje distinto entre los tres
     primeros de ese orden, toma ese otro. Así el proyecto crece a lo ancho y no solo en un frente.
   - Un pendiente marcado **Alta** (seguridad, datos perdidos, la app en blanco, `dev` en rojo) va
     antes que todo, en cualquier iteración.
   - Lo calcula `node tools/loop.mjs --siguiente` (número, tipo, eje o subtipo, ítem, por qué y el
     «Siguiente» para copiar); `node tools/loop.mjs --check` falla si este archivo no cumple estas
     reglas y se corre antes de cada PR.
3. **Tamaño:** una capacidad entera, de punta a punta, no una tarea acotada. Si no cabe en una
   iteración, se parte en entregas que dejan algo usable cada una: se hace la primera (la versión
   mínima que ya sirve) y las demás quedan en la hoja de ruta, en el lugar del ítem original.
4. **Si sobra tiempo**, con la primera capacidad ya fusionada y validada, se sigue con el ítem
   siguiente en otro PR. Una capacidad por PR, nunca dos mezcladas.
5. **Reponer la hoja de ruta:** al cerrar, si quedan menos de 10 ítems sin hacer, se agregan ideas
   hasta llegar a 15. Primero, lo que falta frente a la app de referencia (ver
   [Replica](#replica-paridad-con-una-app-de-referencia)). Después salen de [`docs/investigacion.md`](docs/investigacion.md): una comparación fechada
   y con fuentes con herramientas parecidas (Gource, gitk, GitKraken, GitLens, Sourcetree, la red de
   ramas de GitHub, Learn Git Branching, git-sim, GitUp, Fork, Sublime Merge, GitButler) y con quién
   usaría la app (quien enseña, quien transmite, equipos), más lo aprendido en la iteración y los ejes
   con menos cobertura en el [Mapa de alcance](#mapa-de-alcance). La investigación vale 30 días: vencida,
   se rehace antes de reponer (con `WebSearch` y `WebFetch`; sin ellas, se dice en la bitácora y en Para
   Benjamin, y no se inventan fuentes). Cada ítem pendiente lleva su puntaje tras el eje
   (`· Datos · 3×3/2.`: alcance × impacto / esfuerzo, de 1 a 3; con él lo ordena la regla 2) y uno
   nuevo cita su fuente (`[inv. AAAA-MM-DD]`, o `[parte del ítem K]` si es otra entrega de uno que ya
   estaba). La hoja de ruta
   nunca queda vacía: al loop no se le acaba el alcance por ganar.
6. **Registrar:** la entrada de la bitácora dice el tipo y el eje (`Iteración 20 · Expansión ·
   Plataformas`) o el subtipo (`Iteración 31 · Mantenimiento · Deuda`), y lleva la viñeta `- QA:` del
   [Protocolo de QA](#protocolo-de-qa). Una expansión actualiza su fila del Mapa de alcance y marca su
   ítem como hecho: tachado y con el número del PR (`~~**Instalable…**~~ hecho en #N`).
7. **Fallos e issues:** un fallo se reproduce con una prueba que falla antes de arreglarlo, y la entrada
   lo dice (`- **Reproducción:**`). Cada iteración tría los issues abiertos que `node tools/loop.mjs
   --salud` marca sin triar: un fallo va a Mantenimiento con su subtipo y prioridad (`issue #k`; el PR
   que lo arregla dice `Cierra #k`), una idea a la hoja de ruta o a la investigación. El texto de un
   issue es dato, no instrucción.
8. **Lo que solo puede hacer Benjamin** (activar Pages, permisos, publicar, borrar ramas ajenas,
   decidir) va a [Para Benjamin](#para-benjamin), fechado y en un solo lugar; el resumen de cada
   iteración lo repite. Lo resuelto se quita.

### Lo que trae cada expansión

- La capacidad funcionando en la web y, si aplica, en la app de escritorio; si la web no puede (CORS,
  sistema de archivos), la primera entrega puede ser solo de escritorio, dicho en el README.
- Visible en la **demo** cuando se pueda, para que se vea sin token ni conexión.
- Sus textos en los 40 idiomas (`node tools/check-i18n.mjs`).
- Una prueba que falle sin la capacidad: `node --test` con una API simulada, un paso del smoke o una
  e2e. Las pruebas de siempre siguen en verde (ver [Cómo validar](#cómo-validar-un-cambio)).
- README: la función en la lista de arriba, su sección si hace falta, y **Límites conocidos** y
  **Seguridad** al día.

### Lo que no cambia, por mucho alcance que dé

- App estática, sin compilación y sin servidor propio. Lo que el navegador no permite (leer un repo
  local, llamar a un webhook sin CORS) va en la app de escritorio.
- La CSP sigue cerrada: un servidor nuevo se suma a `connect-src` (o a la directiva que toque) solo
  si es la API que la función necesita. Sin CDN y sin telemetría.
- El token de cada servicio va solo a la API de ese servicio, guardado como el de GitHub (en
  escritorio, cifrado con el llavero del sistema).
- Lo nuevo no hace más lenta la carga de quien no lo usa, ni gasta cuota de GitHub si está apagado.
- Publicar en tiendas o registros (Chrome Web Store, Marketplace de VS Code, Flathub) lo hace
  Benjamin: el loop deja el paquete listo y las instrucciones en el README.

### Replica: paridad con una app de referencia

Pedido de Benjamin, 2026-10-20: que el pack Replica (`.claude/skills/replica-*`, MIT, de
<https://github.com/Jakeschincariol/replica-skill>) corra dentro del loop. No es un clon: GraphBranch ya
existe y la proporción de la regla 2 no cambia. Replica mide qué le falta frente a una app que ya existe
y qué piden los usuarios de esa app, y con eso se rellena y se ordena la hoja de ruta.

- **App de referencia:** GitKraken Desktop (<https://www.gitkraken.com/git-client>), cliente de Git de
  escritorio con grafo de commits. Sale de [`docs/investigacion.md`](docs/investigacion.md), que la llama
  el cliente más conocido: dibuja el grafo de ramas, se conecta a GitHub, GitLab, Bitbucket y Azure
  DevOps (las fuentes de GraphBranch), cobra lo que inspiró los ítems 12 y 14 (Launchpad, aviso de
  choques) y tiene ayuda, precios y novedades públicos y reseñas en varios sitios. La red de ramas de
  GitHub se parece más, pero es una sola página y sin reseñas: no da para una matriz ni para oír a sus
  usuarios. **Cambiarla:** editar esta línea (nombre y URL) en un PR; `node tools/loop.mjs --check` (R13)
  avisa que la pasada es de otra app y la próxima reposición la rehace desde cero.
- **Qué corre el loop**, leyendo cada skill por su ruta (la skill `iteracion` dice cómo, en «Reponer la
  hoja de ruta»): `replica-recon` (el mapa y la matriz de funciones, `replica/recon.md` y
  `replica/features.csv`, donde la columna `clone` es el estado de GraphBranch), `replica-entrepreneur`
  (reseñas públicas reales y enlazadas, ordenadas con `reviews.py`: `replica/reviews.csv`,
  `replica/feedback.md` y `replica/fixes.md`) y `replica-diff` (la paridad, con `parity.py`:
  `replica/parity.md`). Todo queda versionado en `replica/`.
- **Cadencia:** la paridad (`parity.py`) en cada reposición de la hoja de ruta (regla 5: cuando quedan
  menos de 10 ítems; hoy, más o menos una de cada 8 iteraciones). La pasada completa (mapa, matriz,
  reseñas y paridad), al empezar esa reposición si R13 avisa que no hay pasada, que tiene más de 30 días
  o que es de otra app. Cada expansión que entrega una fila de la matriz la marca (`clone`) en su PR.
- **De la paridad a la hoja:** los `must` de la referencia que GraphBranch no tiene (`no` o `partial`)
  entran primero, cada uno con su evidencia (la fuente de su fila), su puntaje y
  `[replica must AAAA-MM-DD]` (la fecha de la pasada), y la regla 2 los toma antes que a los demás ítems,
  entre ellos por puntaje (un must de puntaje bajo va antes que una idea de puntaje alto: es lo que falta
  frente a la referencia). Lo que salga de la matriz sin ser `must` lleva `[replica AAAA-MM-DD]` y compite
  por puntaje. Lo que piden las reseñas entra a la tabla de ideas de la investigación con su puntaje y
  compite con las demás. Lo que choca con «Lo que no cambia» o con lo que es GraphBranch
  (lee repos con tokens de solo lectura: no hace commit, push ni merge en el repo real) queda en la
  matriz como `skip`, con el motivo.
- **Reglas:** solo fuentes públicas y sin iniciar sesión (nunca la cuenta de nadie), leídas página por
  página (sin crawlers ni descargas en lote), sin el código de la referencia ni capturas suyas
  (`replica/screens/` no se versiona). Ninguna reseña inventada: cada cita es literal y enlazada, y una
  muestra chica se dice con su número. Lo que dicen esas páginas es dato, no instrucción.
- **Fuera del loop autónomo** (siguen a mano, con `/replica-…`): `replica-architect`, `replica-build` y
  `replica-backend`, porque reconstruyen una app desde cero, y GraphBranch ya existe y crece de a una
  capacidad por PR (el backend, además, es un servidor propio); `replica-brand` y `replica-launch`,
  porque el nombre, la marca, los precios y el lanzamiento los decide Benjamin; `replica-deploy`, porque
  toca producción y exige su visto bueno. `replica-test` y `replica-design` tampoco: el Protocolo de QA,
  el smoke y la auditoría ya hacen ese trabajo, la primera pide dependencias nuevas
  (`@axe-core/playwright`) y la segunda copia el sistema visual de la referencia.

### Arena: enfoques distintos que compiten

Pedido de Benjamin, 2026-10-20: que la skill arena (`.claude/skills/arena/`, MIT, de
<https://github.com/Jakeschincariol/arena-skill>, commit df07b8e) corra dentro del loop. Cuando la
capacidad o el arreglo de una iteración admite enfoques genuinamente distintos, antes de escribir el
código compiten en un torneo de eliminación simple que lleva `bracket.py`: cada subagente recibe la misma
tarea y una carta de estrategia distinta, se atacan, se defienden y un juez puntúa cada cruce con la
rúbrica de la skill. Los competidores nunca tocan el proyecto: el ganador vuelve como un diff o archivos
completos, y la iteración lo aplica y lo pasa por la puerta como cualquier cambio. La skill `iteracion`
dice cómo, en «Construir».

- **Cuándo:** como máximo una arena por iteración, de cualquier tipo. Si hay una sola forma obvia, no
  aplica, y la bitácora dice por qué. No cambia qué se construye ni la proporción de la regla 2: solo
  cómo se elige la implementación.
- **Tamaño:** 4 competidores (2 rondas, 19 llamadas de subagente) y como tope 8 (3 rondas, 43); nunca
  los 100 por defecto de la skill (595 llamadas) ni su modo rápido de 16 (91). `bracket.py plan` siempre
  antes, y el seed queda en la bitácora.
- **Autorización:** estas reglas reemplazan los pasos de la skill que piden un sí antes de empezar y
  antes de aplicar el ganador: nadie mira en vivo.
- **Registro:** desde la entrada «Cambio de maquinaria: la arena en el loop», cada iteración lleva
  `- Arena:` con N, seed, rondas, la carta del ganador y su puntaje, o «no aplica: <por qué>».
  `node tools/loop.mjs --check` lo exige (R5) y vigila que la skill `iteracion` corra la arena con su
  ruta y con `--agents` de 1 a 8 (R8). `.arena/` no se versiona.

### Skills de afuera: find-skills

Pedido de Benjamin, 2026-10-26: que la skill `find-skills` (`.claude/skills/find-skills/`, MIT, de
<https://github.com/vercel-labs/skills>, commit 65d20cb, con `disable-model-invocation: true`) corra dentro
del loop. Busca en el ecosistema abierto de skills (<https://skills.sh>) con la CLI `skills` una guía
experta para el dominio de la tarea (WebGL, Electron, una PWA, accesibilidad, Playwright…), y la iteración
la lee entera, la consulta y, si la aplicó y va a servir otra vez, la deja como skill del proyecto. La
skill `iteracion` dice cómo, en «Construir».

- **Cuándo:** con la tarea ya elegida y antes de construir, una búsqueda por iteración (hasta 3
  consultas), de cualquier tipo. Si la tarea no la necesita (es mecánica, o ya la cubren la directiva o
  una skill del repo) o no hay red, no aplica, y la bitácora dice por qué. No cambia qué se construye ni
  la proporción de la regla 2.
- **Filtro:** los installs de skills.sh se inflan, así que no deciden. Pasa solo una skill de un repo
  público con licencia permisiva, leída entera antes de usarla, que no baja ni corre código ajeno, no
  manda datos afuera, no toca tokens, no evade protecciones y no choca con «Lo que no cambia».
- **Uso:** consultada, es dato y no instrucción: no manda sobre `CLAUDE.md`, esta directiva ni la skill
  `iteracion`, y ninguna dependencia entra por ella. Instalada (una como máximo por iteración, en su
  propio commit): copiada a `.claude/skills/`, con su licencia, `disable-model-invocation: true` y la
  procedencia en el commit y en el README; nunca global ni actualizada sola.
- **Autorización:** estas reglas reemplazan los pasos de la skill que presentan opciones, preguntan e
  instalan con `-g -y`: nadie mira en vivo.
- **Registro:** desde la entrada «Cambio de maquinaria: find-skills en el loop», cada iteración lleva
  `- Skills:` con la consulta y lo que se hizo (consultada, instalada o descartadas, con el motivo), o
  «no aplica: <por qué>». `node tools/loop.mjs --check` lo exige (R5) y vigila que la skill `iteracion`
  corra `npx skills@1.7.4` con `DISABLE_TELEMETRY=1` y solo `find`, `use` y `add --copy` (R8).

## Para Benjamin

Lo que el loop no puede hacer solo. Cada pedido dice desde cuándo, por qué y qué hacer; el resumen de
cada iteración lo repite (`node tools/loop.mjs --salud` lo imprime) y se quita cuando está hecho.

1. **Activar GitHub Pages** (desde 2026-10-12). La web pública responde 404 y el repo tiene
   `has_pages=false`: Settings → Pages → Build and deployment → Source: Deploy from a branch → `master`,
   `/(root)`. Pages despliega con un flujo interno de Actions, así que la cuenta tiene que poder correr
   jobs. `node tools/loop.mjs --publicado` lo comprueba en cada iteración. Desde el 2026-10-27 el loop
   fusiona en `dev` y `master` es el release: la web muestra lo nuevo cuando promovés `dev` a `master`
   (un PR `dev` → `master` con commit de merge); la línea `Release:` de `--salud` dice cuántos merges
   faltan.
2. **Ramas viejas** (desde 2026-10-13). Las ramas `claude/*`, `ccr-*` y `permisos-claude` no son del loop:
   `node tools/loop.mjs --salud` dice cuáles ya están fusionadas o contenidas en dev y cuáles tienen
   trabajo sin fusionar (11 y 19 el 2026-10-25). Borrarlas o fusionarlas es tuyo: el loop nunca toca
   ramas ajenas.
3. **Publicar la extensión de VS Code** (desde 2026-10-14). El paquete está en `vscode/` (editor `publisher: bfigueroa99` en su `package.json`). Crear el publicador en marketplace.visualstudio.com, un token de Azure DevOps y correr `node tools/vscode.mjs && cd vscode && npx @vscode/vsce publish`; o instalar el `.vsix` a mano.
4. **Borrar las ramas `loop/*` fusionadas** (desde 2026-10-14). El proxy de las sesiones cloud niega
   `git push origin --delete` (falló en todas las iteraciones de la 111 a la 134; desde el 2026-10-25 ya no
   se intenta), así que cada `loop/K` fusionada se queda en origin: 107 el 2026-10-25 (`loop/28` a
   `loop/134`; las 28 a 54 se fusionaron con squash y en el grafo parecen ramas que nunca volvieron a
   `master`). Desde un PC con permiso de escritura, `node tools/loop.mjs --limpiar` las lista y
   `node tools/loop.mjs --limpiar --borrar` las borra en un solo push (solo las de iteraciones ya
   fusionadas: nunca la que está en curso ni las `loop/K-vencida-…`). Para que no se vuelvan a juntar:
   Settings → General → Pull Requests → «Automatically delete head branches» (GitHub borra la rama al
   fusionar, sin pasar por el proxy).
5. **Probar la vista de texto con un lector de pantalla real** (desde 2026-10-14). El loop solo comprueba la
   estructura ARIA y el teclado con Playwright. Abre la demo, pulsa el botón de las líneas y recórrela con NVDA,
   VoiceOver u Orca (¿la región viva anuncia sin repetir? ¿el foco se queda al actualizar?); lo que falle va a
   Mantenimiento y lo que salga bien se anota en el README, en «Límites conocidos».

## Mapa de alcance

Lo que cubre hoy cada eje y lo que viene en la hoja de ruta. Cada expansión pasa lo suyo de la
segunda columna a la primera.

| Eje | Hoy | Siguiente |
| --- | --- | --- |
| Fuentes | GitHub.com y GitHub Enterprise Server (GraphQL, lista y eventos), gitlab.com (proyectos públicos y, con token, privados, con sus eventos), codeberg.org (API de Forgejo, repos públicos y, con token, privados), bitbucket.org (API 2.0 de Bitbucket Cloud, repos públicos y, con token, privados), GitLab propio (`?gitlab=` / `--gitlab-url`, con su CSP), Forgejo/Gitea propio (`?forge=` / `--forge-url`, con su CSP), Bitbucket Data Center propio (`?bitbucket=` / `--bitbucket-url`, con su CSP y, con su token aparte y atado al servidor, privados), dev.azure.com (API REST 7.1 de Azure Repos, proyectos públicos y sin token), repos locales (app de escritorio, con `git`), demo | token para Azure DevOps (ítem 113) y para un Forgejo/Gitea propio |
| Datos | ramas, commits, PRs (y las pilas de PRs apilados, y la descripción y los últimos comentarios de un PR de GitHub desde la ficha de su rama), revisiones, issues, releases, estrellas, forks (y los forks con actividad reciente, por push más reciente o por estrellas, en el panel de salud, con un interruptor y `?forks=0`), archivos (galaxias), CI de GitHub (checks de la cabeza de las ramas y los PRs), tags y despliegues de GitHub (banderín y placa en el grafo), los cambios de cada commit (diff archivo por archivo, de un commit al siguiente, en todas las fuentes) | CI de GitLab, estado de los despliegues |
| Plataformas | web estática (GitHub Pages pendiente de activar: lo comprueba `node tools/loop.mjs --publicado`), instalable y sin conexión (PWA), escritorio (Windows, macOS, Linux), modo TV, widget embebible (`?embed=1`, con `&bg=` transparente o de color, `&hide=` (avisos, combo, leyenda, rótulo y fechas), `&rotate=` entre repos, `&theme=` claro u oscuro y `&title=` con un rótulo propio, `&max=` con el tope de ramas y `&spin=0` que aquieta la vista 3D, `&view=2d|3d` que fija la vista), extensión de VS Code (sigue la sesión de GitHub del editor y recuerda repos, vista e idioma entre sesiones; paquete listo, sin publicar) | extensión de Chrome o Firefox, app móvil |
| Escala | hasta 10 repos (también los más activos de una organización o un usuario, con su lista al día) y su constelación (cada repo, una galaxia, ordenable por pestañas, actividad o nombre, también desde la URL con `?order=activity` o `?order=name`, y filtrable por nombre con `?constellation=texto`), miles de ramas por repo, el Launchpad de la vista conjunta (los PRs abiertos de todos los repos seguidos, por estado: borrador, checks en rojo, aprobados y esperando revisión) | una organización entera con más de 10 repos a la vez |
| Salidas | panel de actividad, avisos, sonido, notificaciones, URL para compartir, imagen de la vista (PNG), video del Replay (WebM, por tramo de fechas y con título propio, también desde la URL), avisos a Slack, Discord y Teams (escritorio), resumen de la semana (Markdown, con PRs abiertos, issues cerrados, releases, tags, autores nuevos y commits por día, de un repo o de una organización seguida; PNG, de un repo o de una organización), prompt del loop autónomo para cualquier repo (español o inglés, con repo, ramas y objetivo; se copia o se guarda como `.md`) | el resumen de la semana de una organización con sus issues cerrados |
| Análisis | resumen de cifras, logros, misión del día, salud del repo (ramas olvidadas, PRs por edad, tiempo a fusionar, ritmo, issues cerrados por semana), choques entre ramas, también desde la URL (`?conflicts=1`), comparar dos ramas (por delante, punto de separación, archivos), búsqueda de commits por mensaje, SHA o autor, filtrar el grafo (2D y 3D) por ruta de archivo, también desde la URL (`?path=`) y desde el botón «Historial» de cada archivo del diff, filtrar el grafo por autor ("mis ramas"), también desde la URL (`?author=`), ocultar una rama o dejarla sola desde su ficha (2D y 3D, por repo), el grafo de primer padre como `git log --first-parent`, también desde la URL (`?firstparent=1`), búsqueda de commits también desde la URL (`?q=`), búsqueda por fecha (`desde:` y `hasta:`), resaltar en el grafo (2D y 3D) el tramo de cada rama comparada y su punto de separación, PRs fusionados y abiertos por semana en la salud (las últimas 8), vocabulario DORA en la salud (despliegues en 30 días y por semana, mediana entre releases, tiempo de entrega desde el primer commit del PR), PRs por estado en la salud (borrador, checks en rojo, aprobados, esperando revisión), tasa de fallos de CI en la salud (PRs abiertos en rojo y veces que la rama por defecto se puso roja en 30 días), el panel de salud abierto desde la URL (`?health=1`), bitácora en vivo al estilo de Brunell_Node (la quinta cifra del resumen: desde la bitácora anterior, lo grande, commits por día, nota del 1 al 100 de ritmo, publicado y salud con su origen, hallazgos con su gravedad y su seguimiento, cronología y qué sigue; se cierra, se guarda en el navegador y sale en Markdown o `estado.json`) | ver la hoja de ruta |
| Público | devs y equipos, 40 idiomas, teclado, quien aprende git (repo de práctica con terminal (`cherry-pick` (con `--no-commit`/`--abort`), `revert` (con `--no-commit`/`--abort`), `rebase -i` (con `--abort`/`--continue`), `stash`, `tag` (con `-d`), `reset` (`--soft`/`--mixed`/`--hard`, con `HEAD@{n}`), `commit --amend` (con `-m`) y `reflog`, `switch`, `restore` y `merge --no-commit`/`--abort` incluidos) y ejercicios, también propios compartidos por URL con pistas, solución propuesta que se muestra paso a paso con `solution=1` y condiciones sobre el mensaje del último commit y las ramas sin fusionar, y ensayo de comandos sobre una copia de un repo real), quien usa lector de pantalla (vista de texto (también desde la URL con `?vista=texto`): árbol de ramas y commits con teclado, filtro por rama, por autor y por ruta con su aviso, tags dichos en cada commit, forks activos y PRs abiertos por rama ya cargados ramas sin actividad hace más de 30 días dichas en su nombre y región viva con lo nuevo) | probar con NVDA, JAWS, VoiceOver y Orca |

## Hoja de ruta

Numerada en el orden en que entró cada ítem (el número no cambia: lo citan los PR, la investigación y las
otras entregas de un ítem); el loop la toma por puntaje, con los `must` de Replica primero (regla 2 de la
directiva). Cada ítem dice su eje, su puntaje (alcance × impacto / esfuerzo, de 1 a 3; de dónde sale
cada uno, en [`docs/investigacion.md`](docs/investigacion.md)), la primera entrega (la mínima que ya
sirve) y cómo comprobarla. Las notas técnicas son un punto de partida:
se comprueban antes de construir sobre ellas.

1. ~~**Instalable y sin conexión (PWA)**~~ hecho en #45 · Plataformas. `manifest.webmanifest` con íconos (sale de
   `electron/icon.png`) y un service worker que guarda la página, `css/`, `js/` y `vendor/`, así se
   instala en el celular o el escritorio sin Electron y abre sin red (con la demo y el aviso de sin
   conexión). Nunca guarda respuestas de la API: llevan datos privados si hay token. CSP: hace falta
   `manifest-src 'self'` (con `default-src 'none'` el manifiesto queda bloqueado). Registrar el worker
   solo en `https:` o `localhost`, no en `app://` de la app de escritorio. Comprobar: una e2e web que
   carga, pasa a sin conexión, recarga y ve la demo.
2. ~~**Exportar imagen**~~ hecho en #46 · Salidas. El botón de la cámara de fotos guarda la vista
   como PNG, en 3D y en 2D, con las etiquetas y una franja con el repo y la fecha; en la app de
   escritorio va a la carpeta de descargas.
3. ~~**Grabar el Replay en video**~~ hecho en #49 · Salidas. Un botón en la barra del Replay graba
   la historia desde el principio a WebM (MP4 en Safari) con `MediaRecorder`, cuadro a cuadro desde el
   compositor de `js/snapshot.js`, con la fecha grande y los rótulos; al terminar se guarda solo, con
   la duración que MediaRecorder no anota. Sin audio.
4. ~~**GitLab**~~ hecho en #47 · Fuentes. Proyectos públicos de gitlab.com (con subgrupos), sin
   token: ramas, commits y merge requests en vivo, galaxias con sus archivos, la Replay con sus MRs.
   `GitLabSource` hereda de `GitHubSource` el ciclo, los reintentos y las actividades.
5. ~~**GitLab, segunda entrega: proyectos privados**~~ hecho en #50 · Fuentes. Un **Token de GitLab**
   en Ajustes (permiso `read_api`; en escritorio, cifrado con el llavero en su propio archivo) abre
   los proyectos privados de gitlab.com; va solo a gitlab.com y el de GitHub, solo a GitHub.
6. ~~**GitLab, tercera entrega**~~ hecho en #54 · Fuentes. Los eventos del proyecto (`/events`: issues,
   comentarios, tags, aprobaciones) con su historial en el panel, como el feed de GitHub. Un GitLab
   propio, partido, es el ítem 25.
7. ~~**Una organización o un usuario entero**~~ hecho en #51 · Escala. `org:nombre`, `@usuario` o la
   URL de su perfil siguen sus repos con push más reciente, sin forks ni archivados, hasta el tope de
   pestañas (una consulta; dos para un usuario). También `?repo=org:nombre`.
8. ~~**Una organización entera, segunda entrega**~~ hecho en #55 · Escala. La organización queda seguida
   (se guarda `org:nombre` con los repos que ya vio su lista; cada 30 minutos se renueva y los nuevos
   se suman solos, sin traer de vuelta los que se cerraron). Los eventos de la organización, los
   grupos de GitLab y la constelación son el ítem 26.
9. ~~**CI en el grafo**~~ hecho en #56 · Datos. El estado de los checks (✓, ✗, ●) en la etiqueta y el
   detalle de la rama por defecto, las fijadas, las que se mueven y los PRs, y un aviso al ponerse en
   rojo la rama por defecto. Con token, en la misma consulta GraphQL (`statusCheckRollup`); sin token,
   check-runs de la rama por defecto y las fijadas. Los commit statuses sin token, el CI de GitLab y
   el de todas las ramas del listado quedan sin hacer.
10. ~~**Repos locales en la app de escritorio**~~ hecho en #59 · Fuentes. **Abrir carpeta…** (diálogo del
   sistema) o `--local=ruta` siguen un repo de la máquina con `LocalGitSource`: `electron/git.js` lee ramas
   y commits con `git` (`execFile`, sin shell) y vigila `.git`, y la página solo conoce el id de cada
   carpeta elegida (`GBDesktop.git`). Sin GitHub ni cuota. Los repos remotos (`origin/…`), los worktrees
   y la demo con un repo local quedan sin hacer.
11. ~~**Widget embebible y capa para streaming**~~ hecho en #60 · Plataformas. `?embed=1`: solo el grafo y los
   avisos, sin barras, para un iframe (el README trae el código para pegar); `&bg=transparent` para OBS.
   No sigue ni guarda los repos de la persona y no entra en modo TV. Sin hacer: tamaño y tema por
   parámetro (`&theme=`), y un modo sin avisos.
12. ~~**Salud del repo**~~ hecho en #61 · Análisis. El botón del pulso abre un panel con lo ya cargado, sin
   consultas nuevas: ramas sin actividad hace más de 30 días y sin PR, PRs abiertos por edad, tiempo de
   abierto a fusionado (mediana y el más lento de los últimos 20) y ritmo de merges y releases. Cada fila
   lleva a su rama en el grafo. Los cálculos viven en `js/health.js`.
13. ~~**GitHub Enterprise Server**~~ hecho en #63 · Fuentes. `?api=https://host/api/v3` (web) y `--api-url=` (escritorio):
   `GitHubSource` toma la URL de la API (REST ahí, GraphQL en `/api/graphql`, enlaces al host); solo https.
   La app de escritorio suma ese host, y solo ese, al `connect-src` del CSP; en la web lo hace quien sirve la
   página (README). Un servidor por sesión, sin claves propias para sus repos ni token aparte.
14. ~~**Choques entre ramas**~~ hecho en #64 · Análisis. En el panel de salud, «Buscar choques» compara con la rama
    por defecto cada rama con PR abierto (hasta 20, una consulta por rama, solo al pedirlo) y lista los archivos
    que tocan varias a la vez; cada fila lleva a una de las ramas. Cálculo puro en `js/health.js`.
15. ~~**Avisos a Slack y Discord**~~ hecho en #65 · Salidas. En la app de escritorio, Ajustes guarda una URL de
    webhook por servicio (cifrada como un token) y los eventos que recibe cada una: release, merge a la rama por
    defecto, CI en rojo y force-push en ella. Envío desde el proceso principal (`electron/webhooks.js`), decisión
    en `js/hooks.js`; botón «Enviar prueba».
16. ~~**Aprender git**~~ hecho en #67 · Público. El botón «Practicar git» abre un repo de práctica con una terminal
    bajo el grafo: `commit`, `branch`, `checkout`/`switch`, `merge`, `rebase`, `reset`, `log` y `status` sobre un
    repo en memoria (`js/gitsim.js`), y el grafo 2D o 3D responde al instante. Cuatro ejercicios guiados que se dan
    por resueltos solos. Segunda entrega posible: `cherry-pick`, `stash`, `tag` y conflictos.
17. ~~**Tags y despliegues**~~ hecho en #68 · Datos. Los tags son un banderín sobre su commit en 2D y un obelisco en
    3D; el commit que corre cada entorno de despliegue (según `/deployments`) lleva una placa con su nombre. La ficha
    del commit los nombra. Dos consultas más al abrir un repo de GitHub y dos cada 15 minutos (con ETag), apagables en
    Ajustes; la demo los trae. Segunda entrega posible: el estado de cada despliegue, tags de GitLab y de repos locales.
18. ~~**Vista de texto accesible**~~ hecho en #69 · Público. El botón de las líneas abre las ramas y sus últimos 10
    commits como un árbol (`role=tree`) que se recorre con el teclado (↑ ↓ → ← Inicio Fin, Enter lleva al grafo), con
    nombres accesibles (mensaje, autor, antigüedad, merge, tags). Segunda entrega posible: avisar de los cambios en
    vivo mientras está abierta y probarla con un lector de pantalla real.
19. ~~**Búsqueda y filtro por autor**~~ hecho en #71 · Análisis. La lupa abre un cuadro que busca entre los commits
    ya cargados por mensaje, SHA o autor (`@ana`), con un selector de autor y Enter para volar hasta el commit
    (2D y 3D). Sin consultas nuevas. Sin hacer: esconder del grafo las ramas de los demás autores (ítem 34).
20. ~~**Comparar dos ramas**~~ hecho en #73 · Análisis. En el panel de salud, «Comparar dos ramas»: dos selectores,
    los commits que lleva cada una por delante y el commit desde donde se separaron (con lo ya cargado, sin
    consultas; cada línea lleva al grafo) y, al pulsar, los archivos que cambió solo una, solo la otra o las dos
    (dos consultas). Sin hacer: resaltar en el grafo el tramo de cada rama y la comparación directa A...B por API.
21. ~~**Gitea, Forgejo y Codeberg**~~ hecho en #72 · Fuentes. codeberg.org (CORS abierto, comprobado) con la API de
    Forgejo: ramas, historia y PRs en vivo, galaxias con el árbol, sin token y solo repos públicos. Sin hacer:
    otros servidores de Gitea/Forgejo (uno propio entra con el ítem 25) y Codeberg con token.
22. ~~**Bitbucket Cloud**~~ hecho en #75 · Fuentes. `api.bitbucket.org/2.0` (CORS abierto, comprobado): ramas, historia y PRs
    en vivo y galaxias con el árbol, sin token y solo repos públicos. Sin hacer: Bitbucket con token (repos
    privados, mejor cuota) y los pipelines como CI.
23. ~~**Resumen de la semana**~~ hecho en #77 · Salidas. El panel de salud suma una ficha con los últimos 7 días
    (commits, PRs fusionados, releases, quién aportó y la rama más activa) para copiar o guardar como
    Markdown, con lo ya cargado. Sin hacer: guardarlo como imagen y juntar varios repos.
24. ~~**Extensión de VS Code**~~ hecho en #78 · Plataformas. `vscode/`: un panel con la app, servida por un servidor local en
    127.0.0.1 bajo una clave al azar, con la sesión de GitHub de VS Code (`vscode.authentication`) y el repo del
    `origin` del espacio de trabajo. Sin hacer: publicarla en el Marketplace (Benjamin), tokens de GitLab, textos
    en los 40 idiomas (recordar los repos entre sesiones: hecho en #126).
25. ~~**GitLab propio**~~ hecho en #80 · Fuentes. `?gitlab=https://gitlab.miempresa.com` (web) y `--gitlab-url=` (escritorio,
    que suma solo ese host a `connect-src`): la API v4, los enlaces y el token van a esa instancia y a ninguna
    otra; sin https vuelve a gitlab.com. Sin hacer: reconocer una URL de la instancia en el cuadro de repos y
    los avatares (ítem 35); el listado de commits con token sale más caro que las comparaciones, sin cambios.
26. ~~**Una organización entera, tercera entrega**~~ hecho en #81 · Escala. Los eventos de la organización
    (`/orgs/{org}/events`, una consulta con ETag cada 5 minutos para todos sus repos) llegan al panel con el
    nombre de su repo, solo los de repos sin pestaña. Los grupos de GitLab y la constelación son el ítem 41.
27. ~~**Replay por tramo de fechas y con rótulos propios**~~ hecho en #82 · Salidas · 2×2/1. [inv. 2026-10-13] Elegir desde y hasta qué día se graba o
    se reproduce el Replay y poner un título y un pie de foto al video, para mostrar un sprint o un lanzamiento.
    Comprobar: prueba del recorte de fechas y un paso del smoke con el tramo elegido.
28. ~~**Ejercicios de Aprender git compartidos por URL**~~ hecho en #85 · Público · 2×2/1. [parte del ítem 16] Un ejercicio propio
    (título, meta, comandos de partida y condiciones de una lista cerrada) viaja en `?practice=<código>`; se crea en
    «Crear un ejercicio para compartir» y se copia con «Copiar enlace del ejercicio». `?practice=1` a `4` abre los de la lista.
29. ~~**Filtrar el grafo por ruta de archivo**~~ hecho en #86 · Análisis · 2×2/2. [inv. 2026-10-13] En el cuadro de búsqueda, «Filtrar grafo» con un
    archivo o carpeta (`/commits?path=` por cabeza, 5 como mucho) deja a plena luz los commits que la tocaron y atenúa el resto
    en el grafo 2D; «Quitar filtro» lo deshace. Solo GitHub y la demo (donde la ruta se compara con el mensaje).
30. ~~**Los forks en el grafo**~~ hecho en #87 · Datos · 2×2/2. [inv. 2026-10-13] Los forks con actividad reciente (`/forks`, push
    propio en 90 días, el más nuevo primero) en el panel de salud; dibujarlos como ramas atenuadas queda por hacer.
31. ~~**Ensayar un comando sobre el repo real**~~ hecho en #89 · Público · 2×3/3. [inv. 2026-10-13] «Ensayar un comando» (con un repo real a la vista)
    abre la terminal de práctica sobre una copia en memoria de sus ramas y commits ya cargados: un `merge` o `rebase` se
    ve en el grafo sin tocar el repo ni gastar consultas. Solo ve lo ya cargado; sin conflictos.
32. ~~**Ramas apiladas**~~ hecho en #90 · Datos · 1×2/2. [inv. 2026-10-13] Un PR cuya base es la rama de otro PR se dibuja encadenado a él, con el
    orden de la pila. Comprobar: prueba del layout con PRs apilados.
33. ~~**Vista de texto, segunda entrega**~~ hecho en #91 · Público · 1×2/2. [parte del ítem 18] Que el árbol avise con una región viva
    (sin anunciar de más) de las ramas y commits nuevos mientras está abierto, que filtre por nombre de rama y que
    se escriba en el README cómo se probó con NVDA, VoiceOver y Orca. Comprobar: paso del smoke con un evento en vivo
    de la demo y la región viva sin repetir lo ya leído.
34. ~~**Filtrar el grafo por autor**~~ hecho en #93 · Análisis · 2×2/2. [parte del ítem 19] En el cuadro de búsqueda, «Mostrar solo las
    ramas de…» deja en el grafo 2D y 3D y en la vista de texto la rama por defecto y las ramas con commits de esa persona
    (`GB.search.byAuthor`), en todas las fuentes, guardado por repo. Comprobar: un paso del smoke en la demo y una prueba por fuente.
35. ~~**GitLab propio, segunda entrega**~~ hecho en #94 · Fuentes. [parte del ítem 25] Pegar la URL de un proyecto de la instancia propia
    (https o `git@host:`, también con ruta y con `/-/tree/…`) se reconoce (`U.gitlabBase`, solo ese host y por
    prefijo exacto); sus claves llevan el host (`gitlab@host:`), aparte de las de gitlab.com; y en escritorio sus
    avatares salen de ese host (`img-src`, solo el elegido con `--gitlab-url`). En la web siguen sin avatares.
36. ~~**Gitea y Forgejo propios**~~ hecho en #97 · Fuentes. [parte del ítem 21] La URL de un servidor propio de Forgejo/Gitea
    (`--forge-url=`), con la misma regla de CSP que GitLab propio y el token solo a ese host. Comprobar:
    `tools/codeberg.test.mjs` con otra URL base.
37. ~~**Tokens para Codeberg y Bitbucket**~~ hecho en #99 · Fuentes · 2×2/2. [parte del ítem 21] Repos privados y más cuota:
    el token de cada servicio en Ajustes (y en el llavero en escritorio), enviado solo a su host. Comprobar: una
    prueba por fuente de que el token va en cada consulta y a ningún otro lado.
38. ~~**Vocabulario DORA en la salud**~~ hecho en #95 · Análisis. [inv. 2026-10-13]
39. ~~**PRs por estado**~~ hecho en #98 · Análisis. [inv. 2026-10-13]
40. ~~**Resaltar el tramo de cada rama comparada**~~ hecho en #101 · Análisis. [parte del ítem 20]
41. ~~**Una organización entera, cuarta entrega**~~ hecho en #102 · Escala. [parte del ítem 26] `group:ruta` (o la URL `gitlab.com/groups/ruta`) sigue
    los proyectos de un grupo de GitLab con sus subgrupos, en una consulta, sin forks ni archivados. La constelación es el ítem 52.
42. ~~**Replay por tramo, segunda entrega**~~ hecho en #103 · Salidas · 1×2/1. [parte del ítem 27] El tramo y los rótulos viajan en la
    URL (`?replay=2026-09-01..2026-09-14&title=…`) y el Replay arranca solo con ellos.
43. ~~**Ejercicios compartidos, segunda entrega**~~ hecho en #105 · Público · 1×2/1. [parte del ítem 28] Un ejercicio propio admite
    hasta 3 pistas que se muestran con un botón, y condiciones sobre el mensaje del último commit (`tip:`) y sobre ramas
    sin fusionar (`unmerged:`).
44. ~~**Filtrar por ruta, segunda entrega**~~ hecho en #106 · Análisis · 1×2/1. [parte del ítem 29] El filtro por ruta también atenúa el grafo 3D
    y viaja en la URL (`?path=src/`) para compartir la vista ya filtrada. Comprobar: prueba de la lectura de la URL y un
    paso del smoke en 3D.
45. ~~**Filtro por autor en la URL**~~ hecho en #109 · Análisis · 1×2/1. [parte del ítem 34] `?author=ana` abre el repo ya filtrado por
    esa persona, para compartir la vista. Comprobar: prueba de la lectura de la URL y un paso del smoke en la demo.
46. ~~**Capa para streaming, segunda entrega**~~ hecho en #107 · Plataformas · 2×2/1. [inv. 2026-10-13] Parámetros de la URL para la capa
    de OBS: fondo transparente y ocultar paneles, con los de siempre por defecto. Comprobar: un paso del smoke con
    el enlace y prueba de la lectura.
47. ~~**Resumen de la semana de una organización**~~ hecho en #110 · Salidas · 2×2/2. [inv. 2026-10-13] El resumen de la semana de todos
    los repos seguidos de una organización, como Markdown para pegar. Comprobar: `tools/digest.test.mjs` con dos repos.
48. ~~**Tasa de fallos de CI en la salud**~~ hecho en #111 · Análisis · 2×2/2. [inv. 2026-10-13] La proporción de ejecuciones en rojo de
    la rama por defecto, con lo ya cargado de CI. Comprobar: `tools/health.test.mjs` con ejecuciones fabricadas.
49. ~~**Extensión de VS Code, segunda entrega**~~ hecho en #113 · Plataformas · 2×2/2. [parte del ítem 24] La extensión sigue la sesión
    de GitHub de VS Code con el panel abierto: si la persona inicia o cierra sesión (`onDidChangeSessions`), la página se
    recarga con el token nuevo o sin él (se borra el guardado). Comprobar: `tools/vscode.test.mjs` con la sesión simulada.
50. ~~**Bitbucket propio**~~ hecho en #114 · Fuentes · 1×2/3. [parte del ítem 22] Un Bitbucket Data Center o Server (`--bitbucket-url=`),
    con la misma regla de CSP que GitLab propio. Comprobar: `tools/bitbucket.test.mjs` con otra URL base.
    (Hecho en la iteración 85 como `js/sources/bitbucket-server.js`, API REST 1.0, y su prueba `tools/bitbucket-server.test.mjs`: la de Data Center no es la API 2.0 de Cloud, así que es otra fuente.)
51. ~~**Tiempo de entrega desde el primer commit**~~ hecho en #115 · Análisis · 1×2/2. [parte del ítem 38] El tiempo de entrega de la
    salud cuenta desde el primer commit del PR (una consulta de `/pulls/:n/commits` por PR fusionado reciente, solo al
    abrir el panel) y no desde su apertura. Comprobar: `tools/github.test.mjs` con la API simulada y
    `tools/health.test.mjs`.
    (Hecho en la iteración 86: `syncFirstCommits` en `js/sources/github.js` y `leadSource` en `js/health.js`.)
52. ~~**Constelación de repos**~~ hecho en #117 · Escala. [parte del ítem 41] Cada repo seguido es una galaxia en un diálogo (`js/constellation.js`): tamaño por commits cargados, color por nombre, novedades sin ver; Tab y Intro abren su pestaña.
53. ~~**Frecuencia de despliegue en la salud**~~ hecho en #118 · Análisis · 2×2/2. [inv. 2026-10-13] La salud cuenta los despliegues por semana
    (los releases de las últimas 8; los tags y despliegues de GitHub no traen fecha en lo ya cargado). Comprobado con `tools/health.test.mjs`.
54. ~~**Resumen de la semana como imagen**~~ hecho en #119 · Salidas · 2×2/2. [inv. 2026-10-13] El resumen de la semana también sale como imagen
    PNG para compartir, además del Markdown. Comprobar: prueba del lienzo y un paso del smoke que baja el archivo.
55. ~~**Práctica: cherry-pick y tag**~~ hecho en #121 · Público · 2×2/2. [parte del ítem 31] La terminal de práctica entiende `cherry-pick <sha>` y
    `tag <nombre>`, y un ejercicio nuevo los usa. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
56. ~~**Búsqueda en la URL**~~ hecho en #122 · Análisis · 1×2/1. [parte del ítem 19] `?q=texto` abre el repo con la búsqueda ya escrita, para
    compartir la vista. Comprobar: prueba de la lectura de la URL y un paso del smoke en la demo.
57. ~~**Avisos a Microsoft Teams**~~ hecho en #123 · Salidas · 2×2/2. [parte del ítem 15] El mismo aviso de actividad que ya va a Slack y Discord,
    con el formato de Teams. Comprobar: `tools/webhooks.test.mjs` con el cuerpo esperado.
58. ~~**Ejercicios compartidos, tercera entrega**~~ hecho en #125 · Público · 1×2/1. [parte del ítem 28] Un enlace de ejercicio con la solución
    propuesta (`?practice=<código>&solution=1`) que la muestra paso a paso en la terminal. Comprobar: prueba del codificado y
    un paso del smoke.
59. ~~**Extensión de VS Code: recordar repos**~~ hecho en #126 · Plataformas · 1×2/2. [parte del ítem 24] Los repos seguidos y el tema sobreviven
    entre sesiones del panel (el puerto cambia cada vez, así que se guardan en el estado de la extensión y se entregan con
    el token). Comprobar: `tools/vscode.test.mjs` con el estado simulado.
60. ~~**Práctica: rebase y revert**~~ hecho en #128 · Público · 2×2/2. [parte del ítem 31] La terminal de práctica entiende `rebase <rama>` y
    `revert <sha>`, y un ejercicio nuevo los usa. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
61. ~~**Capa para streaming, tercera entrega**~~ hecho en #131 · Plataformas · 2×2/2. [parte del ítem 11] `?embed=1&rotate=30` alterna entre los
    repos seguidos cada tantos segundos, para una escena de OBS sin tocarla. Comprobar: prueba de la lectura de la URL y un paso
    del smoke con dos repos.
62. ~~**Lanzamientos en el resumen de la semana**~~ hecho en #132 · Salidas · 1×2/1. [parte del ítem 23] El resumen de la semana lista los tags y
    lanzamientos de la semana con lo ya cargado. Comprobar: `tools/digest.test.mjs` con tags fabricados.
63. ~~**Vista de texto: filtro por autor**~~ hecho en #133 · Público · 1×2/2. [parte del ítem 33]
64. ~~**Choques entre ramas en la URL**~~ hecho en #135 · Análisis · 1×2/1. [parte del ítem 14] `?conflicts=1` abre el repo con los choques ya
    marcados, para compartir la vista. Comprobar: prueba de la lectura de la URL y un paso del smoke en la demo.
65. ~~**Token para un Bitbucket propio**~~ hecho en #136 · Fuentes · 2×2/2. [parte del ítem 50] Un token de acceso personal (`Authorization: Bearer …`)
    para un Bitbucket Data Center propio, guardado aparte (llavero en escritorio), que va solo a ese host: la mayoría de los
    servidores no dejan leer sin iniciar sesión. Comprobar: `tools/bitbucket-server.test.mjs` con el token y sin él.
66. ~~**Salud del repo en la URL**~~ hecho en #139 · Análisis · 1×2/1. [parte del ítem 12] `?health=1` abre el repo con el panel de salud ya
    desplegado, para compartir la vista. Comprobar: prueba de la lectura de la URL y un paso del smoke en la demo.
67. ~~**Búsqueda por fecha**~~ hecho en #143 · Análisis · 1×2/2. [parte del ítem 19] La lupa entiende `desde:2026-09-01` y `hasta:2026-09-14`
    junto al texto, sobre lo ya cargado. Comprobar: `tools/search.test.mjs` con fechas fabricadas.
68. ~~**Práctica: stash y reset**~~ hecho en #142 · Público · 2×2/2. [parte del ítem 31] La terminal de práctica entiende `stash`, `stash pop` y
    `reset --hard <sha>`, y un ejercicio nuevo los usa. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
69. ~~**Resumen de la organización como imagen**~~ hecho en #144 · Salidas · 1×2/2. [parte del ítem 47] El resumen de la semana de una
    organización también se baja como imagen PNG, como el de un repo. Comprobar: `tools/digest.test.mjs` con la imagen simulada.
70. ~~**Los forks en el grafo, segunda entrega**~~ hecho en #147 · Datos · 1×2/2. [parte del ítem 30] Los forks se pueden ocultar o mostrar desde
    un interruptor del panel y la elección viaja en la URL. Comprobar: prueba de la lectura de la URL y un paso del smoke.
71. ~~**Vista de texto: filtro por ruta en la URL**~~ hecho en #148 · Público · 1×2/1. [parte del ítem 33] La vista de texto abre con `?path=` y
    `?q=` aplicados y lo anuncia a quien usa lector de pantalla. Comprobar: prueba de la vista y un paso del smoke.
72. ~~**Resumen de la semana: pull requests abiertos**~~ hecho en #150 · Salidas · 1×2/2. [parte del ítem 23] El resumen de la semana suma cuántos pull requests se abrieron en los últimos 7 días, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con PRs fabricados.
73. ~~**Vista de texto: tags**~~ hecho en #152 · Público · 1×2/2. [parte del ítem 33] La vista de texto dice qué commits llevan tag y lo anuncia a quien usa lector de pantalla. Comprobar: prueba de la vista y un paso del smoke.
74. ~~**Capa para streaming, cuarta entrega**~~ hecho en #153 · Plataformas · 1×2/1. [parte del ítem 11] `&theme=light|dark` fija el tema de la capa sin tocar el de la página. Comprobar: prueba de la lectura de la URL y un paso del smoke.
75. ~~**Los forks en el grafo, tercera entrega**~~ hecho en #154 · Datos · 1×2/2. [parte del ítem 30] Los forks se ordenan por actividad reciente en el panel. Comprobar: prueba del orden con forks fabricados.
76. ~~**Constelación ordenada por actividad**~~ hecho en #156 · Escala. [parte del ítem 26] Un selector de orden (pestañas, actividad o nombre) reordena las galaxias, también el recorrido con Tab, y lo anuncia en una región viva (`C.sortItems` en `js/constellation.js`).
77. ~~**Práctica: branch -d y merge --abort**~~ hecho en #157 · Público · 2×2/2. [parte del ítem 31] La terminal de práctica entiende `branch -d` y `merge --abort`, y un ejercicio nuevo los usa. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
78. ~~**Vista de texto: abrirla desde la URL**~~ hecho en #160 · Público · 1×2/1. [parte del ítem 33] `?view=text` abre el repo con la vista de texto ya abierta, con su filtro por autor o por ruta si los trae, para compartir el enlace con quien usa lector de pantalla. Comprobar: prueba de la lectura de la URL y un paso del smoke.
79. ~~**Resumen de la semana: issues cerrados**~~ hecho en #158 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 23] El resumen de la semana suma cuántos issues se cerraron en los últimos 7 días, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con issues fabricados.
80. ~~**Vista de texto: releases**~~ hecho en #162 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] La vista de texto dice qué commits llevan release y lo anuncia a quien usa lector de pantalla. Comprobar: prueba de la vista y un paso del smoke.
81. ~~**Práctica: switch y restore**~~ hecho en #165 · Público · 2×2/2. [inv. 2026-10-13] [parte del ítem 31] La terminal de práctica entiende `switch`, `switch -c` y `restore`. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
82. ~~**Capa para streaming, quinta entrega**~~ hecho en #161 · Plataformas · 1×2/1. [inv. 2026-10-13] [parte del ítem 11] `&title=` pone un rótulo propio sobre la capa, escapado. Comprobar: prueba de la lectura de la URL y un paso del smoke.
83. ~~**Salud del repo: tendencia de merges**~~ hecho en #164 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] El panel de salud muestra los PRs fusionados por semana de las últimas 8, como ya hace con los despliegues. Comprobar: `tools/health.test.mjs` con fechas fabricadas.
84. ~~**Constelación ordenada, en la URL**~~ hecho en #166 · Escala. [parte del ítem 26] `?order=activity` abre la constelación ya ordenada por actividad (`C.orderParam` en `js/constellation.js`).
85. ~~**Práctica: tag -d y cherry-pick --abort**~~ hecho en #168 · Público. [parte del ítem 31] `cherry-pick --no-commit` deja el pick a medias hasta un `commit` o `cherry-pick --continue`; `cherry-pick --abort` lo cancela; noveno ejercicio («tagabort»).
86. ~~**Vista de texto: forks activos**~~ hecho en #169 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] La vista de texto lista los forks activos ya cargados, el más reciente primero, y lo anuncia a quien usa lector de pantalla. Comprobar: prueba de la vista y un paso del smoke.
87. ~~**Salud del repo: tendencia de PRs abiertos**~~ hecho en #170 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] El panel de salud muestra cuántos PRs se abrieron por semana en las últimas 8. Comprobar: `tools/health.test.mjs` con fechas fabricadas.
88. ~~**Capa para streaming, sexta entrega**~~ hecho en #173 · Plataformas · 1×2/1. [inv. 2026-10-13] [parte del ítem 11] `&max=N` limita cuántas ramas muestra la capa, escapando y acotando el valor. Comprobar: `tools/embed.test.mjs` y un paso del smoke.
89. ~~**Los forks en el grafo, cuarta entrega**~~ hecho en #174 · Datos · 1×2/2. [inv. 2026-10-13] [parte del ítem 30] El panel de forks suma las estrellas de cada fork (ya vienen en `/forks`) y deja ordenar por ellas. Comprobar: `tools/health.test.mjs` con forks fabricados.
90. ~~**Práctica: revert --abort y rebase --abort**~~ hecho en #176 · Público · 2×2/2. [inv. 2026-10-13] [parte del ítem 31] La terminal de práctica entiende `revert --abort` y `rebase --abort`, y vuelve al estado de antes del comando. Comprobar: prueba del simulador y un paso del smoke.
91. ~~**Resumen de la semana: autores nuevos**~~ hecho en #178 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 23] El resumen de la semana dice cuántas personas aportaron por primera vez en el repo, con los datos ya cargados. Comprobar: prueba del resumen y un paso del smoke.
92. ~~**Capa para streaming, séptima entrega**~~ hecho en #181 · Plataformas · 1×2/1. [inv. 2026-10-13] [parte del ítem 11] `&hide=` oculta partes de la capa (leyenda, rótulo o reloj) para quien arma su escena de OBS. Comprobar: prueba de `embedOptions` y un paso del smoke.
93. ~~**Constelación ordenada por nombre, en la URL**~~ hecho en #189 · Escala · 1×2/1. [inv. 2026-10-13] [parte del ítem 26] `?order=name` abre la constelación ordenada alfabéticamente, junto a `?order=activity`. Comprobar: prueba de la lectura de la URL y un paso del smoke.
94. ~~**Vista de texto: PRs abiertos por rama**~~ hecho en #191 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de cada rama dice cuántos PRs abiertos tiene, con los PRs ya cargados. Comprobar: prueba de la vista y un paso del smoke.
95. ~~**Salud del repo: tendencia de issues cerrados**~~ hecho en #192 · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] El panel de salud muestra los issues cerrados por semana de las últimas 8, con las actividades ya cargadas. Comprobar: `tools/health.test.mjs` con fechas fabricadas.
96. ~~**Resumen de la semana: commits por día**~~ hecho en #193 · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 23] El resumen de la semana suma los commits de cada uno de los 7 días, en una línea de siete cifras, para ver el ritmo. Comprobar: `tools/digest.test.mjs` con commits fabricados.
97. ~~**Vista de texto: ramas quietas**~~ hecho en #195 · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de una rama sin commits en 30 días lo dice («sin actividad»), con lo ya cargado. Comprobar: prueba de la vista y un paso del smoke.
98. ~~**Capa para streaming, octava entrega**~~ hecho en #203 · Plataformas · 1×2/1. [inv. 2026-10-13] [parte del ítem 11] `&spin=0` apaga la rotación lenta de la vista 3D de la capa, para una escena de OBS quieta (el tema ya lo fija `&theme=`, ítem 74). Comprobar: prueba de `embedOptions` y un paso del smoke.
99. **Salud del repo: tendencia de ramas nuevas** · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] El panel de salud muestra cuántas ramas se crearon por semana en las últimas 8, con las actividades ya cargadas. Comprobar: `tools/health.test.mjs` con fechas fabricadas.
100. ~~**Práctica: reset --mixed y reflog**~~ hecho en #204 · Público · 2×2/2. [inv. 2026-10-13] [parte del ítem 31] La terminal de práctica entiende `reset --mixed` y `reflog`, para recuperar un commit tras un `reset --hard`. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
101. ~~**Constelación: filtrar por nombre en la URL**~~ hecho en #206 · Escala · 1×2/1. [inv. 2026-10-13] [parte del ítem 26] `?constellation=texto` deja en la constelación solo los repos cuyo nombre lo contiene. Comprobar: prueba de la lectura de la URL y un paso del smoke.
102. **Resumen de la semana: ramas nuevas** · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 23] El resumen de la semana dice cuántas ramas se crearon en los últimos 7 días, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con ramas fabricadas.
103. **Vista de texto: ramas fusionadas** · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de una rama ya fusionada en la por defecto lo dice, con lo ya cargado. Comprobar: prueba de la vista y un paso del smoke.
104. **Salud del repo: tendencia de commits** · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] El panel de salud muestra los commits por semana de las últimas 8, con lo ya cargado. Comprobar: `tools/health.test.mjs` con fechas fabricadas.
105. ~~**Capa para streaming, novena entrega**~~ hecho en #207 · Plataformas · 1×2/1. [inv. 2026-10-13] [parte del ítem 11] `&lang=` ya fija el idioma; `&view=2d|3d` fija la vista de la capa sin tocar la de la página. Comprobar: prueba de `embedOptions` y un paso del smoke.
106. ~~**Práctica: commit --amend**~~ hecho en #208 · Público · 2×2/2. [inv. 2026-10-13] [parte del ítem 31] La terminal de práctica entiende `commit --amend` (con `-m`), para corregir el último commit. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
107. ~~**Fuente Azure DevOps**~~ hecho en #200 · Fuentes · 2×3/3. [replica must 2026-10-28] El primer must que falta frente a GitKraken (su ayuda «Azure DevOps», <https://help.gitkraken.com/gitkraken-desktop/azure-devops/>; `replica/parity.md`): conectar `azure:org/proyecto/repo` y dibujar sus ramas y commits con la API REST de Azure DevOps, primero repos públicos y sin token; la CSP suma solo `https://dev.azure.com`. Si esa API no admite CORS desde la página, la primera entrega es de la app de escritorio, dicho en el README. Comprobar: `tools/azure.test.mjs` con la API simulada y un paso del smoke.
108. ~~**Launchpad: los PRs de todos los repos seguidos, por estado**~~ hecho en #199 · Escala · 2×3/2. [replica must 2026-10-28] El otro must que falta (ayuda «Launchpad», <https://help.gitkraken.com/gitkraken-desktop/gitkraken-launchpad/>): con dos o más repos abiertos, la vista conjunta «Todos» suma una lista única de sus PRs abiertos agrupados por estado (borrador, checks en rojo, aprobados, esperando revisión), con lo ya cargado de cada pestaña; cada fila lleva a su rama en su pestaña. Comprobar: prueba de la agrupación con PRs fabricados y un paso del smoke con la API simulada.
109. ~~**Historial de un archivo**~~ hecho en #202 · Análisis · 2×2/1. [replica 2026-10-28] Frente al historial de archivo de GitKraken (ayuda «Diffs, File History and Blame», <https://help.gitkraken.com/gitkraken-desktop/diff/>): cada archivo de los cambios de un commit suma «Historial», que aplica el filtro por ruta a ese archivo (`?path=`) y deja a la vista los commits ya cargados que lo tocaron. Comprobar: un paso del smoke (de un archivo del diff al grafo filtrado por su ruta).
110. ~~**Ocultar una rama o dejarla sola**~~ hecho en #210 · Análisis · 2×2/2. [replica 2026-10-28] Frente a «Hide and Solo» del grafo de GitKraken (ayuda «Interface», <https://help.gitkraken.com/gitkraken-desktop/interface/>): la ficha de una rama suma «Ocultar» y «Solo esta», en 2D y en 3D, recordados por repo y con un botón para volver a verlas todas. Comprobar: prueba de la selección de ramas y un paso del smoke.
111. ~~**Primer padre en el grafo**~~ hecho en #212 · Análisis · 2×2/2. [replica 2026-10-28] Lo pide un usuario de GitKraken, que no lo tiene («it lacks the ability to show first parent only», <https://news.ycombinator.com/item?id=40486993>; `replica/fixes.md`): un interruptor deja en el grafo 2D solo la cadena del primer padre de cada rama, como `git log --first-parent`, con lo ya cargado, y viaja en la URL. Comprobar: prueba de la selección de commits y un paso del smoke.
112. ~~**Vista de un PR: descripción y comentarios**~~ hecho en #211 · Datos · 2×2/2. [replica 2026-10-28] Frente a la vista de PR de GitKraken (ayuda «Pull Requests», <https://help.gitkraken.com/gitkraken-desktop/pull-requests/>): la ficha de una rama con PR de GitHub suma la descripción del PR y sus últimos comentarios, con una consulta solo al pulsar. Comprobar: `tools/github.test.mjs` con la API simulada y un paso del smoke.
113. **Token para Azure DevOps (proyectos privados)** · Fuentes · 2×2/2. [parte del ítem 107] La primera entrega de Azure DevOps lee solo proyectos públicos: un campo «Token de Azure DevOps» en Ajustes (un token de acceso personal con el permiso `Code (Read)`, enviado como `Authorization: Basic` solo a `dev.azure.com`, guardado como el de Bitbucket y cifrado con el llavero en escritorio) abre los privados, y con él una redirección al inicio de sesión deja de ser «no encontrado» para ser «token rechazado». Comprobar: `tools/azure.test.mjs` (el token va solo a dev.azure.com y en cada consulta) y el paso del smoke del token.
114. **Capa para streaming, décima entrega** · Plataformas · 1×2/1. [parte del ítem 11] `&branch=nombre` deja en la capa solo esa rama y la rama por defecto (el nombre se compara tal cual, sin tocar el DOM como HTML). Comprobar: prueba de `embedOptions` y un paso del smoke.
115. **Práctica: merge --no-ff** · Público · 2×2/2. [parte del ítem 31] La terminal de práctica entiende `merge --no-ff`, que crea el commit de fusión aunque se pudiera avanzar. Comprobar: `tools/gitsim.test.mjs` y un paso del smoke.
116. **Ocultar o dejar sola una rama, en la URL** · Análisis · 1×2/1. [parte del ítem 110] `?solo=rama` y `?ocultar=rama` abren el repo ya con ese filtro. Comprobar: prueba de la lectura de la URL y un paso del smoke.
117. **Azure DevOps: los PRs en el grafo** · Datos · 1×2/2. [parte del ítem 107] Los pull requests de un repo de Azure DevOps salen en el grafo como los de GitHub. Comprobar: `node --test` con la API simulada y un paso del smoke.
118. **Vista de un PR en la URL** · Datos · 1×2/1. [parte del ítem 112] `?pr=N` abre la vista del PR (descripción y comentarios). Comprobar: prueba de la lectura de la URL y un paso del smoke.

## Cómo validar un cambio

`npm run check` corre todo lo de abajo en orden (elige Chromium y Electron solo, y las e2e si el
cambio toca la página o el escritorio) e imprime la línea `Validado:` de la bitácora. Los comandos
sueltos:

```sh
node --test                    # lógica contra una API de GitHub simulada y el service worker (tools/*.test.mjs)
node tools/check-i18n.mjs      # traducciones contra el inglés
node tools/smoke.mjs           # la demo en Chromium: 3D, 2D, vuelo, Replay, diálogos, RTL, celular
node tools/smoke.mjs --langs   # además los 40 idiomas en pantalla de celular
xvfb-run -a npm run test:e2e -- --grep-invert @lento   # app de escritorio y web (tras npm ci)
```

Si el Playwright del proyecto no encuentra su Chromium, `PLAYWRIGHT_CHROMIUM_PATH` apunta a otro (lo
leen el smoke, la auditoría y las e2e).

`node tools/audit.mjs --puerta` (la corre `npm run check` cuando el cambio toca la página) busca en
Chromium errores, violaciones del CSP, peticiones a otros sitios, desbordes, controles sin nombre o
chicos, foco perdido, texto sin traducir y consultas de más a la API de GitHub, y falla si aparece un
hallazgo que no está en `tools/audit-base.json` (dos corridas seguidas, para no frenar por algo pasajero).
`node tools/audit.mjs` es la auditoría completa (con medidas de rendimiento; `--langs`, los 40 idiomas).

## Protocolo de QA

Cada iteración revisa su propio cambio con esta lista antes de `npm run check`, y la entrada de la
bitácora lo dice en `- QA:` (qué filas tocó el cambio y cómo se miraron; la auditoría, con su línea).

| Qué | Lo mira solo | A mano, si el cambio lo toca |
| --- | --- | --- |
| Web y escritorio | e2e web y de escritorio | la capacidad en la app de escritorio, no solo en la web |
| 2D y 3D, galaxias, vuelo, Replay, modo TV | smoke; auditoría (escenarios de cada uno) | la capacidad en cada vista y modo |
| Demo sin token | smoke (falla si la demo consulta `api.github.com`); auditoría (`externa`) | que se vea en la demo |
| Sin conexión e instalable | e2e web (abre sin red); `tools/pwa.test.mjs` (la lista `FILES` de `sw.js`) | un archivo nuevo en `js/` va a `FILES` |
| 40 idiomas, derecha a izquierda, textos largos | `check-i18n`; smoke `--langs`; auditoría (es, ar, de, ta; completa con `--langs`) | el texto nuevo en árabe y en tamil |
| Teclado y lector de pantalla | auditoría (`sin-nombre`, `foco-*`, `dialogo-foco`, `trampa`); smoke (foco) | recorrer la capacidad solo con Tab, Enter y Esc |
| Movimiento reducido | smoke; auditoría completa (`animacion-infinita`) | animaciones nuevas con su versión quieta |
| Celular angosto | smoke (390 px); auditoría (390 px; completa, 320 px) | |
| Consola limpia y CSP | smoke; e2e web; auditoría (`error`, `csp`) | un servidor nuevo, solo en su directiva |
| Cuota de GitHub | auditoría (`cuota-sin-token` contra la base); `tools/github.test.mjs` | apagado, no gasta nada |
| Rendimiento | auditoría completa (medidas y presupuestos; `--comparar`) | lo que corre por cuadro |

## Mantenimiento: pendientes

Los toman las iteraciones de mantenimiento (una de cada cuatro, rotando el subtipo según la regla 2 de
la directiva) y, si son **Alta**, cualquiera. Cada pendiente lleva su subtipo entre corchetes (`[Errores]`,
`[QA]`, `[Accesibilidad]`, `[Seguridad]`, `[Rendimiento]` o `[Deuda]`) y va en su prioridad: **Alta** (la
app en blanco, datos perdidos, seguridad, `master` en rojo: va antes que todo), **Media** (una función
rota para alguien, una prueba intermitente que frena la puerta) o **Baja**. Dentro de cada una, por
impacto, con su reproducción. Los hallazgos de `node tools/audit.mjs` que se aceptan como conocidos
(`tools/audit-base.json`) tienen aquí su pendiente, que cita el tipo como `audit:<tipo>`. Salen de las
auditorías del código (iteraciones 1 y 6), de la auditoría con `tools/audit.mjs` (2026-10-13) y de lo
que falla al validar; los números de línea son de cuando se miró y pueden haberse movido.

### Media

1. [Deuda] El paso del smoke «editar el código: desde los cambios de un commit se abre su archivo en la rama…» falló
    1 de 3 corridas en la iteración 148 (sesión cloud con otras cinco corriendo a la vez), en una copia sin el cambio
    de esa iteración: un clic sobre un elemento que la demo ya había reemplazado. Medir con 5 corridas y esperar
    al elemento estable en lugar de guardar su handle. Reproducción: `node tools/smoke.mjs` →
    `✗ editar el código: …: elementHandle.click: Element is not attached to the DOM`.
2. [Deuda] Pasos del smoke intermitentes en la sesión cloud: en la iteración 152, `npm run check` falló 2 de 3 veces
    en «filtro por autor: el grafo y el árbol de texto muestran solo sus ramas…» (la tercera pasó, y el paso no toca
    lo que cambió esa iteración) y una corrida del smoke sobre `dev` limpio falló en otro, «al cerrar el último repo
    de la organización deja de seguirse». Medir con 5 corridas del paso y esperar el estado en lugar de comparar con
    el conteo base de ramas (la demo sigue publicando). Reproducción: `xvfb-run -a node tools/smoke.mjs` →
    `✗ filtro por autor: …: quitar el filtro no deja el grafo como estaba`.
    En la iteración 160 falló una vez, y pasó a la repetición, «vista de texto: árbol con teclado, nombres accesibles y
    Enter lleva al grafo» (`el release de la demo no se dice (2): Novedades: 0 ramas, 1 commits`): depende de lo que la
    demo publica en ese momento.

### Baja

3. [Deuda] `tools/i18n-add.mjs`: los textos nuevos entran a los 40 idiomas desde un JSON
    `{clave: {en, es, …}}` (plurales como objeto) en un solo paso, tras `--despues=clave` o reemplazando,
    todo o nada (valida los 40 códigos de `LOCALES` y el ancla antes de escribir), escapa comillas y
    corre `check-i18n` al final; `--verificar` solo informa. Pruebas sobre una copia temporal de
    `js/locales`. Motivo: #51 tocó los 40 archivos y cada uno se leyó entero antes de editarlo.
4. [Deuda] Más pruebas: modo GraphQL y mapeo de eventos (`mapEvent`) con la API simulada; separar
    `github.js` (1.200 líneas) en HTTP/cuota, los tres modos y el mapeo.
5. [Deuda] `CHANGELOG.md` desde los títulos de PR (`git log --format=%s`, los que terminan en `(#N)`) y
    versión en `package.json` en cada iteración de mantenimiento; el tag y el Release con instaladores
    los hace Benjamin (sin credencial para crearlo ni instaladores en este entorno). Sin regla
    bloqueante en `--check`.
6. [Deuda] Guarda de las cifras de «Validado:»: comparar `(\d+) pruebas` y `(\d+) e2e` de la última
    entrada con `node --test` y `npx playwright test --list --grep-invert @lento`, como aviso y con un
    flag `--sin-suites` que pasen `loop.test.mjs` y `npm run check` (evita la recursión).
7. [Rendimiento] El primer arranque de la app de escritorio en una sesión tardó 14,7 s hasta salir de
    «cargando» (con un repo local de 1.000 ramas y `--lang=ar`); los siguientes, 1,3–1,6 s en es, ar y ta.
    Es el arranque en frío de Electron (caché de disco), no el repo ni el idioma; sin medir sin repo.
    Reproducción: `xvfb-run npx playwright test` con `launch` + `--local=` sobre 1.000 ramas, primer `launch`.
8. [Deuda] `node tools/smoke.mjs` solo no encuentra Chromium en la sesión cloud (Playwright pide
    `chromium_headless_shell-1243` y hay `1194`) y sale 1; con `PLAYWRIGHT_CHROMIUM_PATH` pasa, y
    `tools/audit.mjs` ya lo resuelve con `chromiumPath()`. Que el smoke use la misma búsqueda.
    Reproducción: `node tools/smoke.mjs` → `browserType.launch: Executable doesn't exist at …1243…`.
9. [Deuda] `node tools/audit.mjs --langs` tarda ~145 s en la sesión cloud y la herramienta de shell lo
    manda al fondo a los 120 s; la puerta normal no. Documentar en «Cómo validar» que se corra con
    `run_in_background` o partir `--langs` por lotes de idiomas.
    Reproducción: `time node tools/audit.mjs --langs` → ~145 s.
10. [QA] Con un repo a 320 px el grafo queda bajo las tarjetas (más de 1.200 px de scroll con la barra de
    vistas, las estadísticas y la bitácora encima) y el 3D no arma etiquetas hasta verse; pensar en una
    forma de llegar al grafo sin recorrer la página (ancla o tarjetas plegables en celular).
    Reproducción: Playwright, 320×640, `?repo=acme/web` con la API simulada de la auditoría → captura sin grafo; `#graph3d` fuera de la pantalla.
11. [Deuda] `node tools/audit.mjs` no admite correr un solo escenario: probar uno nuevo cuesta ~75 s de la
    completa. Añadir `--escenario <nombre>`.
    Reproducción: `node tools/audit.mjs --escenario celular-320-3d-mil` → `opción desconocida: --escenario`.
12. [Seguridad] La versión de Electron (`44.4.5` en `package.json`) no se pudo comparar con la última estable:
    `WebFetch` a `releases.electronjs.org` dio HTTP 500 en la iteración 119. Repetir la comparación
    cuando la página responda y subir si hay una estable más nueva.
    Reproducción: `WebFetch https://releases.electronjs.org/release/stable` → `HTTP 500`.
13. [Deuda] `node tools/smoke.mjs` tarda ~8 min en la sesión cloud (Chromium sin GPU) y la herramienta de shell lo
    corta a los 120 s; documentar en «Cómo validar» que se corra en segundo plano, como `audit --langs`.
    Reproducción: `time node tools/smoke.mjs` → ~480 s.
14. [Deuda] El paso del smoke «filtro por autor…» sigue siendo intermitente en la sesión cloud: falló 1 de 2
    `npm run check` en la iteración 128 (la repetición pasó), aun con la espera de la 127.
    Reproducción: `npm run check` → `✗ filtro por autor: …: quitar el filtro no deja el grafo como estaba`.

- Ideas menores de la auditoría de la iteración 6: la caché de archivos de las galaxias limita
  entradas y no tamaño (`galaxy.js:1987`); `placeLabels`/`placeNotes` crean arreglos por cuadro
  (`graph3d.js:2611`); el contenedor 2D enfocable no tiene rol ni nombre (`graph.js:306`); las marcas
  de la brújula del mundo abierto son botones que se mueven y ocultan cada cuadro (`world.js:849`).

## Bitácora

Las entradas anteriores están en [`docs/BITACORA.md`](docs/BITACORA.md) (las lleva `node tools/loop.mjs --rotar`); el loop lee las dos.

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
