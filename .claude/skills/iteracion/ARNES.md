# La frontera y la guardia

Parte de la skill `iteracion` (`.claude/skills/iteracion/SKILL.md`, paso 3). Se lee entero cuando la puerta sale
con `FALLA frontera` o sin evaluar la frontera (sale 2), o cuando la guardia frena un comando. Son dos
guardarraíles de máquina (de ECC: lo que el agente puede olvidar va donde no puede olvidarlo); `CLAUDE.md` los
resume.

- **La frontera** (`tools/frontera.py`, vendorizada; lo propio del repo en `tools/frontera.json`) es el paso 3
  de `npm run check`. Juzga lo que se va a publicar (`origin/dev...HEAD` y lo sin commitear) con las reglas de
  `origin/dev`, y lo marca si borra un archivo de pruebas, deja menos `test(`/`it(` o pasos del smoke, añade un
  `skip`/`only`, un silenciador sin regla (`eslint-disable`, `@ts-ignore`…) o toca la puerta y el arnés
  (`tools/check.mjs`, `tools/loop.mjs`, la base de la auditoría, `package.json`, la propia frontera, la guardia
  y `.claude/settings.json`). Lo legítimo (un cambio de maquinaria, una prueba que se reescribe) se **declara**
  con una línea `Frontera: <motivo>` en el cuerpo de un commit de la rama: pasa y queda a la vista en el PR y
  en el `Validado:`. Un **umbral** que se afloja (la cuota de `tools/audit-base.json`, `MARGEN_CUOTA` de la
  auditoría) no se declara nunca: lo cambia Benjamin. Sale 2, sin evaluar, sin `python3` u `origin/dev`: se
  arregla eso y se repite; no se fusiona sin ella.
- **La guardia** (`.claude/hooks/guardia.py`, vendorizada; las ramas en `.claude/hooks/guardia.json`) es un
  hook PreToolUse de `.claude/settings.json`: frena el push forzado (salvo `--force-with-lease` a una rama no
  protegida), el push a `dev`, `master` o `main` (también borrarlas o `--all`), saltarse los hooks de git
  (`--no-verify`, `commit -n`, `core.hooksPath`), `rm -r` de `/`, `~` o `.git`, y escribir con el MCP de GitHub
  en esas ramas. Sale 2 con el motivo: no se rodea; lo que pide va a Para Benjamin. Los push de esta skill
  (`loop/N`) pasan, y los de `--reclamar` y `--limpiar` corren dentro de node, donde no mira. Rige en las
  sesiones que arrancan con ella en el checkout (la Routine arranca en `master`: desde que Benjamin promueva
  `dev`), y no en OpenCode, que no lee los hooks de `.claude/settings.json`; la frontera, en las dos.

Con `FALLA frontera`, la puerta no es intermitente y no se repite por ella: se arregla el código, no la puerta; si
el cambio es legítimo, se declara (arriba).
