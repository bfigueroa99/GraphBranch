/* Repositorios locales (la fuente LocalGitSource de js/sources/local.js): lee ramas y commits de una
   carpeta con `git`, desde el proceso principal. Sin shell: cada llamada es execFile con una lista de
   argumentos, y lo único que viene de la página (un commit) se comprueba antes de usarse.

   La página nunca pasa rutas. Solo conoce el id de una carpeta que el usuario eligió en el diálogo del
   sistema (o que pidió al abrir la app con --local=): `allow` la anota y la recuerda en un archivo de
   la carpeta de datos, y todo lo demás trabaja sobre ese id. */
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SHA = /^[0-9a-f]{40,64}$/;
const MAX_BUFFER = 64 * 1024 * 1024;
const TIMEOUT = 20000;
const US = '\x1f';
const RS = '\x1e';

/** Carpetas permitidas: id -> ruta absoluta de la raíz del repo. */
const repos = new Map();
let store = null; // archivo donde se recuerdan

/* Una ruta donde nunca puede haber nada: debajo del ejecutable de la app (un archivo no tiene hijos).
   Hace de programa que no corre, de carpeta de ganchos vacía y de configuración global que no existe,
   igual en todos los sistemas: en Windows, /bin/false y /dev/null serían C:\bin\false y C:\dev\null,
   que cualquier usuario puede crear. */
const NOWHERE = path.join(process.execPath, 'ninguna-parte');

/* La configuración del repo la escribe quien escribe en el repo (otra persona, un agente), y git la lee
   aunque solo se pidan ramas y commits. Lo que en ella hace correr un programa se pisa aquí: la línea de
   comandos manda sobre el repo y sus include. */
const OVERRIDES = [
  'core.fsmonitor=false',
  'core.quotepath=off',
  `core.hooksPath=${NOWHERE}`,
  // con log.showSignature, `git log` verifica cada commit firmado con el programa que diga el repo
  'log.showSignature=false',
  `gpg.program=${NOWHERE}`,
  `gpg.openpgp.program=${NOWHERE}`,
  `gpg.ssh.program=${NOWHERE}`,
  `gpg.x509.program=${NOWHERE}`,
  'credential.helper=',
].flatMap((kv) => ['-c', kv]);

const ENV = {
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
  LC_ALL: 'C',
  // ni la configuración del sistema ni la global: solo la del repo, con lo de arriba encima
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: NOWHERE,
  // sin red: un remoto «promisor» del repo iría a buscar el objeto que falta corriendo su programa (ext::,
  // uploadpack). -c protocol.allow=never no basta, porque el repo puede poner protocol.ext.allow=always;
  // esta lista manda sobre toda configuración y '-' no es el nombre de ningún protocolo.
  GIT_ALLOW_PROTOCOL: '-',
  GIT_NO_LAZY_FETCH: '1',
};

/* safe.directory: las carpetas de otro dueño que el usuario ya aceptó (en WSL, un disco externo…). Git
   solo lo toma de la configuración del sistema, la global o la línea de comandos, y las dos primeras ya no
   se leen: se leen una vez (esos archivos, no los de un repo) y se pasan con -c. */
let trusted = null;
function trustedDirs() {
  const read = (scope) =>
    new Promise((resolve) => {
      const args = ['config', scope, '--includes', '-z', '--get-all', 'safe.directory'];
      execFile('git', args, { cwd: os.homedir(), timeout: TIMEOUT, windowsHide: true }, (err, out) => resolve(err ? [] : String(out).split('\0').slice(0, -1)));
    });
  trusted ??= Promise.all([read('--system'), read('--global')]).then((lists) => lists.flat().flatMap((dir) => ['-c', `safe.directory=${dir}`]));
  return trusted;
}

/** Corre git en `dir`. Nada de lo que hay en el repo se ejecuta (ver OVERRIDES y ENV), sin bloqueos opcionales ni preguntas. */
async function git(dir, args) {
  const opts = {
    cwd: dir,
    maxBuffer: MAX_BUFFER,
    timeout: TIMEOUT,
    windowsHide: true,
    env: { ...process.env, ...ENV },
  };
  const trust = await trustedDirs();
  return new Promise((resolve, reject) => {
    execFile('git', [...OVERRIDES, ...trust, ...args], opts, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      if (err.code === 'ENOENT') return reject(Object.assign(new Error('git no está instalado'), { kind: 'nogit' }));
      reject(Object.assign(new Error(String(stderr || err.message).trim().split('\n')[0]), { kind: 'git', code: err.code }));
    });
  });
}

const idOf = (dir) => crypto.createHash('sha1').update(dir).digest('hex').slice(0, 12);

function save() {
  if (!store) return;
  try {
    fs.mkdirSync(path.dirname(store), { recursive: true });
    fs.writeFileSync(store, JSON.stringify([...repos.values()]));
  } catch {
    /* sin disco: la carpeta vale hasta cerrar la app */
  }
}

/** Dónde se recuerdan las carpetas elegidas (en la carpeta de datos de la app); las recupera. */
function init(file) {
  store = file;
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(list)) for (const dir of list) if (typeof dir === 'string' && path.isAbsolute(dir)) repos.set(idOf(dir), dir);
  } catch {
    /* primera vez, o el archivo no se entiende: se empieza sin carpetas */
  }
}

/** Anota la carpeta `dir` si es un repositorio git → { id, name } (la raíz del repo, aunque se haya elegido una subcarpeta). */
async function allow(dir) {
  const root = (await git(path.resolve(String(dir)), ['rev-parse', '--show-toplevel'])).trim();
  if (!root) throw Object.assign(new Error('no es un repositorio'), { kind: 'notrepo' });
  const real = fs.realpathSync(path.resolve(root));
  const id = idOf(real);
  if (!repos.has(id)) {
    repos.set(id, real);
    save();
  }
  return { id, name: path.basename(real) };
}

function dirOf(id) {
  const dir = repos.get(String(id));
  if (!dir) throw Object.assign(new Error('carpeta desconocida'), { kind: 'unknown' });
  return dir;
}

/** Las ramas con su cabeza, la rama por defecto y el nombre de la carpeta. Las locales (refs/heads), también las que nunca
    se publicaron, y las remotas (refs/remotes: `origin/x`, lo último que trajo un fetch) que no tienen una local con su
    nombre: la que alguien publicó y aquí no está. Una remota con local (`origin/main` y `main`) no se dibuja aparte: manda
    la local. Sin `origin/HEAD` ni ninguna otra referencia simbólica. */
async function branches(id) {
  const dir = dirOf(id);
  const [refs, head, init, abs] = await Promise.all([
    git(dir, ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(committerdate:unix)%09%(symref)', 'refs/heads', 'refs/remotes']),
    git(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => ''),
    git(dir, ['config', '--get', 'init.defaultBranch']).catch(() => ''),
    git(dir, ['rev-parse', '--absolute-git-dir']),
  ]);
  const locals = [];
  const remotes = [];
  for (const line of refs.split('\n')) {
    const [ref, sha, date, symref] = line.split('\t');
    if (!ref || symref) continue;
    const b = { name: '', sha, date: Number(date) * 1000 || 0 };
    if (ref.startsWith('refs/heads/')) locals.push({ ...b, name: ref.slice('refs/heads/'.length) });
    else if (ref.startsWith('refs/remotes/')) remotes.push({ ...b, name: ref.slice('refs/remotes/'.length) });
  }
  const names = new Set(locals.map((b) => b.name));
  // `origin/feature/x` es la remota de `feature/x`: el nombre del remoto es lo que va antes de la primera barra
  const list = [...locals, ...remotes.filter((b) => b.name.includes('/') && !names.has(b.name.slice(b.name.indexOf('/') + 1)))];
  // la rama por defecto: a la que apunta origin/HEAD, si no la que tiene HEAD, si no main o master (siempre una local)
  const origin = (await git(dir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).catch(() => '')).trim().replace(/^origin\//, '');
  const defaultBranch = [origin, head.trim(), init.trim(), 'main', 'master'].find((n) => n && names.has(n)) || list[0]?.name || null;
  return { name: path.basename(dir), gitDir: abs.trim(), defaultBranch, branches: list };
}

/** Hasta `n` commits de `sha` hacia atrás, sin los que ya alcanza `exclude` (otra cabeza), los más nuevos primero. */
async function log(id, sha, exclude, n) {
  const dir = dirOf(id);
  if (!SHA.test(sha) || (exclude != null && !SHA.test(exclude))) throw new Error('commit inválido');
  const count = Math.max(1, Math.min(2000, Math.floor(Number(n)) || 100));
  const args = ['log', `--max-count=${count}`, `--format=%H${US}%P${US}%an${US}%ae${US}%ct${US}%B${RS}`, sha];
  if (exclude) args.push('--not', exclude);
  const out = await git(dir, args);
  return out
    .split(RS)
    .map((rec) => rec.replace(/^\n/, ''))
    .filter(Boolean)
    .map((rec) => {
      const [hash, parents, name, email, time, message] = rec.split(US);
      return { sha: hash, parents: parents ? parents.split(' ') : [], name, email, date: Number(time) * 1000, message: (message || '').trim() };
    });
}

/** ¿`a` es ancestro de `b`? Sirve para distinguir un push de un force-push. false si `a` ya no existe. */
async function isAncestor(id, a, b) {
  const dir = dirOf(id);
  if (!SHA.test(a) || !SHA.test(b)) throw new Error('commit inválido');
  try {
    await git(dir, ['merge-base', '--is-ancestor', a, b]);
    return true;
  } catch (err) {
    if (err.kind === 'nogit') throw err;
    return false;
  }
}

/** Los archivos de una cabeza (su árbol, con tamaños) o, con `base`, lo que cambió desde donde se separó de esa otra cabeza. */
async function files(id, sha, base) {
  const dir = dirOf(id);
  if (!SHA.test(sha) || (base != null && !SHA.test(base))) throw new Error('commit inválido');
  const CAP = 2000;
  if (!base) {
    const out = await git(dir, ['ls-tree', '-r', '-l', '-z', sha]);
    const list = out.split('\0').filter(Boolean);
    const rows = [];
    for (const line of list.slice(0, CAP)) {
      const m = /^\d+ blob [0-9a-f]+ +(\d+|-)\t(.*)$/s.exec(line);
      if (m) rows.push({ path: m[2], size: m[1] === '-' ? 0 : Number(m[1]) });
    }
    return { kind: 'tree', files: rows, truncated: list.length > CAP };
  }
  const range = `${base}...${sha}`;
  const [names, nums] = await Promise.all([
    git(dir, ['diff', '--name-status', '-z', '--find-renames', range]).catch(() => ''),
    git(dir, ['diff', '--numstat', '-z', '--find-renames', range]).catch(() => ''),
  ]);
  // --numstat -z: «add\tdel\truta\0» y, en un renombre, «add\tdel\t\0antes\0después\0»
  const lines = new Map();
  const np = nums.split('\0');
  for (let i = 0; i < np.length; i++) {
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(np[i]);
    if (!m) continue;
    const row = { add: m[1] === '-' ? 0 : Number(m[1]), del: m[2] === '-' ? 0 : Number(m[2]) };
    if (m[3] === '') {
      lines.set(np[i + 2], row);
      i += 2;
    } else lines.set(m[3], row);
  }
  // --name-status -z: «M\0ruta\0», «R087\0antes\0después\0»
  const STATUS = { A: 'added', D: 'removed', M: 'modified', T: 'modified', R: 'renamed', C: 'added' };
  const rows = [];
  const ns = names.split('\0');
  for (let i = 0; i < ns.length && rows.length < 300; i++) {
    const code = ns[i][0];
    if (!STATUS[code]) continue;
    const renamed = code === 'R' || code === 'C';
    const file = renamed ? ns[i + 2] : ns[i + 1];
    rows.push({ path: file, from: code === 'R' ? ns[i + 1] : null, status: STATUS[code], ...(lines.get(file) || { add: 0, del: 0 }) });
    i += renamed ? 2 : 1;
  }
  return { kind: 'diff', files: rows, truncated: rows.length >= 300 };
}

/** Los cambios de un commit frente a su primer padre (el primero del repo, frente a nada), como texto de
    `git diff`, hasta DIFF_MAX: más largo se corta en el último archivo entero. Sin diff ni textconv
    externos: la configuración del repo no puede hacer correr nada. */
const DIFF_MAX = 4 * 1024 * 1024;
async function diff(id, sha) {
  const dir = dirOf(id);
  if (!SHA.test(sha)) throw new Error('commit inválido');
  const parent = (await git(dir, ['rev-list', '--parents', '-n', '1', sha])).trim().split(' ')[1];
  const args = ['diff-tree', '-p', '-r', '--find-renames', '--no-color', '--no-ext-diff', '--no-textconv'];
  let text = await git(dir, [...args, ...(parent && SHA.test(parent) ? [parent, sha] : ['--root', sha])]);
  let truncated = false;
  if (text.length > DIFF_MAX) {
    const cut = text.lastIndexOf('\ndiff --git ', DIFF_MAX);
    text = text.slice(0, cut > 0 ? cut + 1 : DIFF_MAX);
    truncated = true;
  }
  return { text, truncated };
}

/**
 * Avisa con `onChange(id)` cuando algo se mueve en las ramas del repo: .git/refs (commits, ramas
 * nuevas y borradas), packed-refs y HEAD. Junta los avisos en uno (una operación de git toca varios
 * archivos). Devuelve la función que deja de vigilar.
 */
function watch(id, onChange) {
  const dir = dirOf(id);
  let timer = null;
  const watchers = [];
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(id), 120);
  };
  git(dir, ['rev-parse', '--absolute-git-dir'])
    .then((abs) => {
      const gitDir = abs.trim();
      const add = (target, opts, filter) => {
        try {
          const w = fs.watch(target, opts, (ev, name) => (!filter || filter.has(String(name))) && fire());
          w.on('error', () => {});
          watchers.push(w);
        } catch {
          /* no se puede vigilar (carpeta ausente, sin inotify): queda el sondeo de la fuente */
        }
      };
      add(path.join(gitDir, 'refs'), { recursive: true });
      add(gitDir, {}, new Set(['HEAD', 'packed-refs']));
    })
    .catch(() => {});
  return () => {
    clearTimeout(timer);
    for (const w of watchers) w.close();
  };
}

module.exports = { init, allow, branches, log, isAncestor, files, diff, watch, repos, git };
