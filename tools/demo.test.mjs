#!/usr/bin/env node
/* Pruebas de la demo (js/sources/demo.js): su historia inventada aguanta mucho tiempo de actividad.

     node --test                  todas las pruebas (archivos *.test.mjs)
     node tools/demo.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (file) => readFileSync(join(root, 'js', file), 'utf8');

/** Una demo en un contexto aislado, con su azar fijo y sus `later` en una cola que la prueba corre a mano. */
function demo(seed) {
  const ctx = vm.createContext({ setTimeout, clearTimeout, TextEncoder, TextDecoder, console, document: { hidden: false, addEventListener() {}, removeEventListener() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  ctx.window = ctx;
  for (const f of ['util.js', 'diff.js']) vm.runInContext(code(f), ctx, { filename: f });
  vm.runInContext(`GB.i18n = { locale: 'en', msg: (k, p) => ({ key: k, params: p }), t: (k) => k, text: String, fmtNum: String };`, ctx);
  for (const f of ['sources/demo-content.js', 'sources/demo.js']) vm.runInContext(code(f), ctx, { filename: f });
  const src = new ctx.GB.DemoSource();
  let t = seed >>> 0;
  src.rnd = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const queue = [];
  src.later = (ms, fn) => queue.push(fn);
  src.seed();
  src.running = true;
  return { src, GB: ctx.GB, flush: () => queue.splice(0).forEach((fn) => fn()) };
}

test('mucha actividad seguida no rompe la demo: un PR apilado sobre una rama fusionada y borrada pasa a la base de esa', () => {
  for (const seed of [1, 7, 42, 2026, 31337]) {
    const { src, flush } = demo(seed);
    for (let i = 0; i < 1500; i++) {
      src.publish(src.actions() || []);
      flush();
      for (const pr of src.data.pulls.values()) assert.ok(src.data.branches.has(pr.base), `semilla ${seed}, paso ${i}: el PR #${pr.number} apunta a ${pr.base}, que ya no existe`);
    }
  }
});

test('commitsByPath: el historial de un archivo del diff de la demo incluye al commit que lo cambió', async () => {
  const { src } = demo(7);
  let probados = 0;
  for (const c of src.data.commits.values()) {
    const scope = /^\w+\((\w+)\)!?:/.exec(c.message || '')?.[1];
    if (!scope || scope === 'deps') continue;
    const { files } = await src.commitDiff(c.sha);
    const file = files.find((f) => f.path.includes(`/${scope}/`) || f.path.includes(`/${scope}.`));
    if (!file) continue;
    assert.ok((await src.commitsByPath(file.path)).has(c.sha), `el historial de ${file.path} no trae a ${c.message}`);
    if (++probados >= 5) break;
  }
  assert.ok(probados, 'la demo no tiene un commit con ámbito del que sacar un archivo');
});

test('fileLog: la demo da los commits que tocaron el archivo, del más nuevo al más viejo y sin pasar del commit pedido', async () => {
  const { src } = demo(7);
  const c = [...src.data.commits.values()].find((x) => /^\w+\((\w+)\)!?:/.test(x.message || '') && !/\(deps\)/.test(x.message));
  const { files } = await src.commitDiff(c.sha);
  const log = await src.fileLog(files[0].path, c.sha);
  assert.ok(log.length >= 1 && log.length <= 8);
  assert.ok(log.every((e, i) => e.date <= c.date && (i === 0 || log[i - 1].date >= e.date)));
  assert.ok(log.every((e) => e.sha && typeof e.message === 'string' && 'author' in e));
});

test('fileLog: el historial de un archivo de un commit siempre incluye ese commit, sea cual sea el commit', async () => {
  for (const seed of [7, 8, 9]) {
    const { src } = demo(seed);
    for (const c of [...src.data.commits.values()].slice(0, 60)) {
      const { files } = await src.commitDiff(c.sha);
      for (const f of files.slice(0, 3)) {
        const log = await src.fileLog(f.path, c.sha);
        assert.ok(log.some((e) => e.sha === c.sha), `el historial de ${f.path} no trae al commit «${c.message}» que lo cambia (semilla ${seed})`);
      }
    }
  }
});

test('fileBlame: la demo reparte las líneas entre los commits del archivo, sin huecos ni solapes', async () => {
  const { src } = demo(7);
  const c = [...src.data.commits.values()].find((x) => /^\w+\((\w+)\)!?:/.test(x.message || '') && !/\(deps\)/.test(x.message));
  const { files } = await src.commitDiff(c.sha);
  const blame = await src.fileBlame(files[0].path, c.sha);
  assert.ok(blame.length >= 1);
  assert.equal(blame[0].from, 1);
  blame.forEach((r, i) => i && assert.equal(r.from, blame[i - 1].to + 1));
  assert.ok(blame.every((r) => r.to >= r.from && r.sha && typeof r.message === 'string'));
});

test('los commits de agente de la demo llevan sus trailers, y el filtro por ruta solo mira el titular', async () => {
  const { src } = demo(7);
  const signed = [...src.data.commits.values()].filter((c) => /\nClaude-Session: https:\/\/claude\.ai\/code\/session_\w+$/.test(c.message));
  assert.ok(signed.length >= 3, `${signed.length} commits de sesiones de Claude en la semilla`);
  // «Co-Authored-By» contiene «auth»: no por eso un commit de agente toca src/auth
  const auth = await src.commitsByPath('src/auth');
  for (const c of signed) if (!/auth/i.test(c.message.split('\n')[0])) assert.equal(auth.has(c.sha), false, c.message.split('\n')[0]);
});

test('cargar más: la historia de main de antes de la semilla llega de a 6, sin tocar otras ramas, y después no hay más', async () => {
  const { src } = demo(7);
  const { commits, branches } = src.data;
  const cut = () => {
    let c = commits.get(branches.get('main').sha);
    while (c && c.parents[0] && commits.has(c.parents[0])) c = commits.get(c.parents[0]);
    return c?.parents[0] || null;
  };
  assert.ok(cut(), 'la historia cargada de main se corta antes de su raíz');
  const heads = JSON.stringify([...branches.values()].map((b) => [b.name, b.sha]));
  const updates = [];
  src.on('update', (u) => updates.push(u));
  const before = commits.size;
  assert.equal(await src.loadMore('main'), 6);
  assert.equal(commits.size, before + 6);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].calm, true);
  assert.equal(await src.loadMore('develop'), 6, 'develop sale de main: su ficha trae lo que sigue');
  assert.equal(cut(), null, 'con 12, main llega a su raíz');
  assert.equal(await src.loadMore('main'), 0);
  assert.equal(JSON.stringify([...branches.values()].map((b) => [b.name, b.sha])), heads, 'ninguna rama se movió');
  assert.equal(src.hasMore('main'), false, 'sin historia guardada, la ficha no ofrece más');
  // mucha actividad después: lo traído es lo más viejo, y recortar por fecha no lo vuelve a sacar
  const loaded = [...src.kept];
  assert.equal(loaded.length, 12);
  for (let i = 0; i < 1500; i++) src.publish(src.actions() || []);
  assert.ok(loaded.every((sha) => commits.has(sha)), 'lo traído con «Cargar más» sigue cargado tras 1500 publicaciones');
});

test('la historia de la demo trae PRs fusionados con su número y sus revisiones: la salud parte su tiempo de ciclo en etapas', () => {
  for (const seed of [1, 7, 42, 2026, 31337]) {
    const { src } = demo(seed);
    assert.equal(src.givesReviews(), true);
    const ctx = vm.createContext({ window: { GB: {} } });
    vm.runInContext(code('health.js'), ctx, { filename: 'health.js' });
    const acts = src.history.map((a) => ({ ...a }));
    const merges = acts.filter((a) => a.kind === 'pr-merge');
    assert.ok(merges.length >= 3 && merges.every((a) => Number.isInteger(a.number) && a.openedAt < a.time), `semilla ${seed}: los merges de la historia llevan su número y su apertura`);
    const since = Math.min(...acts.map((a) => a.time));
    assert.ok(merges.every((a) => a.openedAt >= since), `semilla ${seed}: ningún PR de la historia se abre antes de la actividad cargada`);
    const c = ctx.window.GB.health.compute(src.data, acts, Math.max(...acts.map((a) => a.time)) + 60e3).cycle;
    assert.equal(c.early, 0, `semilla ${seed}`);
    assert.ok(c.open.n >= 2 && c.review.n >= 2 && c.merge.n >= 2, `semilla ${seed}: las tres etapas con al menos dos PRs: ${JSON.stringify(c)}`);
    assert.ok(c.noReview >= 1, `semilla ${seed}: el de Dependabot se fusionó sin revisión`);
  }
});

test('la demo trae un puntaje de OpenSSF Scorecard sin consultar nada: con fecha, y con al menos tres comprobaciones con puntaje', () => {
  const { src } = demo(7);
  const sc = src.data.scorecard;
  assert.equal(sc?.state, 'ok', 'la salud de la demo muestra la sección de Scorecard');
  assert.ok(sc.score >= 0 && sc.score <= 10);
  assert.ok(sc.date > 0 && sc.date <= Date.now(), 'el análisis es de antes de ahora');
  const rated = sc.checks.filter((c) => Number.isInteger(c.score) && c.score >= 0 && c.score <= 10);
  assert.ok(rated.length >= 3, 'hay tres comprobaciones que mostrar');
  assert.ok(sc.checks.every((c) => /^[A-Za-z][A-Za-z0-9-]{0,39}$/.test(c.name) && typeof c.reason === 'string' && c.reason), 'nombres como los de Scorecard y un motivo cada una');
  assert.ok(sc.checks.some((c) => c.score === -1), 'y una no concluyente, que la salud no cuenta como baja');
});

test('la demo trae un PR fusionado en main después de v1.4.0: el borrador de notas de la versión tiene qué mostrar sin token', () => {
  for (const seed of [1, 7, 42]) {
    const { src } = demo(seed);
    const ctx = vm.createContext({ window: { GB: {} } });
    vm.runInContext(code('digest.js'), ctx, { filename: 'digest.js' });
    const acts = src.history.map((a) => ({ ...a, detail: typeof a.detail === 'string' ? a.detail : '', title: '' }));
    const n = ctx.window.GB.digest.releaseNotes(src.data, acts);
    assert.equal(n.tag?.name, 'v1.4.0', `semilla ${seed}`);
    assert.deepEqual(Array.from(n.prs.rows, (r) => r.number), [33], `semilla ${seed}: solo el arreglo de después del tag, sin #31 ni #34`);
    assert.equal(n.prs.rows[0].title, 'Send cache headers for static files');
    assert.ok(n.prs.rows[0].author, 'con su autor');
    assert.ok(n.people.total >= 1);
  }
});

test('la demo trae un CODEOWNERS: cada archivo que inventa su panel de cambios tiene dueños, y algunos más de uno', async () => {
  const { src, GB } = demo(7);
  const got = await src.codeOwners();
  assert.equal(got.path, '.github/CODEOWNERS');
  const rules = GB.diff.parseOwners(got.text);
  const shas = [...src.data.commits.keys()].slice(0, 60);
  const paths = new Set();
  for (const r of await Promise.all(shas.map((sha) => src.commitDiff(sha)))) for (const f of r.files) paths.add(f.path);
  assert.ok(paths.size > 5);
  const owned = [...paths].map((p) => [p, GB.diff.ownersOf(rules, p)]);
  assert.ok(owned.every(([, o]) => o?.length), 'todo archivo de la demo tiene dueño: ' + owned.filter(([, o]) => !o?.length).map(([p]) => p).join(', '));
  assert.ok(owned.every(([, o]) => o.every((w) => w.includes('@'))), 'cada dueño es una cuenta, un equipo o un correo (un patrón por línea)');
  assert.ok(owned.some(([, o]) => o.length > 1), 'alguno con más de un dueño');
  assert.ok(new Set(owned.map(([, o]) => o.join(' '))).size >= 3, 'dueños distintos según la carpeta');
});

test('una aprobación o un pedido de cambios de la demo queda en su PR, como el reviewDecision de GitHub: la vista de texto, la salud y el Launchpad lo leen', () => {
  let aprobados = 0;
  let cambios = 0;
  for (const seed of [1, 7, 42]) {
    const { src, flush } = demo(seed);
    for (let i = 0; i < 400; i++) {
      const acts = src.doReview() || [];
      flush();
      for (const a of acts) {
        const pr = src.data.pulls.get(a.number);
        if (a.kind === 'review-ok') assert.equal(pr.review, 'approved', `semilla ${seed}: aprobado y el PR #${a.number} dice ${pr.review}`), aprobados++;
        if (a.kind === 'review-changes') assert.equal(pr.review, 'changes', `semilla ${seed}: cambios pedidos y el PR #${a.number} dice ${pr.review}`), cambios++;
      }
    }
  }
  assert.ok(aprobados > 10 && cambios > 10, `${aprobados} aprobaciones y ${cambios} pedidos de cambios`);
});

test('la firma de los commits de la demo (ítem 230): cada autor siempre igual, y la salud tiene verificados, sin firma y firmados sin verificar en main', () => {
  for (const seed of [1, 7, 42, 2026, 31337]) {
    const { src, flush } = demo(seed);
    for (let i = 0; i < 300; i++) {
      src.publish(src.actions() || []);
      flush();
    }
    const by = new Map(); // autor -> la firma de sus commits
    for (const c of src.data.commits.values()) {
      assert.ok(c.sig, `semilla ${seed}: ${c.sha} sin firma conocida`);
      const key = c.author.login || c.author.name;
      const s = c.sig.ok ? 'ok' : c.sig.state;
      assert.equal(by.get(key) ?? s, s, `semilla ${seed}: ${key} firma distinto en dos commits`);
      by.set(key, s);
    }
    assert.equal(by.get('vrojas'), 'ok');
    assert.equal(by.get('msoto'), 'UNSIGNED');
    assert.equal(by.get('dmunoz'), 'EXPIRED_KEY');
    if (by.has('taraya')) assert.equal(by.get('taraya'), 'UNSIGNED');
    const ctx = vm.createContext({ window: { GB: {} } });
    vm.runInContext(code('health.js'), ctx, { filename: 'health.js' });
    const now = Math.max(...[...src.data.commits.values()].map((c) => c.date)) + 60e3;
    const s = ctx.window.GB.health.compute(src.data, [], now).signed;
    assert.ok(s && s.total > s.unverified && s.unsigned >= 1, `semilla ${seed}: main tiene commits verificados y sin firma en las 4 semanas: ${JSON.stringify(s)}`);
  }
  // la semilla de la página: la demo recién abierta ya muestra un firmado sin verificar en main
  const { src } = demo(1);
  const ctx = vm.createContext({ window: { GB: {} } });
  vm.runInContext(code('health.js'), ctx, { filename: 'health.js' });
  const s = ctx.window.GB.health.compute(src.data, [], Date.now()).signed;
  assert.ok(s?.invalid >= 1 && s.unsigned >= 1, JSON.stringify(s));
});
