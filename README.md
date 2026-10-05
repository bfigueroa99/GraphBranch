# GraphBranch

Grafo en vivo, en 3D o 2D, de las ramas de un repositorio de GitHub, con alertas de toda su actividad: commits, force-push, ramas creadas y borradas, pull requests, revisiones, CI (GitHub Actions), issues, releases, estrellas y forks.

![GraphBranch en 3D mostrando el repositorio de demostración](docs/captura-3d.png)

- **Vista 3D**: la rama por defecto es el tronco central y las demás se reparten a su alrededor en espiral, las más activas más cerca del tronco; el tiempo avanza hacia ti y la historia se pierde en el fondo. Puedes girar, acercar y desplazarte; la cámara sigue lo último y gira lento cuando no la tocas.
- **Vista 2D tipo metro**: cada rama es un carril; los commits avanzan a la derecha. La rama por defecto va arriba y debajo las demás, de la más reciente a la menos activa. Cambia entre 3D y 2D con el selector del grafo.
- **Colores**: el gris es solo de las ramas muertas, las ya fusionadas y borradas; toda rama viva lleva color. La rama por defecto y las 7 más activas tienen color propio, que conservan mientras sigan entre las más activas; si aparece una rama o una menos activa recibe un push, toma el color de la que deja de estar entre ellas. Las demás ramas vivas reparten esos mismos colores.
- En ambas, las bifurcaciones y merges se dibujan como curvas y las ramas ya fusionadas y borradas quedan en gris.
- **En vivo**: los commits nuevos aparecen con una onda, la etiqueta de la rama se desliza hasta su nueva cabeza, la rama sube justo bajo la rama por defecto (los carriles se reordenan según su última actividad) y la vista sigue lo último (o te deja recorrer la historia).
- **Alertas**: panel de actividad filtrable, avisos emergentes, sonido opcional, notificaciones del sistema cuando la pestaña está en segundo plano y contador en el título de la pestaña.
- **Estado en cada rama**: CI en curso / aprobado / fallido y número de PR abierto, directamente en la etiqueta.
- **Repos enormes**: funciona con repositorios de miles de ramas (ver más abajo).

No necesita servidor ni compilación: es HTML, CSS y JavaScript que llama directo a `api.github.com` desde tu navegador. La vista 3D usa WebGL; si el navegador no lo tiene, la app abre la 2D.

## Uso

1. Abre `index.html` (doble clic sirve), o publícalo con GitHub Pages (abajo).
2. Escribe `owner/repo` o pega la URL del repositorio y pulsa **Conectar**. Sin repositorio arranca una **demo** simulada.
3. Opcional pero recomendado: en **Ajustes** (engranaje) agrega un token de GitHub.

También puedes abrir un repo directo con `index.html?repo=owner/repo`.

### Token

Sin token GitHub permite 60 consultas por hora, así que la vista se actualiza cada pocos minutos. Con un token se actualiza cada 10 segundos, ves repos privados y se activa el modo para repos grandes.

Crea un token *fine-grained* de solo lectura en <https://github.com/settings/personal-access-tokens/new> con acceso al repositorio y estos permisos (todos *Read-only*): **Metadata** (incluye la actividad del repo: pushes y ramas creadas o borradas), **Contents**, **Pull requests** y **Actions**.

El token se guarda solo en el `localStorage` de tu navegador y se envía únicamente a `api.github.com`.

## Repositorios con miles de ramas

GraphBranch nunca lista todas las ramas en cada ciclo (con 10.000 ramas serían 100 consultas cada vez). Según lo que tenga disponible, usa uno de tres modos:

| Modo | Cuándo | Cómo detecta el movimiento |
|---|---|---|
| **GraphQL** | Con token | La API de actividad del repo dice qué ramas recibieron pushes y cuándo, casi al instante (una consulta con ETag: si no hubo cambios no gasta cuota). Con eso elige las *N* ramas más activas, y una consulta GraphQL por ciclo trae sus cabezas, el total de ramas, los PRs abiertos y las ramas fijadas. Cuesta ~1 punto de los 5.000/hora. Si el token no puede leer la actividad, usa el feed de eventos, que llega con unos minutos de retraso. |
| **Lista** | Sin token y hasta 100 ramas | Lista las ramas por REST con ETag y compara. |
| **Eventos** | Sin token y más de 100 ramas | Sigue el feed de eventos del repo (pushes, ramas creadas y borradas). GitHub lo entrega con algunos minutos de retraso. |

Para concentrarte en lo que te importa:

- **Ramas más activas a mostrar** (Ajustes): cuántas ramas recientes dibujar (hasta 60). La rama por defecto siempre está.
- **Fijar ramas**: clic en una rama del grafo → **Fijar**. Las ramas fijadas se muestran siempre, aunque no sean de las más activas. Se recuerdan por repositorio.
- **Filtrar ramas**: el campo del grafo filtra por nombre, por ejemplo `release/` o `equipo-pagos/`. En modo GraphQL el filtro se aplica en GitHub, así que busca entre todas las ramas, no solo las visibles.

Las alertas y la cuota siguen la misma lógica: cuando una rama fuera de las visibles recibe un push, entra al grafo y genera su alerta; las ramas que solo pierden su lugar salen sin avisar.

## Controles

En 3D:

- Arrastrar: girar alrededor. Clic derecho o `Mayús` + arrastrar: desplazarse. Rueda o pellizco: acercar.
- Botón de giro: activa o pausa el giro lento automático.

En 2D:

- Arrastrar: moverse por la historia y entre carriles.
- Rueda: recorrer la historia. `Ctrl` + rueda o pellizco: zoom del eje de tiempo.

En las dos:

- Clic en un commit o en el nombre de una rama: detalle con autor, mensaje, PR, estado de CI y enlace a GitHub.
- Clic en un nombre de la leyenda o en un elemento del panel de actividad: lleva a esa rama o commit.
- **En vivo** / **Ir a lo último**: sigue (o vuelve a seguir) los commits nuevos.
- Los chips del panel de actividad filtran la lista y también los avisos emergentes.

## Publicar en GitHub Pages

El flujo `.github/workflows/pages.yml` publica el sitio en cada push a `master`. Solo hay que activarlo una vez: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Estructura

```
index.html            página y controles
css/styles.css        estilos (tema claro y oscuro)
js/util.js            utilidades compartidas
js/sources/github.js  datos en vivo desde la API de GitHub (modos GraphQL, lista y eventos)
js/sources/demo.js    repositorio simulado para la demo
js/layout.js          asignación de carriles y orden de los commits
js/graph.js           vista 2D en SVG (D3 solo para zoom y arrastre)
js/graph3d.js         vista 3D con Three.js
js/feed.js            panel de actividad, avisos, sonido y notificaciones
js/app.js             conecta todo
```

## Límites conocidos

- El feed de eventos de GitHub (issues, comentarios, revisiones, estrellas) llega con retraso de 30 segundos a algunos minutos; los commits, ramas, PRs y CI se detectan antes porque se consultan directamente.
- Se cargan los últimos commits de cada rama (40 por defecto, configurable). Las líneas punteadas a la izquierda indican que la historia sigue más atrás.
- Los PRs se siguen entre los 50 actualizados más recientemente.
