/* Repositorios locales (la fuente LocalGitSource de js/sources/local.js): lee ramas y commits de una
   carpeta con `git`, desde el proceso principal. Sin shell: cada llamada es execFile con una lista de
   argumentos, y lo único que viene de la página (un commit) se comprueba antes de usarse.

   La página nunca pasa rutas. Solo conoce el id de una carpeta que el usuario eligió en el diálogo del
   sistema (o que pidió al abrir la app con --local=): `allow` la anota y la recuerda en un archivo de
   la carpeta de datos, y todo lo demás trabaja sobre ese id. */
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SHA = /^[0-9a-f]{40,64}$/;
const MAX_BUFFER = 64 * 1024 * 1024;
const TIMEOUT = 20000;
const US = '\x1f';
const RS = '\x1e';

/** Carpetas permitidas: id -> ruta absoluta de la raíz del repo. */
const repos = new Map();
let store = null; // archivo donde se recuerdan

/** Corre git en `dir`. Nada de lo que hay en el repo se ejecuta: sin fsmonitor, sin bloqueos opcionales ni preguntas. */
function git(dir, args) {
  const opts = {
    cwd: dir,
    maxBuffer: MAX_BUFFER,
    timeout: TIMEOUT,
    windowsHide: true,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
  };
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.fsmonitor=false', '-c', 'core.quotepath=off', ...args], opts, (err, stdout, stderr) => {
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

/** Las ramas locales con su cabeza, la rama por defecto y el nombre de la carpeta. */
async function branches(id) {
  const dir = dirOf(id);
  const [refs, head, init, abs] = await Promise.all([
    git(dir, ['for-each-ref', '--format=%(refname:short)%09%(objectname)%09%(committerdate:unix)', 'refs/heads']),
    git(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => ''),
    git(dir, ['config', '--get', 'init.defaultBranch']).catch(() => ''),
    git(dir, ['rev-parse', '--absolute-git-dir']),
  ]);
  const list = refs
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, sha, date] = line.split('\t');
      return { name, sha, date: Number(date) * 1000 || 0 };
    });
  // la rama por defecto: a la que apunta origin/HEAD, si no la que tiene HEAD, si no main o master
  const origin = (await git(dir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).catch(() => '')).trim().replace(/^origin\//, '');
  const names = new Set(list.map((b) => b.name));
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

module.exports = { init, allow, branches, log, isAncestor, files, watch, repos };
