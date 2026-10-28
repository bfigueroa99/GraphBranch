# Qué arreglar frente a GitKraken Desktop (lo que dicen sus usuarios)

Pasada del 2026-10-28. Muestra: **59 comentarios de una sola fuente** (Hacker News, por la API pública
de Algolia, del 2022-04-16 al 2026-10-24), cada uno textual y con su enlace en `replica/reviews.csv`;
el orden sale de `replica/feedback.md` (`reviews.py` con `replica/themes.json`). G2, TrustRadius y el
tablero de pedidos de GitKraken (feedback.gitkraken.com) respondieron 403 y Capterra 404: no se
insistió ni se esquivó. Con una sola fuente, **todos los temas son finos**: esto orienta, no prueba una
tendencia. Ningún comentario trae estrellas.

## 1. Lo que odian

1. **El precio y lo que queda detrás del pago** (27 comentarios, 1 fuente). «If you want to use a private
   repo on GitHub with GitKraken, it will cost you $60 per year per user, minimum.»
   (https://news.ycombinator.com/item?id=31876848) · «I would like a nice Git GUI, but GitKraken pricing is
   nonsense.» (https://news.ycombinator.com/item?id=37508257)
2. **Pesado** (7, 1 fuente). «It's a good concept but GK has always been extremely bulky and expensive for
   what it does.» (https://news.ycombinator.com/item?id=42087452) · «Fwiw, what it's trying to replace
   (GitKraken) is slow, clunky, and resource hungry, so it's not hard to beat.»
   (https://news.ycombinator.com/item?id=50107430)
3. **Demasiada información junta en el grafo** (8 del tema del grafo y 5 de uso torpe, 1 fuente).
   «Gitkraken has too much information density, since it weights nearly everything equally or
   alphabetically.» (https://news.ycombinator.com/item?id=31877064) · «Gitkraken is the last I tried and I
   found it too much cluttering.» (https://news.ycombinator.com/item?id=49348560)
4. **IA y nube que nadie pidió, y cuentas que fallan** (5, 1 fuente). «every update seems to bring more
   and more ai features, and pushing more ”cloud” features as well»
   (https://news.ycombinator.com/item?id=45886394) · «(and the occasional account system outage, which
   ruins everything (looking at you, GitKraken)» (https://news.ycombinator.com/item?id=40912545)

## 2. Lo que falta

1. **Varias cuentas** (6, 1 fuente; a la vez es lo que más elogian quienes pagan). «GitKraken doesn't
   support connecting to multiple Azure DevOps organizations within the same profile.»
   (https://news.ycombinator.com/item?id=31883470)
2. **Mostrar solo el primer padre** (1, fino). «I like GitKraken, except for the fact that it lacks the
   ability to show first parent only, i.e. `git log --first-parent`.»
   (https://news.ycombinator.com/item?id=40486993)
3. **Andar bien en Linux y WSL** (4, 1 fuente). «Graphical interface won't work well inside WSL, that's why
   I dropped my subscription on GitKraken and start using lazygit.»
   (https://news.ycombinator.com/item?id=46362087)

## 3. Lo que no resuelve

1. **Ver de un vistazo en qué anda cada uno cuando hay muchas ramas** (1, fino). «Next to impossible to
   see what you or your colleagues are working on when there are a lot of branches in flight»
   (https://news.ycombinator.com/item?id=31877064)
2. **Mirar sin operar**: quien solo quiere el grafo como tablero paga por un cliente entero. «I often
   suggest git CLI purists to get something like git kraken and just use it as a visual dashboard.»
   (https://news.ycombinator.com/item?id=31876271)

## Plan de arreglos

Las filas van a `replica/features.csv` con `original` en `no`; lo que todavía no está va a la tabla de
ideas de `docs/investigacion.md` («De dónde»: Replica) y compite por puntaje.

| arreglo | estado en GraphBranch | tamaño | evidencia |
| --- | --- | --- | --- |
| Gratis, sin instalar ni cuenta, privados con el token propio | hecho (web estática, MIT) | – | precio, 27 |
| Liviano: lo nuevo no carga si no se usa | hecho («Lo que no cambia» de la directiva) | – | pesado, 7 |
| Ver en qué anda cada uno: «mis ramas» y ramas por actividad | hecho (filtro por autor, orden por actividad) | – | 31877064 |
| Linux y WSL: corre en el navegador y hay AppImage | hecho | – | plataformas, 4 |
| Sin IA ni nube impuestas | hecho (sin servicios externos ni telemetría) | – | IA y nube, 5 |
| Mostrar solo el primer padre en el grafo | falta: a la tabla de ideas | M | 40486993 |
| Varias cuentas del mismo servicio | falta: a la tabla de ideas | M | cuentas, 6 |

El ángulo para vender (paso 5 de la skill) y lo de precios son de Benjamin: no se hacen en el loop.
