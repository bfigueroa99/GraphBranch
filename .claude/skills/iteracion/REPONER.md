# Reponer la hoja de ruta

Parte de la skill `iteracion` (`.claude/skills/iteracion/SKILL.md`, paso 4). Se lee solo cuando hay que reponer
(regla 5 de la directiva): quedan menos de 10 ítems sin hacer, y `node tools/loop.mjs --check` lo da como ERROR
en R4.

**Que la hoja amplíe el alcance.** Una reposición deja al menos 5 ítems pendientes de alcance 2 o 3 (la escala
de `docs/investigacion.md`: 1 un nicho, 2 un grupo claro, 3 casi todos los que usan la app o un público nuevo
grande); R4 avisa cuando entre los pendientes no queda ninguno, y `--salud` lo cuenta en `Alcance:`. Salen, en
este orden, de lo que falta frente a la app de referencia, de las ideas puntuadas de la investigación que
todavía no tienen ítem, de la columna «Siguiente» del Mapa de alcance (lo grande se parte: entra su primera
entrega, regla 3 de la directiva) y, si con eso no alcanza, de investigar de nuevo aunque la investigación no
haya vencido, con fuentes nuevas (otras herramientas, otros públicos), no las mismas. «Otra entrega del ítem K» (`[parte del ítem K]`) sigue valiendo
para completar hasta 15, pero no cuenta para esos 5. El puntaje no se sube para cumplir: si de verdad no aparecen
ideas de alcance 2 o 3, se repone con lo que haya y se dice en la bitácora y, una vez, en Para Benjamin (es
quien puede abrir un frente nuevo).

Primero, la paridad con la app de referencia («Replica» en la directiva de `IMPROVEMENTS.md`: cuál es,
cadencia, qué queda fuera y por qué). Las skills del pack se leen por su ruta y se siguen con los cambios
de abajo; sus pasos que piden preguntar o esperar un sí no rigen: la directiva es la autorización.

**Pasada completa**, solo si `--check` avisa en R13 (no hay pasada, tiene más de 30 días o es de otra
app). Sin `WebFetch` no hay pasada: se dice en la bitácora y se repone con lo de siempre.

1. `.claude/skills/replica-recon/SKILL.md`. Sin preguntar: la app y la plataforma son las de la
   referencia; la tajada, el grafo de ramas y commits y lo que lo rodea para seguir un repo (ramas, PRs,
   CI, integraciones, búsqueda, filtros, varios repos); el público, el de `docs/investigacion.md`. Solo
   fuentes públicas y sin iniciar sesión, con `WebFetch` página por página; sin capturas (sus pasos de
   `replica/screens/` no se hacen). `replica/recon.md` va en español con la plantilla `recon-map.md` de
   la skill: el título nombra la app de referencia y lleva `Fecha: AAAA-MM-DD` (R13 lee las dos cosas).
   En `replica/features.csv`, `clone` es el estado de GraphBranch (`yes`, `partial` con lo que falta,
   `no`) y su nota dice dónde está (sección del README o PR); `skip`, con el motivo, para lo que choca
   con «Lo que no cambia» o con lo que es GraphBranch; lo de GraphBranch que la referencia no tiene, con
   `original` en `no`. El tamaño y el «siguiente paso» de la skill no aplican.
2. `.claude/skills/replica-entrepreneur/SKILL.md`, pasos 1 a 4: reseñas públicas de la referencia en
   `replica/reviews.csv` (cada una literal, con su enlace; nunca inventadas; con la muestra que haya, y
   dicha), los temas de la skill copiados a `replica/themes.json` y ajustados a clientes de Git, y el
   plan de mejoras en `replica/fixes.md` (sus filas van a la matriz con `original` en `no`). El paso 5
   (el ángulo para vender) y lo de precios son de Benjamin: no se hacen.

```sh
python3 .claude/skills/replica-entrepreneur/reviews.py replica/reviews.csv --themes replica/themes.json --out replica/feedback.md
```

**En cada reposición**, con o sin pasada nueva: el paso 1 de `.claude/skills/replica-diff/SKILL.md` (la
paridad de funciones; el diff de pantallas no aplica).

```sh
python3 .claude/skills/replica-diff/parity.py replica/features.csv
python3 .claude/skills/replica-diff/parity.py replica/features.csv --markdown > replica/parity.md
```

Los `must` que faltan («Missing, in build order») entran primero a la hoja, uno por ítem, con su puntaje,
su primera entrega, cómo comprobarla, su evidencia (la fuente de su fila) y `[replica must AAAA-MM-DD]` (la
fecha de `replica/recon.md`): con esa marca, `--siguiente` los toma antes que al resto (regla 2 de la
directiva; los demás, por puntaje). Las mejoras de `replica/fixes.md` van a la tabla de ideas de
`docs/investigacion.md` («De dónde»: Replica) con su puntaje y compiten con las demás. La bitácora lleva
`- Replica: pasada del AAAA-MM-DD, paridad X/100, must hechos a de b; ítems k…` (o «paridad, sin pasada
nueva»).

Después, las ideas de `docs/investigacion.md` (regla 5 de la directiva). Si `--check` avisa que la
investigación venció (R10, más de 30 días) o no quedan candidatas con puntaje, primero se investiga:
`WebSearch` y `WebFetch` sobre la página oficial de cada herramienta de la lista de la directiva y sobre
los públicos (quien enseña, quien transmite, equipos, lectores de pantalla). Cada fuente es una entrada
`### AAAA-MM-DD · Nombre` con `**Qué es:**`, `**Fuente:** <URL> (consultada el …)` e `**Implica:**`, y
dice solo lo que la página dice («no consta» si no está). Sin esas herramientas no se inventan fuentes:
se repone con las candidatas vigentes y, si la investigación venció, se dice en la bitácora y en Para
Benjamin. Cada idea se puntúa (`a×i/e`, la escala está en el archivo), entra a la tabla de ideas y las de
mayor puntaje pasan a la hoja con `· <Eje> · a×i/e.` y `[inv. AAAA-MM-DD]`.
