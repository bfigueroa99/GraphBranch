#!/usr/bin/env node
/* El loop de mejora continua: elige la iteración que toca, vigila IMPROVEMENTS.md, reclama la rama
   de la iteración en origin y mide la web publicada. Solo módulos de Node y git, sin dependencias.

     node tools/loop.mjs --siguiente [--json]     qué iteración toca: número, tipo, eje, ítem y por qué
     node tools/loop.mjs --check                  las reglas de IMPROVEMENTS.md, la skill y el prompt (sin red)
     node tools/loop.mjs --reclamar [--relevo] [--sin-red] [--horas 6] [--repo <dir>]
                                                  reclama la rama loop/N en origin: el push es el candado
     node tools/loop.mjs --publicado              compara la web de GitHub Pages con origin/master
     --archivo <ruta> | --ref <ref>               leen otro IMPROVEMENTS.md: un archivo, o git show <ref>:IMPROVEMENTS.md

   Códigos de salida. --siguiente y --check: 0 bien, 1 formato (o algún ERROR), 2 sin ítem.
   --reclamar: 0 reclamada o relevada · 1 formato · 2 sin ítem · 3 ocupada · 4 vencida · 5 sin remoto.
   --publicado: 0 al día · 2 atrasada o sin publicar · 4 no se pudo comprobar. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Los ejes del Mapa de alcance, en su orden. */
export const EJES = ['Fuentes', 'Datos', 'Plataformas', 'Escala', 'Salidas', 'Análisis', 'Público'];
/** Todos los flags del CLI: --check (R8) comprueba que la skill no nombre otros. */
export const FLAGS = ['--siguiente', '--check', '--reclamar', '--publicado', '--relevo', '--sin-red', '--horas', '--repo', '--archivo', '--ref', '--json', '--help'];
/** Horas sin commits a partir de las cuales una rama loop/N se da por abandonada y se puede relevar:
    una expansión mide entre 3 h 21 y 4 h 29 (iteraciones 24 a 26) y la puerta, unos 4 min. */
export const RECLAMO_H = 6;

const USO = `node tools/loop.mjs --siguiente [--json]     qué iteración toca: número, tipo, eje, ítem y por qué
node tools/loop.mjs --check                  las reglas de IMPROVEMENTS.md, la skill y el prompt (sin red)
node tools/loop.mjs --reclamar [--relevo] [--sin-red] [--horas ${RECLAMO_H}] [--repo <dir>]
                                             reclama la rama loop/N en origin: el push es el candado
node tools/loop.mjs --publicado              compara la web de GitHub Pages con origin/master
--archivo <ruta> | --ref <ref>               leen otro IMPROVEMENTS.md: un archivo, o git show <ref>:IMPROVEMENTS.md
--help                                       esta ayuda`;

export class LoopError extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

const EJE = EJES.join('|');
const RE_HOJA = new RegExp(`^(\\d+)\\. (~~)?\\*\\*(.+?)\\*\\*(?:~~ hecho en #(\\d+))? · (${EJE})\\.`);
const RE_MAPA = /^\| (.+?) \| (.+?) \| (.+?) \|$/;
const RE_ENTRADA = /^### (\d{4}-\d{2}-\d{2}) · (.+)$/;
const RE_ITERACION = new RegExp(`^Iteración (\\d+)(?: · (?:Expansión · (${EJE})|Mantenimiento))?$`);
const RE_VALIDADO = /^- Validado:\s*/;
const RE_SIGUIENTE = /^- \*\*Siguiente:\*\*\s*/;
const RE_DECLARADO = /iteración (\d+), (?:de )?\*{0,2}(expansión|mantenimiento)\*{0,2}[:.,]?/i;
// el ítem declarado: el primer «ítem N» o «pendiente N» tras el tipo (un título copiado puede citar
// otro número más adelante); las entradas viejas («el primer ítem sin hacer es el 6», «toca el 7»)
// no lo traen así y vale el último «es el N» o «toca el N»
const RE_ITEM = /(?<![\p{L}\p{N}])(?:ítem|pendiente) (\d+)/u;
const RE_ITEM_VIEJO = /(?<![\p{L}\p{N}])(?:es el|toca el) (\d+)/gu;

/* ------------------------------------------------------------------ parser */

/** Lee IMPROVEMENTS.md: Mapa de alcance, Hoja de ruta, Mantenimiento y Bitácora. */
export function parse(texto) {
  const out = { mapa: [], hoja: [], mantenimiento: [], bitacora: [], errores: [] };
  let seccion = '';
  let sub = '';
  let entrada = null;
  let pendiente = null;
  texto.split(/\r?\n/).forEach((linea, i) => {
    const num = i + 1;
    if (linea.startsWith('## ')) {
      seccion = linea.slice(3).trim();
      sub = '';
      entrada = null;
      pendiente = null;
      return;
    }
    if (seccion.startsWith('Mapa de alcance')) {
      const m = RE_MAPA.exec(linea);
      if (m && m[1] !== 'Eje' && !m[1].startsWith('---')) out.mapa.push({ eje: m[1], hoy: m[2], siguiente: m[3], linea: num });
    } else if (seccion.startsWith('Hoja de ruta')) {
      if (!/^\d+\. /.test(linea)) return;
      const m = RE_HOJA.exec(linea);
      if (m) out.hoja.push({ n: +m[1], titulo: m[3], hecho: !!m[2], pr: m[4] ? +m[4] : null, eje: m[5], linea: num });
      else out.errores.push({ linea: num, texto: linea });
    } else if (seccion.startsWith('Mantenimiento')) {
      if (linea.startsWith('### ')) {
        sub = linea.slice(4).trim();
        pendiente = null;
        return;
      }
      const m = /^(\d+)\. (.+)/.exec(linea);
      if (m) {
        pendiente = { n: +m[1], texto: m[2].trim(), alta: sub === 'Alta', linea: num };
        out.mantenimiento.push(pendiente);
      } else if (pendiente && /^\s+\S/.test(linea)) pendiente.texto += ' ' + linea.trim();
      else pendiente = null;
    } else if (seccion.startsWith('Bitácora')) {
      const m = RE_ENTRADA.exec(linea);
      if (m) {
        const it = RE_ITERACION.exec(m[2]);
        let tipo = null;
        if (it && m[2].endsWith('· Mantenimiento')) tipo = 'Mantenimiento';
        else if (it && it[2]) tipo = 'Expansión';
        entrada = { fecha: m[1], titulo: m[2], n: it ? +it[1] : null, tipo, eje: it?.[2] ?? null, cuerpo: '', linea: num };
        out.bitacora.push(entrada);
      } else if (entrada) entrada.cuerpo += (entrada.cuerpo ? '\n' : '') + linea;
    }
  });
  for (const p of out.mantenimiento) if (p.texto.includes('**Alta**')) p.alta = true;
  return out;
}

/** Una viñeta del cuerpo de una entrada («- Validado:», «- **Siguiente:**»), con sus líneas unidas. */
function vineta(cuerpo, re) {
  const lineas = cuerpo.split('\n');
  const i = lineas.findIndex((l) => re.test(l));
  if (i < 0) return null;
  const partes = [lineas[i].replace(re, '').trim()];
  for (let j = i + 1; j < lineas.length && /^\s+\S/.test(lineas[j]); j++) partes.push(lineas[j].trim());
  return partes.join(' ');
}

/** Qué iteración declara el «Siguiente» de una entrada: {n, tipo, item} o null si no se entiende. */
function declarado(sig) {
  const m = RE_DECLARADO.exec(sig);
  if (!m) return null;
  const resto = sig.slice(m.index + m[0].length);
  const directo = RE_ITEM.exec(resto);
  const viejos = [...resto.matchAll(RE_ITEM_VIEJO)];
  const item = directo ? +directo[1] : viejos.length ? +viejos[viejos.length - 1][1] : null;
  if (item === null) return null;
  return { n: +m[1], tipo: m[2].toLowerCase() === 'expansión' ? 'Expansión' : 'Mantenimiento', item };
}

const corta = (t, max) => (t.length > max ? t.slice(0, max - 1) + '…' : t);

/* --------------------------------------------------------------- siguiente */

/** Qué iteración toca según IMPROVEMENTS.md: número, tipo, eje, ítem y por qué. Lanza LoopError. */
export function siguiente(texto) {
  const doc = parse(texto);
  const its = doc.bitacora.filter((e) => e.n !== null);
  if (!its.length) throw new LoopError('no hay ninguna «Iteración N» en la bitácora', 1);
  const M = Math.max(...its.map((e) => e.n));
  const n = M + 1;
  let tipo = n % 4 === 3 ? 'Mantenimiento' : 'Expansión';
  const pend = doc.hoja.filter((i) => !i.hecho);
  const alta = doc.mantenimiento.find((p) => p.alta);
  let item;
  let motivo;
  let eje = null;
  if (alta) {
    tipo = 'Mantenimiento';
    item = alta;
    motivo = 'pendiente Alta: va antes que todo';
  } else if (tipo === 'Expansión') {
    if (!pend.length) throw new LoopError('no hay ítem para expansión: reponer la hoja de ruta (regla 5)', 2);
    const ant = [...its].reverse().find((e) => e.tipo === 'Expansión');
    const ejeAnt = ant?.eje ?? null;
    item = pend.slice(0, 3).find((i) => i.eje !== ejeAnt) ?? pend[0];
    eje = item.eje;
    if (!ant) motivo = 'primer ítem sin hacer; no hay una expansión anterior';
    else if (pend[0].eje !== ejeAnt) motivo = `primer ítem sin hacer; la expansión anterior (${ant.n}) fue de ${ejeAnt}`;
    else if (item !== pend[0]) motivo = `el primero (${pend[0].n}) es del mismo eje que la ${ant.n} (${ejeAnt}) y entre los tres primeros hay otro eje`;
    else motivo = `el primero (${pend[0].n}) es del mismo eje que la ${ant.n} (${ejeAnt}) y no hay otro eje entre los tres primeros`;
  } else {
    const lista = [...doc.mantenimiento.filter((p) => p.alta), ...doc.mantenimiento.filter((p) => !p.alta)];
    if (!lista.length) throw new LoopError('Mantenimiento sin pendientes: auditar y cargar al menos 3', 2);
    item = lista[0];
    motivo = `${n} mod 4 = 3`;
  }
  const ultima = doc.bitacora[doc.bitacora.length - 1];
  return {
    n,
    tipo,
    eje,
    item: item.n,
    titulo: tipo === 'Expansión' ? item.titulo : item.texto,
    rama: `loop/${n}`,
    motivo,
    declarado: vineta(ultima.cuerpo, RE_SIGUIENTE),
    pendientes: pend.length,
    hechos: doc.hoja.length - pend.length,
    mantenimiento: doc.mantenimiento.length,
    ultima: ultima.n === null ? `«${ultima.titulo}»` : `la iteración ${ultima.n}`,
  };
}

/** El bloque de seis líneas de --siguiente. */
export function textoSiguiente(s) {
  const cabecera = s.tipo === 'Expansión' ? `Iteración ${s.n} · Expansión · ${s.eje}` : `Iteración ${s.n} · Mantenimiento`;
  const que = s.tipo === 'Expansión' ? `Ítem ${s.item} de la hoja de ruta: ${s.titulo}` : `Pendiente ${s.item} de mantenimiento: ${corta(s.titulo, 100)}`;
  return [
    cabecera,
    que,
    `Por qué: ${s.motivo}`,
    `Rama: ${s.rama}`,
    `Declarado en ${s.ultima}: ${s.declarado ?? '(sin Siguiente)'}`,
    `Hoja de ruta: ${s.pendientes} pendientes, ${s.hechos} hechos · mantenimiento: ${s.mantenimiento} pendientes`,
  ].join('\n');
}

/* ------------------------------------------------------------------- check */

function git(dir, args, env) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? r.error.message : '') };
}
const primera = (s) => (s || '').split('\n').find((l) => l.trim()) || 'sin detalle';
const leer = (ruta) => (existsSync(ruta) ? readFileSync(ruta, 'utf8') : null);

/** Las reglas R1–R9. `log` (títulos de commits), `skill`, `prompt` y `settings` (textos) se inyectan en las pruebas. */
export function check(texto, { log, skill, prompt, settings, dir = root } = {}) {
  const doc = parse(texto);
  const lineas = [];
  const regla = (nombre, errores, avisos, ok) => {
    const nivel = errores.length ? 'ERROR' : avisos.length ? 'aviso' : 'ok';
    const msg = nivel === 'ok' ? ok : [...errores, ...avisos].join('; ');
    lineas.push({ regla: nombre, nivel, msg });
  };

  // R1: el Mapa de alcance tiene los 7 ejes, en orden
  {
    const e = [];
    if (doc.mapa.length !== 7) e.push(`Mapa de alcance con ${doc.mapa.length} filas (hacen falta 7: ${EJES.join(', ')})`);
    else doc.mapa.forEach((f, i) => f.eje !== EJES[i] && e.push(`fila ${i + 1} del Mapa es «${f.eje}», se esperaba «${EJES[i]}»`));
    regla('R1', e, [], 'Mapa de alcance con los 7 ejes en orden');
  }
  // R2: hoja de ruta numerada 1..n, cada ítem con el patrón y un eje válido
  {
    const e = doc.errores.map((x) => `línea ${x.linea}: «${corta(x.texto, 60)}» no cumple «N. **Título** · Eje.» ni «N. ~~**Título**~~ hecho en #K · Eje.»`);
    const mal = doc.hoja.findIndex((it, i) => it.n !== i + 1);
    if (mal >= 0) e.push(`hoja de ruta: el ítem ${mal + 1} está numerado ${doc.hoja[mal].n} (línea ${doc.hoja[mal].linea})`);
    if (!doc.hoja.length) e.push('hoja de ruta vacía');
    regla('R2', e, [], `hoja de ruta: ${doc.hoja.length} ítems numerados 1..${doc.hoja.length}`);
  }
  // R3: cada «hecho en #K» está en origin/master, salvo a lo sumo el PR en curso
  {
    const e = [];
    const a = [];
    let titulos = log;
    if (!titulos) {
      if (git(dir, ['rev-parse', '--verify', '-q', 'origin/master']).status !== 0) a.push('sin origin/master: no se comprobaron los PR');
      else titulos = git(dir, ['log', 'origin/master', '--format=%s']).stdout.split('\n');
    }
    let ok = 'sin ítems hechos';
    if (titulos) {
      const enLog = new Set();
      for (const t of titulos) for (const m of t.matchAll(/\(#(\d+)\)/g)) enLog.add(+m[1]);
      const hechos = doc.hoja.filter((i) => i.hecho);
      // el PR en curso es el único «hecho en #K» que puede faltar en origin/master: tiene que ser mayor
      // que los demás de la hoja, no que el último del log (entre medio se fusionan PR ajenos)
      const maxHoja = Math.max(0, ...hechos.filter((i) => enLog.has(i.pr)).map((i) => i.pr));
      const vistos = new Map();
      const enCurso = [];
      for (const it of hechos) {
        if (vistos.has(it.pr)) e.push(`hecho en #${it.pr} repetido (ítems ${vistos.get(it.pr)} y ${it.n})`);
        vistos.set(it.pr, it.n);
        if (enLog.has(it.pr)) continue;
        if (it.pr > maxHoja) enCurso.push(it.pr);
        else e.push(`hecho en #${it.pr} (ítem ${it.n}): ese PR no está en origin/master`);
      }
      if (enCurso.length > 1) e.push(`${enCurso.length} PR en curso (#${enCurso.join(', #')}): a lo sumo uno puede faltar en origin/master`);
      ok = `los ${hechos.length} «hecho en #K» están en origin/master${enCurso.length === 1 ? ` (#${enCurso[0]} es el PR en curso)` : ''}`;
    }
    regla('R3', e, a, ok);
  }
  // R4: la hoja de ruta no se vacía
  {
    const p = doc.hoja.filter((i) => !i.hecho).length;
    const e = p < 10 ? [`quedan ${p}: reponer hasta 15, regla 5 de la directiva`] : [];
    const a = p >= 10 && p < 15 ? [`quedan ${p} ítems sin hacer: reponer hasta 15 al cerrar (regla 5)`] : [];
    regla('R4', e, a, `hoja de ruta: ${p} pendientes`);
  }
  // R5: iteraciones sin repetir, con tipo desde la 20 y el tipo que toca por N mod 4
  {
    const e = [];
    const a = [];
    const its = doc.bitacora.filter((x) => x.n !== null);
    const vistos = new Set();
    for (const it of its) {
      if (vistos.has(it.n)) e.push(`iteración ${it.n} repetida (línea ${it.linea})`);
      vistos.add(it.n);
      if (it.n < 20) continue;
      if (!it.tipo) e.push(`iteración ${it.n} sin tipo en la cabecera (Expansión · <Eje> o Mantenimiento)`);
      else if (it.n % 4 === 3 && it.tipo !== 'Mantenimiento') e.push(`iteración ${it.n} tiene que ser de mantenimiento (${it.n} mod 4 = 3)`);
      else if (it.n % 4 !== 3 && it.tipo === 'Mantenimiento' && !it.cuerpo.includes('**Alta**')) e.push(`iteración ${it.n} es de mantenimiento sin un pendiente **Alta** (${it.n} mod 4 = ${it.n % 4})`);
    }
    const max = Math.max(0, ...vistos);
    for (let k = 1; k <= max; k++) if (!vistos.has(k)) a.push(`falta la iteración ${k}`);
    if (!its.length) e.push('no hay ninguna «Iteración N» en la bitácora');
    regla('R5', e, a, `${its.length} iteraciones, 1..${max}, con tipo desde la 20`);
  }
  // R6: la última entrada tiene Validado y un Siguiente que coincide con --siguiente
  {
    const e = [];
    let ok = 'la última entrada tiene Validado y Siguiente';
    const ultima = doc.bitacora[doc.bitacora.length - 1];
    if (!ultima) e.push('bitácora vacía');
    else {
      if (!vineta(ultima.cuerpo, RE_VALIDADO)) e.push(`la última entrada («${corta(ultima.titulo, 40)}») no tiene la viñeta «- Validado:»`);
      const sig = vineta(ultima.cuerpo, RE_SIGUIENTE);
      const d = sig && declarado(sig);
      if (!sig) e.push(`la última entrada («${corta(ultima.titulo, 40)}») no tiene la viñeta «- **Siguiente:**»`);
      else if (!d) e.push(`el Siguiente de la última entrada no dice «iteración N, <expansión|mantenimiento>: <ítem|pendiente> k»: «${corta(sig, 60)}»`);
      else {
        let s = null;
        try {
          s = siguiente(texto);
        } catch (err) {
          e.push(`no se puede calcular la siguiente iteración: ${err.message}`);
        }
        if (s) {
          const que = (t) => (t === 'Expansión' ? 'ítem' : 'pendiente');
          if (d.n !== s.n) e.push(`el Siguiente declara la iteración ${d.n} y toca la ${s.n}`);
          if (d.tipo !== s.tipo || d.item !== s.item) e.push(`el Siguiente declara ${d.tipo.toLowerCase()} con ${que(d.tipo)} ${d.item} y --siguiente da ${s.tipo.toLowerCase()} con ${que(s.tipo)} ${s.item}`);
          ok = `la última entrada tiene Validado y Siguiente (iteración ${s.n}, ${s.tipo.toLowerCase()}: ${que(s.tipo)} ${s.item})`;
        }
      }
    }
    regla('R6', e, [], ok);
  }
  // R7: pendientes de mantenimiento numerados y nunca vacíos
  {
    const e = [];
    const a = [];
    const m = doc.mantenimiento;
    const mal = m.findIndex((p, i) => p.n !== i + 1);
    if (mal >= 0) e.push(`mantenimiento: el pendiente ${mal + 1} está numerado ${m[mal].n} (línea ${m[mal].linea})`);
    if (!m.length) e.push('Mantenimiento sin pendientes: auditar y cargar pendientes');
    else if (m.length < 3) a.push(`mantenimiento con ${m.length} pendiente(s): auditar y cargar hasta tener al menos 3`);
    regla('R7', e, a, `mantenimiento: ${m.length} pendientes numerados 1..${m.length}`);
  }
  // R8: la skill nombra flags, rutas y comandos que existen y están permitidos; el prompt no se pudre
  {
    const e = [];
    const a = [];
    const skillTxt = skill ?? leer(join(dir, '.claude', 'skills', 'iteracion', 'SKILL.md'));
    const promptTxt = prompt ?? leer(join(dir, '.claude', 'skills', 'iteracion', 'PROMPT.md'));
    const settingsTxt = settings ?? leer(join(dir, '.claude', 'settings.json'));
    if (skillTxt == null || promptTxt == null) a.push('sin skill: faltan .claude/skills/iteracion/SKILL.md o PROMPT.md');
    else {
      const fm = /^---\r?\n([^]*?)\r?\n---/.exec(skillTxt);
      if (!fm || !/^name:\s*\S/m.test(fm[1]) || !/^description:\s*\S/m.test(fm[1])) e.push('SKILL.md sin frontmatter con name: y description:');
      const flags = new Set();
      const rutas = new Set();
      const comandos = new Set();
      let enBloque = false;
      for (const linea of skillTxt.split('\n')) {
        // flags que siguen a loop.mjs en la misma línea (hasta el fin del comando)
        let resto = linea;
        for (let i = resto.indexOf('loop.mjs'); i >= 0; i = resto.indexOf('loop.mjs')) {
          resto = resto.slice(i + 'loop.mjs'.length);
          for (const f of resto.split(/`|\||;|&&/)[0].matchAll(/--[a-z][a-z-]*/g)) if (!FLAGS.includes(f[0])) flags.add(f[0]);
        }
        // rutas del repo que nombra
        for (const m of linea.matchAll(/(?:^|[\s`("'])((?:tools|e2e|\.claude)\/[\w./-]*)/g)) {
          const ruta = m[1].replace(/[.,;:]+$/, '');
          if (!existsSync(join(dir, ruta))) rutas.add(ruta);
        }
        // comandos al inicio de cada línea (y tras &&, ||, ; o |) de los bloques de código
        if (/^\s*```/.test(linea)) {
          enBloque = !enBloque;
          continue;
        }
        if (!enBloque) continue;
        for (const seg of linea.split(/&&|\|\||;|\|/)) {
          const toks = seg.trim().split(/\s+/).filter(Boolean);
          while (toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[0])) toks.shift();
          if (!toks.length || toks[0].startsWith('#')) continue;
          const [c, sub] = toks;
          if (c === 'git' || c === 'npm' || c === 'npx') comandos.add(sub ? `${c} ${sub}` : c);
          else if (c === 'node' || c === 'xvfb-run') comandos.add(c);
        }
      }
      for (const f of flags) e.push(`SKILL.md nombra ${f}, que loop.mjs no tiene`);
      for (const r of rutas) e.push(`SKILL.md nombra ${r}, que no existe`);
      let allow = [];
      try {
        allow = JSON.parse(settingsTxt ?? '{}').permissions?.allow ?? [];
      } catch (err) {
        e.push(`.claude/settings.json no es JSON válido: ${err.message}`);
      }
      for (const cmd of comandos) if (!allow.includes(`Bash(${cmd}:*)`) && !allow.includes(`Bash(${cmd})`)) e.push(`SKILL.md usa «${cmd}» y .claude/settings.json no lo permite (Bash(${cmd}:*))`);
      const bytes = Buffer.byteLength(promptTxt);
      if (bytes > 600) e.push(`PROMPT.md tiene ${bytes} bytes (máximo 600)`);
      const podridos = [
        [/(?<![.\w])claude\//, 'una rama claude/'],
        [/chromium-\d/, 'una ruta de Chromium'],
        [/Iteración \d/, 'un número de iteración'],
        [/loop\/\d/, 'una rama loop/N'],
        [/\d+ pruebas/, 'una cifra de pruebas'],
        [/\d+ e2e/, 'una cifra de e2e'],
        [/mod \d/, 'una regla mod N'],
      ];
      for (const [re, que] of podridos) if (re.test(promptTxt)) e.push(`PROMPT.md contiene ${que} (${re.source}): eso se pudre, va en la skill`);
    }
    regla('R8', e, a, 'la skill nombra flags, rutas y comandos que existen y están permitidos; el prompt no lleva hechos que se pudren');
  }
  // R9: sin flujos de GitHub Actions (CLAUDE.md: no hay CI)
  {
    const carpeta = join(dir, '.github', 'workflows');
    const flujos = existsSync(carpeta) ? readdirSync(carpeta).filter((f) => /\.ya?ml$/.test(f)) : [];
    regla('R9', [], flujos.length ? [`hay flujos en .github/workflows (${flujos.join(', ')}): CLAUDE.md: no hay CI en Actions`] : [], 'sin flujos de GitHub Actions');
  }

  const cuenta = (nivel) => lineas.filter((l) => l.nivel === nivel).length;
  const ok = cuenta('ok');
  const avisos = cuenta('aviso');
  const errores = cuenta('ERROR');
  const salida = [
    ...lineas.map((l) => `${l.nivel === 'ok' ? 'ok ' : l.nivel} ${l.regla} ${l.msg}`),
    `--check: ${ok} ok, ${avisos} aviso${avisos === 1 ? '' : 's'}, ${errores} error${errores === 1 ? '' : 'es'}`,
  ].join('\n');
  return { lineas, ok, avisos, errores, salida };
}

/* ---------------------------------------------------------------- reclamar */

/** owner y repo de la URL de origin (https://github.com/o/r(.git) o git@github.com:o/r.git). */
export function ownerRepo(url) {
  const m = /github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url || '');
  return m ? { owner: m[1], repo: m[2] } : null;
}

async function prAbierto(repo, rama, { sinRed, fetchFn }) {
  if (sinRed) return 'no se pudo consultar (--sin-red)';
  const or = ownerRepo(git(repo, ['remote', 'get-url', 'origin']).stdout.trim());
  if (!or) return 'no se pudo consultar (origin no es un repo de GitHub)';
  try {
    const r = await fetchFn(`https://api.github.com/repos/${or.owner}/${or.repo}/pulls?state=open&head=${or.owner}:${rama}`, {
      signal: AbortSignal.timeout(10000),
      headers: { accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return `no se pudo consultar (HTTP ${r.status})`;
    const lista = await r.json();
    return lista.length ? lista[0].html_url : 'ninguno';
  } catch (err) {
    return `no se pudo consultar (${motivo(err)})`;
  }
}

const motivo = (err) => (err?.name === 'TimeoutError' ? 'tiempo agotado' : err?.cause?.message || err?.message || String(err));

/** Reclama la iteración que toca creando loop/N en origin con un commit vacío; devuelve el código de salida.
    `antesDelPush` es un gancho de las pruebas: corre entre el fetch y el push con lease del relevo. */
export async function reclamar({ relevo = false, sinRed = false, horas = RECLAMO_H, repo = root, fetchFn = globalThis.fetch, print = console.log, sesion = process.env.CLAUDE_CODE_REMOTE_SESSION_ID || 'local', antesDelPush = () => {} } = {}) {
  for (let intento = 0; intento < 2; intento++) {
    const f = git(repo, ['fetch', '-q', '--prune', 'origin', 'master', '+refs/heads/loop/*:refs/remotes/origin/loop/*']);
    if (f.status !== 0) {
      print(`Sin acceso a origin: no se puede reclamar ni publicar (${primera(f.stderr)})`);
      return 5;
    }
    const show = git(repo, ['show', 'origin/master:IMPROVEMENTS.md']);
    if (show.status !== 0) {
      print(`ERROR: no se pudo leer IMPROVEMENTS.md de origin/master (${primera(show.stderr)})`);
      return 1;
    }
    let s;
    try {
      s = siguiente(show.stdout);
    } catch (err) {
      if (!(err instanceof LoopError)) throw err;
      print(`ERROR: ${err.message}`);
      return err.codigo;
    }
    if (intento === 0) print(textoSiguiente(s));
    const M = s.n - 1;
    const rama = s.rama;
    const ref = `refs/remotes/origin/${rama}`;
    const que = s.tipo === 'Expansión' ? `ítem ${s.item} (${s.titulo})` : `pendiente ${s.item} (${corta(s.titulo, 60)})`;
    const resumen = s.tipo === 'Expansión' ? `ítem ${s.item}, ${s.eje}` : `pendiente ${s.item}`;
    const viejas = () => {
      const lista = git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/loop/'])
        .stdout.split('\n')
        .map((r) => /^origin\/(loop\/(\d+))$/.exec(r))
        .filter((m) => m && +m[2] <= M)
        .map((m) => m[1]);
      print(`Ramas loop/* de iteraciones ya fusionadas (inocuas): ${lista.length ? lista.join(', ') : 'ninguna'}`);
    };
    const commitVacio = (verbo) => {
      const co = git(repo, ['checkout', '-q', '-B', rama, 'origin/master']);
      if (co.status !== 0) return co;
      return git(repo, ['commit', '-q', '--allow-empty', '-m', `Iteración ${s.n}: ${verbo} ${new Date().toISOString()} · ${que} · sesión ${sesion}`]);
    };

    if (git(repo, ['rev-parse', '--verify', '-q', ref]).status !== 0) {
      const c = commitVacio('reclamo');
      if (c.status !== 0) {
        print(`ERROR: no se pudo crear ${rama} (${primera(c.stderr)})`);
        return 1;
      }
      const p = git(repo, ['push', '-q', 'origin', rama]);
      if (p.status === 0) {
        print(`Reclamada la iteración ${s.n} (${resumen}): rama ${rama}`);
        viejas();
        return 0;
      }
      // otra sesión pudo crear la rama entre el fetch y el push: se vuelve a mirar una vez
      if (intento === 0) continue;
      print(`Sin acceso a origin: no se puede reclamar ni publicar (${primera(p.stderr)})`);
      return 5;
    }

    const ct = +git(repo, ['log', '-1', '--format=%ct', ref]).stdout.trim();
    const edad = Date.now() / 1000 - ct;
    const asunto = git(repo, ['log', '-1', '--format=%s', ref]).stdout.trim();
    const viejo = git(repo, ['rev-parse', ref]).stdout.trim();
    const sha7 = viejo.slice(0, 7);
    if (edad < horas * 3600) {
      print(`Ocupada: la iteración ${s.n} la trabaja otra sesión desde hace ${Math.round(edad / 60)} min (${rama}: "${asunto}")`);
      viejas();
      return 3;
    }
    const h = Math.floor(edad / 3600);
    if (!relevo) {
      print(`Vencida: ${rama} lleva ${h} h sin commits (${sha7}) · PR abierto: ${await prAbierto(repo, rama, { sinRed, fetchFn })}`);
      viejas();
      return 4;
    }
    // relevo: se conserva el trabajo de la rama vencida (si hay más que el reclamo) y se reemplaza con lease
    if (+git(repo, ['rev-list', '--count', `origin/master..${ref}`]).stdout.trim() > 1) {
      const g = git(repo, ['push', '-q', 'origin', `${viejo}:refs/heads/${rama}-vencida-${sha7}`]);
      if (g.status !== 0) print(`aviso: no se pudo conservar el trabajo de ${rama} en ${rama}-vencida-${sha7} (${primera(g.stderr)})`);
    }
    const c = commitVacio('relevo');
    if (c.status !== 0) {
      print(`ERROR: no se pudo crear ${rama} (${primera(c.stderr)})`);
      return 1;
    }
    await antesDelPush();
    const p = git(repo, ['push', '-q', `--force-with-lease=refs/heads/${rama}:${viejo}`, 'origin', `HEAD:refs/heads/${rama}`]);
    if (p.status === 0) {
      print(`Relevada la iteración ${s.n} (${resumen}): rama ${rama}`);
      viejas();
      return 0;
    }
    print(`Ocupada: otra sesión relevó ${rama}`);
    viejas();
    return 3;
  }
  return 5;
}

/* --------------------------------------------------------------- publicado */

const sha256 = (texto) => createHash('sha256').update(texto).digest('hex');

/** Compara el sw.js publicado en GitHub Pages con el de origin/master. Devuelve {codigo, linea}. */
export async function publicado({ fetch: fetchFn = globalThis.fetch, homepage, swLocal, owner, repo: nombre } = {}) {
  homepage ??= JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).homepage;
  if (!homepage) return { codigo: 4, linea: 'Web publicada: no se pudo comprobar (package.json sin homepage)' };
  if (swLocal === undefined) {
    const s = git(root, ['show', 'origin/master:sw.js']);
    if (s.status !== 0) return { codigo: 4, linea: `Web publicada: no se pudo comprobar (sin origin/master: ${primera(s.stderr)})` };
    swLocal = s.stdout;
  }
  if (!owner) ({ owner, repo: nombre } = ownerRepo(git(root, ['remote', 'get-url', 'origin']).stdout.trim()) ?? {});
  const opciones = () => ({ signal: AbortSignal.timeout(10000), cache: 'no-store' });
  let r;
  try {
    r = await fetchFn(new URL('sw.js', homepage).href, opciones());
  } catch (err) {
    return { codigo: 4, linea: `Web publicada: no se pudo comprobar (${motivo(err)})` };
  }
  if (r.ok) {
    if (sha256(await r.text()) === sha256(swLocal)) return { codigo: 0, linea: 'Web publicada al día (sw.js = origin/master)' };
    return { codigo: 2, linea: 'Web publicada atrasada: sw.js no coincide con origin/master (Pages tarda unos minutos tras el merge)' };
  }
  let hasPages = 'desconocido';
  try {
    const api = await fetchFn(`https://api.github.com/repos/${owner}/${nombre}`, opciones());
    if (api.status === 403 || api.status === 429) return { codigo: 4, linea: `Web publicada: no se pudo comprobar (api.github.com respondió ${api.status}: cuota agotada)` };
    if (api.ok) hasPages = String((await api.json()).has_pages);
  } catch (err) {
    return { codigo: 4, linea: `Web publicada: no se pudo comprobar (${motivo(err)})` };
  }
  return {
    codigo: 2,
    linea: `Web sin publicar: ${homepage} responde ${r.status} y el repo tiene has_pages=${hasPages}. Benjamin: Settings → Pages → Build and deployment → Source: Deploy from a branch → master, /(root). Pages despliega con un flujo interno de GitHub Actions: la cuenta tiene que poder correr jobs de Actions.`,
  };
}

/* --------------------------------------------------------------------- CLI */

function opciones(argv) {
  const o = { modo: null, json: false, relevo: false, sinRed: false, horas: RECLAMO_H, repo: root, archivo: null, ref: null, help: false };
  const valor = (i, flag) => {
    if (i + 1 >= argv.length) throw new LoopError(`${flag} necesita un valor`, 1);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--siguiente', '--check', '--reclamar', '--publicado'].includes(a)) o.modo = a.slice(2);
    else if (a === '--json') o.json = true;
    else if (a === '--relevo') o.relevo = true;
    else if (a === '--sin-red') o.sinRed = true;
    else if (a === '--horas') o.horas = Number(valor(i++, a));
    else if (a === '--repo') o.repo = resolve(valor(i++, a));
    else if (a === '--archivo') o.archivo = resolve(valor(i++, a));
    else if (a === '--ref') o.ref = valor(i++, a);
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new LoopError(`opción desconocida: ${a} (node tools/loop.mjs --help)`, 1);
  }
  if (!(o.horas > 0)) throw new LoopError('--horas necesita un número de horas mayor que 0', 1);
  return o;
}

function textoDe(o) {
  if (o.archivo) return readFileSync(o.archivo, 'utf8');
  if (o.ref) {
    const r = git(root, ['show', `${o.ref}:IMPROVEMENTS.md`]);
    if (r.status !== 0) throw new LoopError(`no se pudo leer ${o.ref}:IMPROVEMENTS.md (${primera(r.stderr)})`, 1);
    return r.stdout;
  }
  return readFileSync(join(root, 'IMPROVEMENTS.md'), 'utf8');
}

/** El fetch de Node no mira HTTPS_PROXY por sí solo: en una sesión cloud (proxy obligatorio) los modos
    que salen a la red se relanzan con NODE_USE_ENV_PROXY=1; en un PC sin proxy no cambia nada. */
function conProxy(argv, o) {
  const red = o.modo === 'publicado' || (o.modo === 'reclamar' && !o.sinRed);
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!red || !proxy || process.env.NODE_USE_ENV_PROXY) return null;
  const r = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', fileURLToPath(import.meta.url), ...argv], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  return r.status ?? 1;
}

async function main(argv) {
  const o = opciones(argv);
  if (o.help || !o.modo) {
    console.log(USO);
    return o.help ? 0 : 1;
  }
  const relanzado = conProxy(argv, o);
  if (relanzado !== null) return relanzado;
  if (o.modo === 'siguiente') {
    const s = siguiente(textoDe(o));
    if (o.json) {
      const { ultima, ...json } = s;
      console.log(JSON.stringify(json, null, 2));
    } else console.log(textoSiguiente(s));
    return 0;
  }
  if (o.modo === 'check') {
    const r = check(textoDe(o));
    console.log(r.salida);
    return r.errores ? 1 : 0;
  }
  if (o.modo === 'reclamar') return reclamar({ relevo: o.relevo, sinRed: o.sinRed, horas: o.horas, repo: o.repo });
  const p = await publicado();
  console.log(p.linea);
  return p.codigo;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    (err) => {
      console.error(`ERROR: ${err.message}`);
      process.exit(err instanceof LoopError ? err.codigo : 1);
    },
  );
}
