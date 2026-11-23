/* electron/git.js contra repos cuya configuración intenta correr un programa al abrirlos. Antes de cada
   trampa, git solo (sin la app) la hace saltar: así la prueba demuestra algo. Sin red y aislada de la
   configuración global y del sistema de quien la corre (las de la prueba se leen antes que el módulo). */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'gb-local-config-')));
after(() => rmSync(base, { recursive: true, force: true }));

// la configuración «del usuario» de esta prueba: solo confía en la carpeta `ajena` (ver safe.directory)
const ajena = join(base, 'ajena');
writeFileSync(join(base, 'global.gitconfig'), `[safe]\n\tdirectory = ${ajena}\n`);
process.env.GIT_CONFIG_GLOBAL = join(base, 'global.gitconfig');
process.env.GIT_CONFIG_SYSTEM = join(base, 'no-existe.gitconfig');
const local = createRequire(import.meta.url)('../electron/git.js');

const env = { ...process.env, GIT_AUTHOR_NAME: 'Ana', GIT_AUTHOR_EMAIL: 'ana@example.com', GIT_COMMITTER_NAME: 'Ana', GIT_COMMITTER_EMAIL: 'ana@example.com' };
const git = (dir, args, input) => execFileSync('git', args, { cwd: dir, env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const quiet = (dir, args) => {
  try {
    git(dir, args);
  } catch {
    /* que git falle da igual: lo que importa es si corrió el programa */
  }
};

/** Un repo con un commit y un programa que, si alguien lo corre, deja la marca CORRIO. */
function makeRepo(dir) {
  mkdirSync(dir);
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  const evil = join(dir, 'evil.sh');
  writeFileSync(evil, `#!/bin/sh\ntouch '${join(dir, 'CORRIO')}'\nexit 1\n`);
  chmodSync(evil, 0o755);
  return { dir, evil, mark: join(dir, 'CORRIO') };
}

/** Escribe a mano un commit firmado (la firma no vale: basta con que git quiera verificarla). */
function signedCommit(dir, begin, end, msg) {
  const tree = git(dir, ['rev-parse', 'main^{tree}']);
  const parent = git(dir, ['rev-parse', 'main']);
  const body = `tree ${tree}\nparent ${parent}\nauthor Ana <ana@example.com> 1700000000 +0000\ncommitter Ana <ana@example.com> 1700000000 +0000\ngpgsig ${begin}\n eA==\n ${end}\n\n${msg}\n`;
  return git(dir, ['hash-object', '-t', 'commit', '-w', '--stdin'], body);
}

const FIRMAS = [
  ['openpgp', '-----BEGIN PGP SIGNATURE-----', '-----END PGP SIGNATURE-----'],
  ['ssh', '-----BEGIN SSH SIGNATURE-----', '-----END SSH SIGNATURE-----'],
  ['x509', '-----BEGIN SIGNED MESSAGE-----', '-----END SIGNED MESSAGE-----'],
];

/** El repo trampa: commits firmados en los tres formatos y una configuración que los verifica con su programa. */
function trapRepo(name) {
  const repo = makeRepo(join(base, name));
  const signed = FIRMAS.map(([kind, begin, end]) => {
    const sha = signedCommit(repo.dir, begin, end, `firmado con ${kind}`);
    git(repo.dir, ['update-ref', `refs/heads/${kind}`, sha]);
    return [kind, sha];
  });
  for (const [key, value] of [
    ['log.showSignature', 'true'],
    ['gpg.program', repo.evil],
    ['gpg.ssh.program', repo.evil],
    ['gpg.ssh.allowedSignersFile', repo.evil],
    ['gpg.x509.program', repo.evil],
  ])
    git(repo.dir, ['config', key, value]);
  return { ...repo, signed };
}

test('abrir un repo cuya configuración verifica firmas con su propio programa no lo corre', async () => {
  const repo = trapRepo('firmas');
  for (const [kind, sha] of repo.signed) {
    quiet(repo.dir, ['-c', 'core.fsmonitor=false', 'log', '-1', '--format=%H', sha]);
    assert.ok(existsSync(repo.mark), `git log solo no corrió el programa de la firma ${kind}: la trampa no sirve`);
    rmSync(repo.mark);
  }
  const { id } = await local.allow(repo.dir);
  const info = await local.branches(id);
  assert.deepEqual(info.branches.map((b) => b.name).sort(), ['main', 'openpgp', 'ssh', 'x509']);
  for (const [kind, sha] of repo.signed) {
    const [commit] = await local.log(id, sha, null, 1);
    assert.equal(commit.sha, sha);
    assert.equal(commit.message, `firmado con ${kind}`);
    assert.ok(!existsSync(repo.mark), `log corrió el programa de la configuración del repo (firma ${kind})`);
  }
});

test('aunque se pida verificar la firma, el programa que corre no es el del repo', async () => {
  const repo = trapRepo('verificar');
  await local.allow(repo.dir);
  for (const [kind, sha] of repo.signed) {
    assert.equal((await local.git(repo.dir, ['log', '--show-signature', '-1', '--format=%H', sha])).trim(), sha);
    assert.ok(!existsSync(repo.mark), `--show-signature corrió el programa del repo (firma ${kind})`);
  }
});

test('un remoto «promisor» del repo no trae lo que falta corriendo su programa, aunque el repo permita ext::', async () => {
  const repo = makeRepo(join(base, 'promisor'));
  git(repo.dir, ['config', 'extensions.partialClone', 'origin']);
  git(repo.dir, ['config', 'remote.origin.promisor', 'true']);
  git(repo.dir, ['config', 'remote.origin.url', `ext::${repo.evil}`]);
  git(repo.dir, ['config', 'protocol.ext.allow', 'always']); // gana sobre un -c protocol.allow=never
  writeFileSync(join(repo.dir, '.git', 'refs', 'heads', 'fantasma'), `${'1'.repeat(40)}\n`); // una rama a un commit que falta
  quiet(repo.dir, ['-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', 'for-each-ref', '--format=%(committerdate:unix)', 'refs/heads']);
  assert.ok(existsSync(repo.mark), 'git solo no fue a buscar el commit que falta: la trampa no sirve');
  rmSync(repo.mark);
  const { id } = await local.allow(repo.dir);
  await local.branches(id).catch(() => {});
  await local.log(id, '1'.repeat(40), null, 1).catch(() => {});
  assert.ok(!existsSync(repo.mark), 'abrir el repo corrió el programa de su remoto');
});

test('lee el safe.directory de la configuración del usuario, y no la de un repo, aunque deje de leer el resto', async () => {
  const theirs = makeRepo(ajena);
  const other = makeRepo(join(base, 'otra'));
  git(other.dir, ['config', 'safe.directory', other.dir]); // en el repo no vale: git solo lo lee del usuario
  process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER = '1'; // como si las dos carpetas fueran de otro dueño
  try {
    assert.equal((await local.allow(theirs.dir)).name, 'ajena');
    await assert.rejects(local.allow(other.dir), /dubious ownership/);
  } finally {
    delete process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER;
  }
});
