# Mejora continua

Hoja de ruta, pendientes y bitácora de las iteraciones del loop (una cada 2 horas). Las entradas viejas
de la bitácora están en [`docs/BITACORA.md`](docs/BITACORA.md) y los ítems hechos de la hoja de ruta en
[`docs/HOJA.md`](docs/HOJA.md) (los lleva `node tools/loop.mjs --rotar`): son historia y no hace falta leerlos.

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
6. **El loop no tiene quién lo dispare** (desde 2026-10-31). `list_triggers` de la cuenta no lista «GraphBranch:
   iteración del loop (sesión nueva por disparo)» (cron `3 */2 * * *`; el 2026-11-01 tampoco) y en toda la historia
   no hay un solo commit de `OpenCode <opencode@localhost>`, así que tampoco corre el cron de `tools/opencode.mjs`.
   `--salud` da un hueco de 27,4 h (2026-10-30 16:16 → 2026-10-31 19:42 UTC) y otro de 5,5 h desde la fusión de
   #222 (2026-10-31 22:04 UTC) hasta que otra sesión reanudó la 173 (2026-11-01 03:32). Recrear la Routine en claude.ai/code →
   Routines con `.claude/skills/iteracion/PROMPT.md` byte a byte (cambió el 2026-11-01: suma que el turno
   terminado es la corrida terminada y que lo largo se espera con `node tools/esperar.mjs`), o poner el cron de
   OpenCode del README; si la vía es otra, decirlo en la sección «Routine» de la skill y en el README.

## Mapa de alcance

Lo que cubre hoy cada eje y lo que viene en la hoja de ruta. Cada expansión pasa lo suyo de la
segunda columna a la primera.

| Eje | Hoy | Siguiente |
| --- | --- | --- |
| Fuentes | GitHub.com y GitHub Enterprise Server (GraphQL, lista y eventos), gitlab.com (proyectos públicos y, con token, privados, con sus eventos), codeberg.org (API de Forgejo, repos públicos y, con token, privados), bitbucket.org (API 2.0 de Bitbucket Cloud, repos públicos y, con token, privados), GitLab propio (`?gitlab=` / `--gitlab-url`, con su CSP), Forgejo/Gitea propio (`?forge=` / `--forge-url`, con su CSP), Bitbucket Data Center propio (`?bitbucket=` / `--bitbucket-url`, con su CSP y, con su token aparte y atado al servidor, privados), dev.azure.com (API REST 7.1 de Azure Repos, proyectos públicos y, con token de acceso personal, privados), repos locales (app de escritorio, con `git`), demo | token para un Forgejo/Gitea propio Una segunda cuenta de GitHub atada a un dueño u organización (su token solo va a los repos de ese dueño). |
| Datos | ramas, commits, PRs (y las pilas de PRs apilados, y la descripción y los últimos comentarios de un PR de GitHub desde la ficha de su rama o con `?pr=N`), revisiones, issues, releases, estrellas, forks (y los forks con actividad reciente, por push más reciente o por estrellas, en el panel de salud, con un interruptor y `?forks=0`), archivos (galaxias), CI de GitHub (checks de la cabeza de las ramas y los PRs), tags de GitHub y de Azure DevOps y despliegues de GitHub (banderín y placa en el grafo), los cambios de cada commit (diff archivo por archivo, de un commit al siguiente, en todas las fuentes, y quién tocó cada archivo en GitHub y la demo), el agente de cada commit (Claude Code, Copilot, Codex, Cursor, Devin, Jules, Gemini, OpenCode, Aider, OpenHands y los bots), con su modelo y su sesión, por su cuenta, su nombre o sus trailers (`Co-Authored-By`, `Claude-Session`) | CI de GitLab, estado de los despliegues |
| Plataformas | web estática (GitHub Pages pendiente de activar: lo comprueba `node tools/loop.mjs --publicado`), instalable y sin conexión (PWA), escritorio (Windows, macOS, Linux), modo TV, widget embebible (`?embed=1`, con `&bg=` transparente o de color, `&hide=` (avisos, combo, leyenda, rótulo y fechas), `&rotate=` entre repos, `&theme=` claro u oscuro y `&title=` con un rótulo propio, `&max=` con el tope de ramas y `&spin=0` que aquieta la vista 3D, `&view=2d|3d` que fija la vista, `&branch=` que deja una sola rama, `&pr=1` que deja solo las ramas con un PR abierto), extensión de VS Code (sigue la sesión de GitHub del editor y recuerda repos, vista e idioma entre sesiones; paquete listo, sin publicar) | extensión de Chrome o Firefox, app móvil |
| Escala | hasta 10 repos con alias propio en cada pestaña (también los más activos de una organización o un usuario, con su lista al día) y su constelación (cada repo, una galaxia, ordenable por pestañas, actividad, PRs abiertos o nombre, también desde la URL con `?order=activity`, `?order=prs` o `?order=name`, filtrable por nombre con `?constellation=texto` y por actividad con `?recent=30`), miles de ramas por repo, el Launchpad de la vista conjunta (los PRs abiertos de todos los repos seguidos, por estado: borrador, checks en rojo, aprobados y esperando revisión) | una organización entera con más de 10 repos a la vez |
| Salidas | panel de actividad, avisos, sonido, notificaciones, URL para compartir, imagen de la vista (PNG), video del Replay (WebM, por tramo de fechas y con título propio, también desde la URL), avisos a Slack, Discord y Teams (escritorio), resumen de la semana (Markdown, con PRs abiertos, issues cerrados, releases, tags, autores nuevos, ramas nuevas y commits por día, de un repo o de una organización seguida; PNG, de un repo o de una organización), prompt del loop autónomo para cualquier repo (español o inglés, con repo, ramas y objetivo; se copia o se guarda como `.md`) | el resumen de la semana de una organización con sus issues cerrados |
| Análisis | resumen de cifras, logros, misión del día, salud del repo (ramas olvidadas, PRs por edad, tiempo a fusionar, ritmo, issues cerrados, ramas nuevas y commits por semana), choques entre ramas, también desde la URL (`?conflicts=1`), los archivos que cambió un commit de Azure DevOps (sin el diff), comparar dos ramas (por delante, punto de separación, archivos), búsqueda de commits por mensaje, SHA o autor, filtrar el grafo (2D y 3D) por ruta de archivo, también desde la URL (`?path=`) y desde el botón «Historial» de cada archivo del diff, filtrar el grafo por autor ("mis ramas"), también desde la URL (`?author=`), ocultar una rama o dejarla sola desde su ficha (2D y 3D, por repo), el grafo de primer padre (2D, 3D y vista de texto) como `git log --first-parent`, también desde la URL (`?firstparent=1`), búsqueda de commits también desde la URL (`?q=`), búsqueda por fecha (`desde:` y `hasta:`), resaltar en el grafo (2D y 3D) el tramo de cada rama comparada y su punto de separación, PRs fusionados y abiertos por semana en la salud (las últimas 8), vocabulario DORA en la salud (despliegues en 30 días y por semana, mediana entre releases, tiempo de entrega desde el primer commit del PR), PRs por estado en la salud (borrador, checks en rojo, aprobados, esperando revisión), tasa de fallos de CI en la salud (PRs abiertos en rojo y veces que la rama por defecto se puso roja en 30 días), el panel de salud abierto desde la URL (`?health=1`), ramas ocultas o sola una desde la URL (`?ocultar=`, `?solo=`), bitácora en vivo al estilo de Brunell_Node (la quinta cifra del resumen: desde la bitácora anterior, lo grande, commits por día, nota del 1 al 100 de ritmo, publicado y salud con su origen, hallazgos con su gravedad y su seguimiento, cronología y qué sigue; se cierra, se guarda en el navegador y sale en Markdown o `estado.json`), agentes e interacciones (quién continuó, fusionó, revisó o comentó el trabajo de quién, entre personas, entre agentes y entre unos y otros, con cada sesión de un agente aparte, en una red y en listas, «Solo entre agentes», también desde la URL con `?agents=1`) | ver la hoja de ruta |
| Público | devs y equipos, 40 idiomas, teclado, quien aprende git (repo de práctica con terminal (`cherry-pick` (con `--no-commit`/`--abort`), `revert` (con `--no-commit`/`--abort`), `rebase -i` (con `--abort`/`--continue`), `stash`, `tag` (con `-d`), `reset` (`--soft`/`--mixed`/`--hard`, con `HEAD@{n}`), `commit --amend` (con `-m`) y `reflog`, `switch`, `restore`, `branch -m` (con `-M`) y `merge --no-ff` (con `-m`), `--no-commit` y `--abort` incluidos) y ejercicios, también propios compartidos por URL con pistas, solución propuesta que se muestra paso a paso con `solution=1` y condiciones sobre el mensaje del último commit y las ramas sin fusionar, y ensayo de comandos sobre una copia de un repo real), paleta de comandos con Ctrl+K (acciones de la barra y del grafo, y saltos a una rama o un commit por nombre o SHA, con teclado), quien usa lector de pantalla (vista de texto (también desde la URL con `?vista=texto`): árbol de ramas y commits con teclado, ocultar una rama o dejarla sola con H y S y volver a ver todas con A o su botón, filtro por rama, por autor y por ruta con su aviso, tags dichos en cada commit, forks activos y PRs abiertos por rama ya cargados ramas sin actividad hace más de 30 días dichas en su nombre y región viva con lo nuevo) | probar con NVDA, JAWS, VoiceOver y Orca |

## Hoja de ruta

Numerada en el orden en que entró cada ítem (el número no cambia: lo citan los PR, la investigación y las
otras entregas de un ítem); el loop la toma por puntaje, con los `must` de Replica primero (regla 2 de la
directiva). Cada ítem dice su eje, su puntaje (alcance × impacto / esfuerzo, de 1 a 3; de dónde sale
cada uno, en [`docs/investigacion.md`](docs/investigacion.md)), la primera entrega (la mínima que ya
sirve) y cómo comprobarla. Las notas técnicas son un punto de partida:
se comprueban antes de construir sobre ellas.

Los ítems hechos están en [`docs/HOJA.md`](docs/HOJA.md) (los lleva `node tools/loop.mjs --rotar`); el loop lee las dos hojas, y un ítem nuevo lleva el número que dice `--siguiente`.

124. ~~**Vista de texto: ocultar una rama**~~ hecho en #245 · Público · 1×2/2. [parte del ítem 110] El árbol de la vista de texto respeta las ramas ocultas o «solo esta» y deja ocultarlas desde ahí. Comprobar: `tools/textview.test.mjs` y un paso del smoke.
125. ~~**Alias de las pestañas**~~ hecho en #249 · Escala · 1×1/1. [replica 2026-10-28] La pestaña de un repo se renombra con un alias propio (doble clic o F2), recordado por repo en este navegador.
126. ~~**Varias cuentas del mismo servicio**~~ hecho en #251 · Fuentes · 1×2/2. [replica 2026-10-28]
129. **Columnas de autor y fecha en el grafo 2D** · Análisis · 1×2/2. [replica 2026-10-28] Un interruptor deja, junto a cada commit del grafo 2D, su autor y su fecha, con lo ya cargado. Comprobar: prueba del formato de la fila y un paso del smoke.
131. **Issues de Jira y Trello, primera entrega** · Fuentes · 1×2/3. [replica 2026-10-28] [parte de «Issues de Jira y Trello»] Las claves tipo `ABC-123` de los mensajes de commit y de PR se vuelven enlaces a una URL de Jira que el usuario configura (guardada en este navegador), sin consultas nuevas. Comprobar: prueba del reconocimiento de claves y un paso del smoke.
~~**Blame de un archivo, segunda entrega**~~ hecho en #236 · Datos.
133. **Resumen de la semana de la organización: ramas nuevas** · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 47] El resumen de la semana de una organización suma las ramas nuevas de cada repo seguido, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con dos repos fabricados.
134. **Salud del repo: tendencia de releases** · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] La salud muestra los releases por semana de las últimas 8, como ya hace con los merges. Comprobar: `tools/health.test.mjs` con releases fabricados.
135. **Vista de texto: ramas nuevas** · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de una rama creada en los últimos 7 días lo dice, con lo ya cargado. Comprobar: prueba de la vista y un paso del smoke.
136. **Resumen de la semana de la organización: rama más activa** · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 47] Cada repo del resumen de la organización nombra su rama más activa de la semana. Comprobar: `tools/digest.test.mjs` con dos repos fabricados.
137. **Salud del repo: tendencia de issues abiertos** · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] La salud muestra los issues abiertos por semana de las últimas 8, con lo ya cargado. Comprobar: `tools/health.test.mjs` con issues fabricados.
138. ~~**Vista de texto: ver todas las ramas desde la vista**~~ hecho en #248 · Público · 1×2/1. [inv. 2026-10-13] [parte del ítem 110] Con ramas ocultas, la vista de texto suma un botón «Ver todas las ramas» (y la tecla A) que limpia el filtro como el del grafo, sin cerrar el árbol. Comprobar: `tools/textview.test.mjs` y un paso del smoke.
139. **Vista de texto: CI de cada rama** · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de una rama dice si su último CI ya cargado falló («CI fallando»), con una marca. Comprobar: prueba de la vista con `data.ci` fabricado y un paso del smoke.
140. **Vista de texto: autor de la punta de cada rama** · Público · 1×2/2. [inv. 2026-10-13] [parte del ítem 33] El nombre accesible de una rama dice quién hizo el commit de su punta, con lo ya cargado. Comprobar: `tools/textview.test.mjs` y un paso del smoke.
141. **Salud del repo: tendencia de PRs fusionados** · Análisis · 1×2/2. [inv. 2026-10-13] [parte del ítem 12] La salud muestra los PRs fusionados por semana de las últimas 8, como ya hace con los merges, con lo ya cargado. Comprobar: `tools/health.test.mjs` con PRs fabricados.
142. **Resumen de la semana: PRs fusionados por autor** · Salidas · 1×2/2. [inv. 2026-10-13] [parte del ítem 23] El resumen de la semana nombra quién fusionó más PRs, con lo ya cargado. Comprobar: `tools/digest.test.mjs` con PRs fabricados.
~~**Constelación: ordenar por PRs abiertos**~~ hecho en #247 · Escala.
~~**Constelación: solo los repos con actividad reciente, en la URL**~~ hecho en #239 · Escala.

## Cómo validar un cambio

`npm run check` corre todo lo de abajo en orden (elige Chromium y Electron solo, y las e2e si el
cambio toca la página o el escritorio) e imprime la línea `Validado:` de la bitácora. Tarda de 8 a 15
minutos (el smoke solo, unos 8): en una sesión se lanza con `node tools/esperar.mjs --lanzar puerta -- npm
run check` y se espera con `node tools/esperar.mjs puerta` (`timeout: 600000`; sale 124 mientras sigue), como
dice «Comandos largos» en la skill; lo mismo el smoke y la auditoría sueltos. Los comandos sueltos:

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

1. [Deuda] Pasos del smoke intermitentes en la sesión cloud: en la iteración 152, `npm run check` falló 2 de 3 veces
    en «filtro por autor: el grafo y el árbol de texto muestran solo sus ramas…» (la tercera pasó, y el paso no toca
    lo que cambió esa iteración) y una corrida del smoke sobre `dev` limpio falló en otro, «al cerrar el último repo
    de la organización deja de seguirse». Medir con 5 corridas del paso y esperar el estado en lugar de comparar con
    el conteo base de ramas (la demo sigue publicando). Reproducción: `xvfb-run -a node tools/smoke.mjs` →
    `✗ filtro por autor: …: quitar el filtro no deja el grafo como estaba`. Volvió a fallar 1 de 2 en la reanudación
    de la 173 y, el 2026-11-03 (iteración 183), 4 pasos a la vez en una corrida (con «vista de un PR» y «cambios de un commit: con teclado») que pasó entera a la repetición (2026-11-01, carga 9 en 4 CPU).
    En la iteración 160 falló una vez, y pasó a la repetición, «vista de texto: árbol con teclado, nombres accesibles y
    Enter lleva al grafo» (`el release de la demo no se dice (2): Novedades: 0 ramas, 1 commits`): depende de lo que la
    demo publica en ese momento.
    «historial de un archivo» (2 de 3 en la iteración 167, 2 de 2 en la reanudación de la 173) quedó arreglado en #224:
    el paso anterior deja el grafo en el primer commit cargado y, con unos minutos de demo, `heads[3]` es una etiqueta
    fuera de la vista (`display: none`), el foco no llega y Enter no abre su ficha (3 de 3 con 6 min de demo, también
    sobre `origin/dev`). El mismo patrón (`heads[heads.length > 3 ? 3 : 0].focus()` sin mirar si está a la vista ni si
    sale) estaba en «ocultar una rama o dejarla sola…» (falló 1 de 2 en esa reanudación, `waitForFunction: Timeout
    15000ms`) y en «cambios de un commit: desde su ficha, con teclado…» (1 de 3 en la misma reproducción): arreglado en
    la iteración 191 con `openBranchTip` (`tools/smoke.mjs`: End, etiquetas a la vista, sin `.exit` y sin la rama por
    defecto, que no se oculta) y esperando por conteo de etiquetas vigentes; «filtro por autor» ya no compara con el
    conteo base sino con el filtrado. Queda por medir con 5 corridas seguidas del smoke (la 191 vio una en verde tras el
    arreglo) y la intermitencia de «vista de texto: árbol con teclado…» y «al cerrar el último repo…».
    El 2026-11-04 (iteración 196, carga alta en la nube) el smoke falló en tres corridas seguidas, cada una en pasos ajenos
    al cambio: «historial de un archivo» y «quién tocó un archivo» (2 de 2, también sobre `origin/dev` limpio: la ruta se
    leía del primer archivo del panel y el clic llegaba después, con la demo ya redibujado; la 196 las hizo atómicas),
    «vista de texto: árbol con teclado…» (1 de 3) y «filtro por autor…» (`quitar el filtro no deja el grafo como estaba (3
    etiquetas, con el filtro 3, antes 8)`, 1 de 3).
2. [Deuda] La e2e de escritorio «--bitbucket-url suma solo ese host a las conexiones del CSP…» falló 1 de 2 en la
    reanudación de la 173 (2026-11-01, carga 18 en 4 CPU; la repetición pasó): `#azure-token-input` vacío al abrir
    Ajustes. Es una carrera de la prueba: guarda el token de Azure con `GBDesktop.setToken(…, 'azure')` con la página ya
    arrancada, y `loadDesktopToken` (`js/app.js`) lee el llavero una sola vez al arrancar; si ya leyó `azure`, el campo
    queda vacío. Guardar el token y reabrir la app antes de mirar Ajustes, como «el token de GitLab… vuelve al reabrir».
    Reproducción: `xvfb-run -a npx playwright test e2e/desktop.spec.mjs -g "bitbucket-url"` con el equipo cargado →
    `expect(locator('#azure-token-input')).toHaveValue('az-e2e')` · `Received: ""`.

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
7. [Deuda] `node tools/smoke.mjs` solo no encuentra Chromium en la sesión cloud (Playwright pide
    `chromium_headless_shell-1243` y hay `1194`) y sale 1; con `PLAYWRIGHT_CHROMIUM_PATH` pasa, y
    `tools/audit.mjs` ya lo resuelve con `chromiumPath()`. Que el smoke use la misma búsqueda.
    Reproducción: `node tools/smoke.mjs` → `browserType.launch: Executable doesn't exist at …1243…`.
8. [Deuda] `node tools/audit.mjs` no admite correr un solo escenario: probar uno nuevo cuesta ~75 s de la
    completa. Añadir `--escenario <nombre>`.
    Reproducción: `node tools/audit.mjs --escenario celular-320-3d-mil` → `opción desconocida: --escenario`.
9. [Deuda] El paso del smoke «filtro por autor…» sigue siendo intermitente en la sesión cloud: falló 1 de 2
    `npm run check` en la iteración 128 (la repetición pasó), aun con la espera de la 127.
    Reproducción: `npm run check` → `✗ filtro por autor: …: quitar el filtro no deja el grafo como estaba`.
    También «ocultar una rama o dejarla sola» (`page.waitForFunction: Timeout 15000ms exceeded`): falló en la
    primera puerta de la iteración 179 y pasó en la repetición (antes, en la 166). Los dos juntos fallaron
    en la primera puerta de la 188 y pasaron en la repetición.

10. [Deuda] `tools/audit.mjs --langs` repite un mismo hallazgo en cada idioma (84 fuera de la base por una sola
    regla CSS a ≤560 px): agrupar por firma y mostrar «× N idiomas» para que la causa se lea de una vez.
    Reproducción: una regla que desborde `#st-prs` a ≤560 px → `node tools/audit.mjs --langs` → 84 hallazgos `borde`.
11. [QA] A ≤560 px las cifras ya no muestran su línea de detalle (`.stat-sub`: «de N en total», la hora de la última
    actividad): se perdió información en celular. Devolverla como `title`/texto accesible de la tarjeta o en un
    plegable. Reproducción: Playwright, 320×640 → `getComputedStyle(#st-branches-sub).display` = `none`.
12. [QA] A 320 px el panel de salud se desborda hacia la derecha (28 px; 46 en tamil): la cabecera, los contadores de
    cada sección y la edad de los forks quedan cortados y el panel se desliza de lado. Visto en la iteración 174, igual
    sin su cambio. Reproducción: Playwright, 320×640, demo `?lang=es&health=1` → `#health .tr-wrap` con `scrollWidth`
    312 y `clientWidth` 284.

13. [Accesibilidad] La salud del repo repite cinco líneas casi iguales («… por semana, últimas 8 semanas (de la más vieja a la
    actual): 0 · 0 · 0 · 0 · 0 · 0 · 0 · 3»): un lector de pantalla lee la frase larga cinco veces y los ceros uno por uno.
    Dejar la frase una vez (encabezado «Por semana, de la más vieja a la actual») o resumir («3 en la última semana, 0 en
    las 7 anteriores»). Reproducción: Playwright, `?lang=es`, abrir `#health-btn` → `#hl-mergeweeks`, `#hl-openedweeks`,
    `#hl-closedweeks`, `#hl-branchweeks`, `#hl-commitweeks` repiten «últimas 8 semanas (de la más vieja a la actual)».
14. [Accesibilidad] En la vista de texto, las marcas visibles de una rama (`.tv-tag`: «fusionada…», «sin actividad…», PRs) y la
    nota de cada commit (`.tv-aside`) ya van en el `aria-label` del `treeitem`, pero son texto del nodo: según el lector se
    leen dos veces. Marcarlas `aria-hidden="true"` y comprobarlo con un lector real (ver Para Benjamin, 5).
    Reproducción: Playwright, abrir `#textview-btn` → `.tv-tag` dentro de `[role=treeitem][aria-label]` sin `aria-hidden`.

- Ideas menores de la auditoría de la iteración 6: la caché de archivos de las galaxias limita
  entradas y no tamaño (`galaxy.js:1987`); `placeLabels`/`placeNotes` crean arreglos por cuadro
  (`graph3d.js:2611`); el contenedor 2D enfocable no tiene rol ni nombre (`graph.js:306`); las marcas
  de la brújula del mundo abierto son botones que se mueven y ocultan cada cuadro (`world.js:849`).

## Bitácora

Las entradas anteriores están en [`docs/BITACORA.md`](docs/BITACORA.md) (las lleva `node tools/loop.mjs --rotar`); el loop lee las dos.

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
- Validado: pendiente
- **Siguiente:** iteración 197, expansión: ítem 129 (Columnas de autor y fecha en el grafo 2D, Análisis)
