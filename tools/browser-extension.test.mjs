#!/usr/bin/env node
/* Pruebas de la extensión de Chrome y Firefox (browser-extension/): permisos mínimos del manifiesto y armado del
   enlace a GraphBranch.

     node --test                          todas las pruebas (archivos *.test.mjs)
     node tools/browser-extension.test.mjs  solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'browser-extension');
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const { repoFromUrl, appUrl, APP } = createRequire(import.meta.url)('../browser-extension/repo.js');

test('el manifiesto: MV3, sin permisos ni host_permissions, solo github.com', () => {
  assert.equal(manifest.manifest_version, 3);
  for (const k of ['permissions', 'host_permissions', 'optional_permissions', 'optional_host_permissions',
    'background', 'web_accessible_resources', 'externally_connectable', 'content_security_policy'])
    assert.equal(manifest[k], undefined, `${k} no va`);
  assert.equal(manifest.content_scripts.length, 1);
  const cs = manifest.content_scripts[0];
  assert.deepEqual(cs.matches, ['https://github.com/*']);
  assert.deepEqual(cs.js, ['repo.js', 'content.js']);
  for (const f of [...cs.js, ...Object.values(manifest.icons)]) assert.ok(existsSync(join(dir, f)), `${f} existe`);
  assert.match(manifest.browser_specific_settings.gecko.id, /@/);
});

test('ni la extensión ni su script usan la red, eval ni el almacenamiento', () => {
  for (const f of ['repo.js', 'content.js']) {
    const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|eval\(|new Function|innerHTML|localStorage|chrome\.|browser\.|cookie/, f);
  }
});

test('repoFromUrl: la página de un repo (con subrutas) da dueño/repo; lo demás, null', () => {
  assert.equal(repoFromUrl('https://github.com/bfigueroa99/GraphBranch'), 'bfigueroa99/GraphBranch');
  assert.equal(repoFromUrl('https://github.com/o/r/pull/12/files?x=1#y'), 'o/r');
  assert.equal(repoFromUrl('https://github.com/o/r.git'), 'o/r');
  assert.equal(repoFromUrl('https://github.com/o/.github'), 'o/.github');
  assert.equal(repoFromUrl('https://github.com/o'), null, 'un perfil');
  assert.equal(repoFromUrl('https://github.com/'), null);
  assert.equal(repoFromUrl('https://github.com/orgs/acme/people'), null);
  assert.equal(repoFromUrl('https://github.com/settings/profile'), null);
  assert.equal(repoFromUrl('https://github.com/marketplace/actions'), null);
  assert.equal(repoFromUrl('https://gist.github.com/o/abc'), null);
  assert.equal(repoFromUrl('https://github.com.evil.com/o/r'), null);
  assert.equal(repoFromUrl('https://evil.com/github.com/o/r'), null);
  assert.equal(repoFromUrl('http://github.com/o/r'), null);
  assert.equal(repoFromUrl('https://github.com:8443/o/r'), null);
  assert.equal(repoFromUrl('https://github.com/o/..'), null);
  assert.equal(repoFromUrl('javascript:alert(1)'), null);
  assert.equal(repoFromUrl('no es una url'), null);
});

test('appUrl: va a la web publicada con ?repo= codificado', () => {
  assert.equal(APP, 'https://bfigueroa99.github.io/GraphBranch/');
  assert.equal(appUrl('o/r'), 'https://bfigueroa99.github.io/GraphBranch/?repo=o%2Fr');
  const u = new URL(appUrl('o/r.x-y_z'));
  assert.equal(u.searchParams.get('repo'), 'o/r.x-y_z');
  assert.equal(u.origin, 'https://bfigueroa99.github.io');
});
