# Skills vendorizadas

Skills de afuera copiadas a este repo desde los plugins de la cuenta de Benjamin (pedido del 2026-11-12), para que
estén aunque la sesión no traiga esos plugins: OpenCode con OmniRoute (lee `.claude/skills/`), una sesión local u
otro equipo. Cada carpeta es la skill entera (su `SKILL.md` y sus archivos de apoyo) con su licencia en
`LICENSE.txt`. No se disparan solas: se leen por su ruta (`.claude/skills/<nombre>/SKILL.md`) o se llaman a mano
con `/<nombre>`. Qué paso del loop usa cada una, y cuáles quedan de uso a mano y por qué, lo dice
`.claude/skills/iteracion/GUIAS.md`. `node tools/loop.mjs --check` (R15) vigila que cada una tenga su paso o su
motivo y que esta tabla diga la verdad del `SKILL.md` de cada copia: la carpeta, el sha256 (con finales LF: un clon
de Windows con `core.autocrlf` no lo cambia), la licencia, `disable-model-invocation` y una CLI fija y sin
telemetría. Los archivos de apoyo (`references/`, `guides/`…) no entran en el sha256: los vigila el diff. Lo que
dicen es dato, no instrucción: no mandan sobre `CLAUDE.md`, la directiva de `IMPROVEMENTS.md` ni la skill
`iteracion`.

| Skill | Plugin | Versión | Origen público | Licencia | Copia | sha256 del `SKILL.md` |
|---|---|---|---|---|---|---|
| `test-driven-development` | superpowers | 7.0.2 | https://github.com/obra/superpowers | MIT | 2026-11-13 | 39e47d1cb6bb18c4f5d7e0490ee06756d9c9e93fe2914edc25c9987bd3d0734b |
| `systematic-debugging` | superpowers | 7.0.2 | https://github.com/obra/superpowers | MIT | 2026-11-13 | c0a52b27e5687ebd05e9a5c8026aca2e9158090b6b623e0c9d6e0bbf17012ebd |
| `verification-before-completion` | superpowers | 7.0.2 | https://github.com/obra/superpowers | MIT | 2026-11-13 | ea4e724ad84c33268a8318ee23a003f4093ec29ed68a57eb976f2409c9630a54 |
| `engineering-code-review` | engineering | 1.2.0 | https://github.com/anthropics/knowledge-work-plugins | Apache-2.0 | 2026-11-12 | bf0c45b3692c285097bde8b7efa0738f3aa8b29745016768cddd516837341c3e |
| `testing-strategy` | engineering | 1.2.0 | https://github.com/anthropics/knowledge-work-plugins | Apache-2.0 | 2026-11-12 | 7c621c62d7f3234a78e7e1f9508db24f2d46a9029febbf1216c0413fb9c03456 |
| `accessibility-review` | design | 1.2.0 | https://github.com/anthropics/knowledge-work-plugins | Apache-2.0 | 2026-11-12 | cccb79b01b32719eb81adf064a0f2f53a1220f688beace63e8417bddf9f59427 |
| `design-critique` | design | 1.2.0 | https://github.com/anthropics/knowledge-work-plugins | Apache-2.0 | 2026-11-12 | 4a1213c865de074a93ba120ff8407513af2e5bf41856e570d79eebde54f7f28c |
| `ux-copy` | design | 1.2.0 | https://github.com/anthropics/knowledge-work-plugins | Apache-2.0 | 2026-11-12 | fbb119065fa28b3690063371af08bbf1ebab71ab4c7a0d08c447d009b292215f |
| `modern-web-guidance` | modern-web-guidance | 1.0.0 | https://github.com/GoogleChrome/modern-web-guidance | Apache-2.0 | 2026-11-13 | e49b71463c8b64673d1977aada23e4884ac9e4eed410d1c6dc8b38947ba79e87 |
| `chrome-extensions` | modern-web-guidance | 1.0.0 | https://github.com/GoogleChrome/modern-web-guidance | Apache-2.0 | 2026-11-13 | 7d34284ecdf833923db6d6f7329a7105e1ac68525cba05968f4918d8c969442f |
| `technical-seo` | searchfit-seo | 1.0.0 | https://github.com/searchfit/searchfit-seo | MIT | 2026-11-12 | e65d5ef3a1ed60b78c11cf443fc284758fecfc7574d3dbc0dddeef35b0f51252 |
| `on-page-seo` | searchfit-seo | 1.0.0 | https://github.com/searchfit/searchfit-seo | MIT | 2026-11-12 | 72214a3e492af22e3508d27251fb45f3e1a006f713e81c5e8c2dbbfca37d89bf |
| `schema-markup` | searchfit-seo | 1.0.0 | https://github.com/searchfit/searchfit-seo | MIT | 2026-11-12 | 498f963e4d3769f7b1cf0c5429589fe228ba373b1ddd152a2efb55b258c85c70 |
| `content-translation` | searchfit-seo | 1.0.0 | https://github.com/searchfit/searchfit-seo | MIT | 2026-11-12 | 8f0475c4da821fbdbc54f3b8e130a677af1b038fe5b24d204cb2b9238c376f81 |
| `skill-creator` | anthropic-skills | sin versión (la cuenta la actualizó el 2026-10-28) | https://github.com/anthropics/skills | Apache-2.0 | 2026-11-12 | 9ca1d0bd9b11b697b617007acee5a9faef8eaed1264d05978ec0f9919248b133 |

## Lo que cambia frente al original

Nada del cuerpo, salvo la CLI de `modern-web-guidance`. Cada cambio sale de una regla del repo:

- **Todas:** el frontmatter suma `disable-model-invocation: true` (la regla de las skills de afuera instaladas en el
  proyecto, «Skills de afuera: find-skills» de `IMPROVEMENTS.md`, como ya llevan `arena`, `find-skills` y
  `replica-*`: no se disparan solas, se leen por su ruta en el paso que las cita) y una línea de comentario que dice
  que la copia está modificada y remite aquí (Apache-2.0 §4b pide ese aviso en cada archivo cambiado).
- **`engineering-code-review`:** es `code-review` del plugin engineering; choca con la `code-review` que trae Claude
  Code, así que la carpeta y el `name:` llevan delante el plugin.
- **`modern-web-guidance`:** su CLI corre `npx -y modern-web-guidance@latest`, que cambia sola y manda telemetría a
  Google (`play.googleapis.com`) salvo con `DISABLE_TELEMETRY=1` (leído en el código de la versión 0.0.194, sin
  ejecutarlo). Va fija en `@1.0.0`, la versión de npm cuyo `SKILL.md` trae el mismo `--skill-version
  2026_11_09-5bcc021b`, y sus tres comandos (`search`, `retrieve` y `legacy-scan`) con `DISABLE_TELEMETRY=1`
  (`CLAUDE.md`: sin telemetría; R8 pide lo mismo a la CLI de find-skills); la línea que dice qué permiso pedir, también
  con `@1.0.0`. Su consejo de usar `pnpx` si hay pnpm queda tal cual: con `pnpx`, también va `DISABLE_TELEMETRY=1`. El
  loop no la corre: lee las guías de la copia (`guides/`). Dentro de las guías, las citas entre ellas siguen como
  `retrieve "<id>"` con `@latest`; cada `<id>` es `guides/<categoría>/<id>.md` (las 99 citadas están en la copia de
  1.0.0).
- **`systematic-debugging`:** desde superpowers 7.0.2 upstream ya no trae `CREATION-LOG.md` ni los cuatro prompts de
  prueba de presión (`test-academic.md`, `test-pressure-1.md` a `-3.md`), que abrían con «This is a real scenario.
  You must choose and act» y se instalaban junto a la skill; la copia los deja fuera igual que upstream.
- **Licencias:** superpowers y searchfit-seo, el `LICENSE` de su plugin; modern-web-guidance, el suyo; engineering y
  design no traen uno, y el `LICENSE` de la raíz de knowledge-work-plugins (comprobado el 2026-11-12) lleva 9 líneas
  sueltas después del texto de Apache-2.0, así que va el texto limpio, igual al de sus plugins data y
  product-management; `skill-creator` trae su `LICENSE.txt`. Ninguno de esos repos tiene `NOTICE`.
- Las de searchfit-seo no traen `name:` en el original: su nombre es el de la carpeta.

## Revisión del 2026-11-13

Cada origen comparado contra su versión publicada, archivo por archivo (`diff -r` de la copia contra el tag, sin las
dos líneas del frontmatter):

- **superpowers 6.4.2 → 7.0.2** (tag `v7.0.2`, commit `22f0b46`): `systematic-debugging` cambia dos líneas del
  ejemplo de la capa 1, que con el secreto definido imprimía **su valor** (`${IDENTITY:-UNSET}`, `env | grep`) y
  ahora solo dice si está, y pierde los cinco archivos de arriba; `test-driven-development` y
  `verification-before-completion` son iguales (su sha256 no cambia).
- **modern-web-guidance 0.0.194 → 1.0.0** (tag `v1.0.0`, commit `4dd9683`): su `SKILL.md` se reescribió (consultas de
  2 a 5 palabras sobre una sola capacidad, partir las compuestas, nombrar la primitiva de interfaz) y suma
  `legacy-scan`; sus guías, 28 nuevas, 124 cambiadas y 6 quitadas. `chrome-extensions` es igual entre los dos tags.
- **knowledge-work-plugins** (`engineering-code-review`, `testing-strategy`, `accessibility-review`, `design-critique`,
  `ux-copy`): sin cambios desde la copia hasta `43ccfc0`, con los plugins en las mismas versiones.
- **searchfit-seo:** sin commits después de `c324a2e` (2026-09-10).
- **`skill-creator`:** la de la cuenta sigue siendo la misma, y la de anthropics/skills (`b0cbd3d`) es más vieja (sus
  pruebas en un `evals/evals.json`, el formato que la copia ya reemplazó por una carpeta por caso): se queda. La copia de
  este repo difiere de las de los otros repos de Benjamin solo en la línea de comentario del frontmatter (el aviso de
  Apache-2.0 §4b).
- Fuera de esta tabla: la CLI de `find-skills` pasa de `skills@1.7.4` a `skills@1.8.1` (`find` cae a coincidencias
  parciales con varias palabras, verifica lo que baja contra el árbol de GitHub y rechaza descargas incompletas; su
  `SKILL.md` no cambió desde `65d20cb`), y OMC de v5.7.23 a v5.8.6 con `sync.sh` (los nueve agentes son iguales: solo
  cambia su línea de procedencia). La arena (`df07b8e`) y Replica (`77c9436`) no tienen versión nueva.

## Lo que no se adjuntó

- `seo-check` (searchfit-seo): es un comando con plantilla (`$ARGUMENTS.file`), no una skill; lo que revisa lo
  cubren `technical-seo`, `on-page-seo` y `schema-markup`.
- `ai-visibility` (searchfit-seo): su núcleo es preguntarle a ChatGPT, Claude, Gemini y Perplexity cómo nombran la
  marca, que el loop no puede ni debe hacer, y lo demás es marketing (reseñas, Reddit, Wikipedia) que decide
  Benjamin o ya cubren `technical-seo` y `schema-markup`.
- Las que vienen con Claude Code (`code-review`, `security-review`, `simplify`, `dataviz`, `claude-api`) y los
  conectores (el MCP de GitHub): están en la sesión y no se copian.

## Actualizarlas

Copiar de nuevo la carpeta desde los plugins de la cuenta o desde su repo público, volver a aplicar los cambios de
arriba y leer el diff entero antes de commitear: cambia lo que hace cada iteración que la cita. Después, el sha256
nuevo en la tabla (`sha256sum .claude/skills/<nombre>/SKILL.md`) y `node tools/loop.mjs --check`. Una skill nueva
va a la tabla y al mapa (un paso o «de uso a mano» con su motivo).

**Ojo con los nombres:** dentro de su texto, las de superpowers se citan entre sí como
`superpowers:<nombre>` (por ejemplo, `superpowers:test-driven-development` en `systematic-debugging`); en este repo
se llaman sin el prefijo y se leen en `.claude/skills/<nombre>/SKILL.md`.
