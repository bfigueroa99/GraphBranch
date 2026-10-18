#!/usr/bin/env node
/* Pruebas de los avisos a Slack y Discord: js/hooks.js (qué evento va a qué webhook) y
   electron/webhooks.js (qué URL se acepta, qué cuerpo se manda y que un texto de GitHub no
   menciona a nadie). El envío usa un servidor local que hace de webhook.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/webhooks.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wh = createRequire(import.meta.url)('../electron/webhooks.js');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'hooks.js'), 'utf8'), ctx, { filename: 'hooks.js' });
const hooks = ctx.window.GB.hooks;

const SLACK = 'https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXX';
const TEAMS = 'https://prod-12.westus.logic.azure.com:443/workflows/0123456789abcdef0123456789abcdef/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sig=abcDEF_123-456';
const DISCORD = 'https://discord.com/api/webhooks/123456789012345678/abcDEF_-123456';

test('solo se aceptan URL de webhook de su propio servicio', () => {
  assert.ok(wh.valid('slack', SLACK));
  assert.ok(wh.valid('discord', DISCORD));
  for (const bad of [
    'http://hooks.slack.com/services/T000/B000/XXXXXXXXXXXX',
    'https://hooks.slack.com.evil.example/services/T000/B000/XXXXXXXXXXXX',
    'https://evil.example/https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXX',
    'https://hooks.slack.com@evil.example/services/T000/B000/XXXXXXXXXXXX',
    'http://127.0.0.1:1/x',
    '',
    null,
  ]) assert.equal(wh.valid('slack', bad), false, String(bad));
  assert.equal(wh.valid('slack', DISCORD), false); // el webhook de uno no sirve para el otro
  assert.equal(wh.valid('discord', SLACK), false);
  assert.equal(wh.valid('github', SLACK), false);
  assert.ok(wh.valid('teams', TEAMS));
  assert.ok(wh.valid('teams', 'https://acme.webhook.office.com/webhookb2/aaaaaaaa-1111@bbbbbbbb-2222/IncomingWebhook/0123456789abcdef/cccccccc-3333'));
  for (const bad of [
    TEAMS.replace('https', 'http'),
    TEAMS.replace('logic.azure.com', 'logic.azure.com.evil.example'),
    'https://evil.example/prod.logic.azure.com/workflows/0123456789abcdef/triggers/manual/paths/invoke?sig=abcdefgh',
    'https://logic.azure.com@evil.example/workflows/0123456789abcdef/triggers/manual/paths/invoke?sig=abcdefgh',
    'https://prod-12.westus.logic.azure.com/workflows/0123456789abcdef/triggers/manual/paths/invoke',
    SLACK,
  ]) assert.equal(wh.valid('teams', bad), false, bad);
  assert.equal(wh.valid('slack', TEAMS), false);
  assert.equal(wh.valid('discord', TEAMS), false);
  assert.ok(wh.valid('slack', 'http://127.0.0.1:9/x', 'http://127.0.0.1:')); // el servidor de pruebas
});

test('el cuerpo no deja que un texto de GitHub mencione a nadie ni abra enlaces ajenos', () => {
  const ev = { repo: 'acme/app', kind: 'Release', title: 'v1 <!channel> & <https://evil.example|click>', detail: '@everyone', url: 'javascript:alert(1)' };
  const s = wh.payload('slack', ev);
  assert.ok(!s.text.includes('<!channel>') && !s.text.includes('<https://evil'));
  assert.match(s.text, /&lt;!channel&gt; &amp;/);
  assert.ok(!s.text.includes('javascript:')); // solo https
  const d = wh.payload('discord', { ...ev, url: 'https://github.com/acme/app/releases/tag/v1' });
  assert.deepEqual(d.allowed_mentions, { parse: [] });
  assert.match(d.content, /<https:\/\/github\.com\/acme\/app\/releases\/tag\/v1>$/);
  assert.ok(wh.payload('discord', { title: 'x'.repeat(5000) }).content.length <= 2000);
});

test('el cuerpo de Teams es una tarjeta adaptable sin menciones ni enlaces ajenos', () => {
  const ev = { repo: 'acme/app', kind: 'Release', title: 'v1 <at>Todos</at> [x](https://evil.example) *grueso*', detail: '@everyone', url: 'https://github.com/acme/app/releases/tag/v(1)' };
  const p = wh.payload('teams', ev);
  assert.equal(p.type, 'message');
  const card = p.attachments[0];
  assert.equal(card.contentType, 'application/vnd.microsoft.card.adaptive');
  assert.equal(card.content.type, 'AdaptiveCard');
  const texts = card.content.body.map((b) => b.text);
  assert.match(texts[0], /^acme\/app · Release$/);
  assert.ok(!texts[1].includes('<at>') && !/(^|[^\\])\[x\]\(/.test(texts[1]) && !/(^|[^\\])\*grueso/.test(texts[1]), texts[1]);
  assert.match(texts[1], /^v1 \\<at\\>/);
  assert.ok(texts[3].endsWith('(https://github.com/acme/app/releases/tag/v%281%29)'), texts[3]);
  assert.equal(wh.payload('teams', { ...ev, url: 'javascript:alert(1)' }).attachments[0].content.body.length, 3); // solo https
});

test('send manda el JSON de cada servicio y no sigue redirecciones', async () => {
  const got = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      got.push({ url: req.url, type: req.headers['content-type'], body: JSON.parse(body) });
      if (req.url === '/redir') return res.writeHead(302, { Location: 'http://127.0.0.1:1/' }).end();
      res.writeHead(req.url === '/fail' ? 500 : 204).end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ev = { repo: 'acme/app', kind: 'CI failed', title: 'main falló' };
    assert.deepEqual(await wh.send('slack', `${base}/ok`, ev, fetch, base), { ok: true, status: 204 });
    assert.equal(got[0].type, 'application/json');
    assert.match(got[0].body.text, /^\*acme\/app\* · CI failed\nmain falló$/);
    assert.deepEqual(await wh.send('teams', `${base}/teams`, ev, fetch, base), { ok: true, status: 204 });
    assert.equal(got.pop().body.attachments[0].content.body[1].text, 'main falló');
    assert.equal((await wh.send('discord', `${base}/fail`, ev, fetch, base)).ok, false);
    assert.equal((await wh.send('discord', `${base}/redir`, ev, fetch, base)).ok, false);
    assert.equal(got.length, 3);
    await assert.rejects(wh.send('slack', `${base}/ok`, ev, fetch), /inválido/); // sin prefijo de pruebas, un servidor local no vale
    assert.equal(got.length, 3);
  } finally {
    server.close();
  }
});

const act = (kind, branch, extra = {}) => ({ kind, branch, id: kind + branch, ...extra });
const ON = { slack: true, discord: true, teams: true };

test('qué actividad es qué evento: solo la rama por defecto cuenta para merge y force-push', () => {
  const e = (a) => hooks.eventOf(a, 'main');
  assert.equal(e(act('release', null)), 'release');
  assert.equal(e(act('ci-fail', 'main')), 'ci');
  assert.equal(e(act('force', 'main')), 'force');
  assert.equal(e(act('force', 'feat/x')), null);
  assert.equal(e(act('pr-merge', 'main')), 'merge');
  assert.equal(e(act('pr-merge', 'release/1')), null);
  assert.equal(e(act('merge', 'main')), 'merge');
  assert.equal(e(act('push', 'main')), null);
  assert.equal(e(act('star', null)), null);
  assert.equal(hooks.eventOf(act('force', 'main'), null), null);
});

test('cada webhook recibe solo los eventos que se marcaron, y solo si tiene URL', () => {
  const acts = [act('release', null), act('ci-fail', 'main'), act('force', 'main'), act('pr-merge', 'main')];
  const all = hooks.route(acts, 'main', {}, ON);
  assert.equal(all.slack.length, 4);
  assert.equal(all.teams.length, 4);
  assert.equal(hooks.route(acts, 'main', {}, { teams: false }).teams.length, 0);
  assert.deepEqual(Array.from(all.slack, (a) => a.kind), ['force', 'ci-fail', 'release', 'pr-merge']); // lo más grave primero
  const some = hooks.route(acts, 'main', { slack: ['ci'], discord: [] }, ON);
  assert.deepEqual(Array.from(some.slack, (a) => a.kind), ['ci-fail']);
  assert.equal(some.discord.length, 0);
  const one = hooks.route(acts, 'main', {}, { slack: true, discord: false });
  assert.equal(one.discord.length, 0);
  assert.equal(one.slack.length, 4);
  assert.equal(hooks.route(acts, 'main', {}, {}).slack.length, 0);
});

test('un PR fusionado avisa una vez aunque llegue también su commit de merge, y un lote grande se recorta', () => {
  const r = hooks.route([act('merge', 'main'), act('pr-merge', 'main')], 'main', {}, ON);
  assert.deepEqual(Array.from(r.slack, (a) => a.kind), ['pr-merge']);
  const many = Array.from({ length: 12 }, (_, i) => act('release', null, { id: 'r' + i }));
  assert.equal(hooks.route(many, 'main', {}, ON).slack.length, hooks.MAX_PER_BATCH);
});
