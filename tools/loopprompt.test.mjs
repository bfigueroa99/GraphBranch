#!/usr/bin/env node
/* Pruebas de js/loopprompt.js: el prompt del loop autónomo para cualquier repo.

     node --test                        todas las pruebas (archivos *.test.mjs)
     node tools/loopprompt.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'loopprompt.js'), 'utf8'), ctx, { filename: 'loopprompt.js' });
const { build, LANGS, MAX_GOAL } = ctx.window.GB.loopPrompt;

const heads = (s) => s.split('\n').filter((l) => /^#{1,2} /.test(l));

test('lleva el repo, la rama de integración y al dueño en cada lugar, sin marcadores sin llenar', () => {
  for (const lang of LANGS) {
    const p = build({ repo: 'acme/app', integration: 'dev', lang });
    assert.match(p, /`acme\/app`/);
    assert.match(p, /origin\/dev/);
    assert.match(p, /@acme/);
    assert.ok(!/\$\{|undefined|null|\{[a-zA-Z]+\}/.test(p), `marcadores sin llenar en ${lang}`);
    assert.ok(p.length > 6000 && p.length < 16000, `largo razonable en ${lang}: ${p.length}`);
  }
});

test('las dos versiones tienen las mismas secciones, en el mismo orden', () => {
  const es = heads(build({ repo: 'a/b', lang: 'es' }));
  const en = heads(build({ repo: 'a/b', lang: 'en' }));
  assert.equal(es.length, en.length);
  assert.equal(es.length, 13, 'título, §0 a §10 y Nunca');
  for (let i = 0; i < es.length; i++) assert.equal(es[i].split(' ')[0], en[i].split(' ')[0]);
});

test('la rama de release solo aparece si es otra que la de integración, y entonces queda prohibida', () => {
  const sin = build({ repo: 'a/b', integration: 'main', lang: 'es' });
  assert.ok(!/solo de release/.test(sin));
  const misma = build({ repo: 'a/b', integration: 'main', release: 'main', lang: 'es' });
  assert.ok(!/solo de release/.test(misma));
  const con = build({ repo: 'a/b', integration: 'dev', release: 'master', lang: 'es' });
  assert.match(con, /`master` es solo de release/);
  assert.match(con, /tocar `master`/);
  assert.match(build({ repo: 'a/b', integration: 'dev', release: 'master', lang: 'en' }), /touching `master`/);
});

test('el objetivo entra tal cual, acotado y sin romper los bloques de código', () => {
  const p = build({ repo: 'a/b', goal: 'Un NVR para bodegas.\n```rm -rf```', lang: 'es' });
  assert.match(p, /## Objetivo del proyecto \(lo escribió @a\)\n\nUn NVR para bodegas\./);
  assert.ok(!p.includes('```'), 'tres comillas invertidas cortarían el bloque donde se pegue');
  assert.match(p, /al principio, el objetivo de arriba/);
  assert.ok(!/Objetivo del proyecto/.test(build({ repo: 'a/b', lang: 'es' })), 'sin objetivo, no hay sección');
  const largo = build({ repo: 'a/b', goal: 'x'.repeat(MAX_GOAL + 500), lang: 'en' });
  assert.ok(!largo.includes('x'.repeat(MAX_GOAL + 1)));
});

test('nombres raros se limpian y lo que no es un repo de GitHub no inventa un dueño', () => {
  const p = build({ repo: ' acme/app `; rm ', integration: 'feat x`', lang: 'es' });
  assert.match(p, /`acme\/app;rm`/);
  assert.match(p, /origin\/featx\b/);
  assert.match(build({ repo: '', lang: 'es' }), /`owner\/repo`/);
  assert.match(build({ repo: 'local/mi repo', lang: 'es' }), /Para el dueño/);
  assert.match(build({ repo: 'demo/x', lang: 'en' }), /For the owner/);
  assert.match(build({ repo: 'a/b', lang: 'es' }), /origin\/main/, 'sin rama, main');
});
