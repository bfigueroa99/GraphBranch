/* GraphBranch — intérprete de git de práctica. Un repo en memoria y los comandos de todos los días
   (commit, branch, checkout/switch, merge, rebase, reset, log, status), más los ejercicios guiados.
   Sin DOM ni red: lo usa la fuente de práctica (sources/practice.js) y lo prueba tools/gitsim.test.mjs.
   La salida de los comandos es la de git (en inglés, como en cualquier terminal); los textos de la
   interfaz van en los idiomas de la app. */
(function (GB) {
  'use strict';

  const AUTHOR = { name: 'You', login: 'you', avatar: null };
  const MINUTE = 60e3;

  /** Hash determinista de 40 hex: la misma historia da los mismos shas (las pruebas y los ejercicios lo necesitan). */
  function hash(text) {
    let out = '';
    let h = 0x811c9dc5;
    for (let round = 0; out.length < 40; round++) {
      for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
      h = Math.imul(h ^ round, 0x85ebca6b) >>> 0;
      out += h.toString(16).padStart(8, '0');
    }
    return out.slice(0, 40);
  }

  /** Separa una línea en palabras, con comillas simples o dobles. */
  function tokenize(line) {
    const out = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
    return out;
  }

  class GitError extends Error {}
  const fail = (msg) => {
    throw new GitError(msg);
  };

  class Repo {
    /** `now`: el instante del primer commit; cada commit nuevo cae un rato después. */
    constructor({ now = Date.now(), branch = 'main' } = {}) {
      this.clock = now;
      this.seq = 0;
      this.commits = new Map();
      this.branches = new Map(); // nombre -> sha
      this.head = { branch }; // { branch } o { sha } (desprendido)
      this.defaultBranch = branch;
      this.branches.set(branch, null);
    }

    /* ---------- lectura ---------- */

    get headSha() {
      return this.head.branch ? this.branches.get(this.head.branch) : this.head.sha;
    }

    short(sha) {
      return sha.slice(0, 7);
    }

    /** Todos los commits alcanzables desde `sha` (incluido él). */
    ancestors(sha) {
      const seen = new Set();
      const stack = sha ? [sha] : [];
      while (stack.length) {
        const s = stack.pop();
        if (seen.has(s)) continue;
        seen.add(s);
        stack.push(...this.commits.get(s).parents);
      }
      return seen;
    }

    isAncestor(a, b) {
      return this.ancestors(b).has(a);
    }

    /** Qué commit nombra `ref`: HEAD, rama, sha (o su principio), con ~n y ^ detrás. Nulo si no existe. */
    resolve(ref) {
      const m = /^(.*?)((?:[~^]\d*)*)$/.exec(ref);
      let base = m[1];
      let sha;
      if (base === 'HEAD' || base === '@') sha = this.headSha;
      else if (this.branches.has(base)) sha = this.branches.get(base);
      else if (/^[0-9a-f]{4,40}$/i.test(base)) {
        const hits = [...this.commits.keys()].filter((s) => s.startsWith(base.toLowerCase()));
        if (hits.length !== 1) return null;
        sha = hits[0];
      } else return null;
      if (sha == null) return null;
      for (const [, op, n] of m[2].matchAll(/([~^])(\d*)/g)) {
        const steps = n === '' ? 1 : Number(n);
        if (op === '~') {
          for (let i = 0; i < steps; i++) {
            sha = this.commits.get(sha).parents[0];
            if (!sha) return null;
          }
        } else {
          sha = this.commits.get(sha).parents[steps - 1];
          if (!sha) return null;
        }
      }
      return sha;
    }

    /** Commits de la historia de `sha`, del más nuevo al más viejo (los padres siempre después del hijo). */
    log(sha) {
      const set = this.ancestors(sha);
      const out = [];
      const children = new Map([...set].map((s) => [s, 0]));
      for (const s of set) for (const p of this.commits.get(s).parents) children.set(p, children.get(p) + 1);
      const ready = [...set].filter((s) => children.get(s) === 0);
      while (ready.length) {
        ready.sort((a, b) => this.commits.get(a).date - this.commits.get(b).date || (a < b ? -1 : 1));
        const s = ready.pop();
        out.push(s);
        for (const p of this.commits.get(s).parents) {
          children.set(p, children.get(p) - 1);
          if (children.get(p) === 0) ready.push(p);
        }
      }
      return out;
    }

    /** Dónde apuntan las ramas y HEAD: «HEAD -> main, feature». */
    decorations(sha) {
      const names = [...this.branches].filter(([, s]) => s === sha).map(([n]) => n);
      const head = this.head.branch ? this.branches.get(this.head.branch) === sha : this.head.sha === sha;
      const list = names.map((n) => (head && this.head.branch === n ? `HEAD -> ${n}` : n));
      if (head && !this.head.branch) list.unshift('HEAD');
      return list.length ? ` (${list.join(', ')})` : '';
    }

    /* ---------- escritura ---------- */

    /** Un commit nuevo con esos padres (no mueve ninguna rama). */
    make(message, parents) {
      this.clock += (7 + (this.seq % 5)) * MINUTE;
      const sha = hash(`${parents.join(',')}|${message}|${this.seq++}`);
      this.commits.set(sha, { sha, parents, message, author: AUTHOR, date: this.clock, url: null });
      return sha;
    }

    /** Mueve la rama de HEAD (o HEAD, si está desprendido). */
    moveHead(sha) {
      if (this.head.branch) this.branches.set(this.head.branch, sha);
      else this.head = { sha };
    }

    commit(message) {
      const sha = this.make(message, this.headSha ? [this.headSha] : []);
      this.moveHead(sha);
      return sha;
    }

    /* ---------- los comandos ---------- */

    /** Corre una línea («git commit -m "x"» o «commit -m x»). Devuelve { ok, lines } y, si cambió el repo, changed. */
    run(line) {
      const words = tokenize(line.trim());
      if (words[0] === 'git') words.shift();
      if (!words.length) return { ok: true, lines: [], changed: false };
      const [cmd, ...args] = words;
      const before = JSON.stringify([[...this.branches], this.head, this.commits.size]);
      try {
        const handler = this.commands[cmd];
        if (!handler) fail(`git: '${cmd}' is not a git command. Try 'help'.`);
        const lines = handler.call(this, args) || [];
        const after = JSON.stringify([[...this.branches], this.head, this.commits.size]);
        return { ok: true, lines, changed: before !== after };
      } catch (e) {
        if (!(e instanceof GitError)) throw e;
        return { ok: false, lines: e.message.split('\n'), changed: false };
      }
    }
  }

  /** Separa banderas y argumentos: `flags` son las que llevan valor (-m). */
  function parse(args, withValue = []) {
    const flags = {};
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.length > 1 && a[0] === '-' && !/^-\d/.test(a)) {
        if (withValue.includes(a)) flags[a] = args[++i];
        else flags[a] = true;
      } else rest.push(a);
    }
    return { flags, rest };
  }

  const validName = (n) => /^[\w][\w./-]*$/.test(n) && !n.endsWith('/') && !n.includes('..') && !n.endsWith('.lock');

  Repo.prototype.commands = {
    help() {
      return [
        'commit -m "msg"             save a snapshot on the current branch',
        'branch [name] [-d name]     list, create or delete branches',
        'checkout [-b] <name|sha>    move to a branch or commit (also: switch [-c])',
        'merge <branch>              bring another branch into this one (--no-ff, --ff-only)',
        'rebase <branch>             replay this branch on top of another',
        'reset [--soft|--hard] <to>  move the branch back (HEAD~1, a sha, a branch)',
        'log [--oneline]             the history that leads to HEAD',
        'status                      where HEAD is',
      ];
    },

    commit(args) {
      const { flags } = parse(args, ['-m', '--message']);
      const msg = flags['-m'] ?? flags['--message'];
      if (!msg || msg === true) fail('Aborting commit due to empty commit message.\n(use: commit -m "message")');
      const sha = this.commit(msg);
      const where = this.head.branch || 'detached HEAD';
      return [`[${where} ${this.short(sha)}] ${msg}`];
    },

    status() {
      const where = this.head.branch ? `On branch ${this.head.branch}` : `HEAD detached at ${this.short(this.head.sha)}`;
      return [where, 'nothing to commit, working tree clean'];
    },

    log(args) {
      const { flags } = parse(args);
      const sha = this.headSha;
      if (!sha) fail('fatal: your current branch does not have any commits yet');
      const shas = this.log(sha);
      if (flags['--oneline'] || flags['--oneline'] === true) {
        return shas.map((s) => `${this.short(s)}${this.decorations(s)} ${this.commits.get(s).message}`);
      }
      return shas.flatMap((s) => {
        const c = this.commits.get(s);
        return [`commit ${s}${this.decorations(s)}`, `Author: ${c.author.name}`, '', `    ${c.message}`, ''];
      });
    },

    branch(args) {
      const { flags, rest } = parse(args);
      const del = flags['-d'] || flags['-D'] || flags['--delete'];
      if (del) {
        if (!rest.length) fail('fatal: branch name required');
        const out = [];
        for (const name of rest) {
          if (!this.branches.has(name)) fail(`error: branch '${name}' not found.`);
          if (this.head.branch === name) fail(`error: cannot delete branch '${name}' used by worktree`);
          const tip = this.branches.get(name);
          if (!flags['-D'] && !this.isAncestor(tip, this.headSha)) {
            fail(`error: the branch '${name}' is not fully merged.\nIf you are sure you want to delete it, run 'branch -D ${name}'.`);
          }
          this.branches.delete(name);
          out.push(`Deleted branch ${name} (was ${this.short(tip)}).`);
        }
        return out;
      }
      if (!rest.length) {
        return [...this.branches.keys()].sort().map((n) => `${this.head.branch === n ? '*' : ' '} ${n}`);
      }
      const [name, start] = rest;
      if (!validName(name)) fail(`fatal: '${name}' is not a valid branch name`);
      if (this.branches.has(name)) fail(`fatal: a branch named '${name}' already exists`);
      const from = start ? this.resolve(start) : this.headSha;
      if (!from) fail(start ? `fatal: not a valid object name: '${start}'` : 'fatal: not a valid object name: the current branch has no commits');
      this.branches.set(name, from);
      return [];
    },

    checkout(args) {
      const { flags, rest } = parse(args);
      const create = flags['-b'] || flags['-c'];
      if (create) {
        const [name, start] = rest;
        if (!name) fail('fatal: missing branch name');
        this.commands.branch.call(this, start ? [name, start] : [name]);
        this.head = { branch: name };
        return [`Switched to a new branch '${name}'`];
      }
      const [target] = rest;
      if (!target) fail('fatal: missing branch or commit argument');
      if (this.branches.has(target)) {
        if (this.head.branch === target) return [`Already on '${target}'`];
        this.head = { branch: target };
        return [`Switched to branch '${target}'`];
      }
      const sha = this.resolve(target);
      if (!sha) fail(`error: pathspec '${target}' did not match any branch or commit known to git`);
      this.head = { sha };
      return [`HEAD is now at ${this.short(sha)} ${this.commits.get(sha).message}`];
    },

    merge(args) {
      const { flags, rest } = parse(args);
      const [name] = rest;
      if (!name) fail('fatal: no branch to merge was given');
      if (!this.head.branch) fail('fatal: you are in a detached HEAD state: go to a branch first (checkout <branch>)');
      const theirs = this.resolve(name);
      if (!theirs) fail(`merge: ${name} - not something we can merge`);
      const ours = this.headSha;
      if (this.isAncestor(theirs, ours)) return ['Already up to date.'];
      if (this.isAncestor(ours, theirs) && !flags['--no-ff']) {
        this.moveHead(theirs);
        return [`Updating ${this.short(ours)}..${this.short(theirs)}`, 'Fast-forward'];
      }
      if (flags['--ff-only']) fail('fatal: Not possible to fast-forward, aborting.');
      const sha = this.make(`Merge branch '${name}'`, [ours, theirs]);
      this.moveHead(sha);
      return ["Merge made by the 'ort' strategy."];
    },

    rebase(args) {
      const { rest } = parse(args);
      const [name] = rest;
      if (!name) fail('fatal: no upstream given (rebase <branch>)');
      if (!this.head.branch) fail('fatal: you are in a detached HEAD state: go to a branch first (checkout <branch>)');
      const onto = this.resolve(name);
      if (!onto) fail(`fatal: invalid upstream '${name}'`);
      const tip = this.headSha;
      if (this.isAncestor(onto, tip)) return [`Current branch ${this.head.branch} is up to date.`];
      if (this.isAncestor(tip, onto)) {
        this.moveHead(onto);
        return [`Successfully rebased and updated refs/heads/${this.head.branch}.`];
      }
      // los commits propios (sin los fusiones, que git descarta al rebasar), del más viejo al más nuevo
      const theirs = this.ancestors(onto);
      const own = this.log(tip)
        .filter((s) => !theirs.has(s) && this.commits.get(s).parents.length < 2)
        .reverse();
      let base = onto;
      for (const s of own) base = this.make(this.commits.get(s).message, [base]);
      this.moveHead(base);
      return [`Successfully rebased and updated refs/heads/${this.head.branch}.`];
    },

    reset(args) {
      const { flags, rest } = parse(args);
      const to = rest[0] || 'HEAD';
      const sha = this.resolve(to);
      if (!sha) fail(`fatal: ambiguous argument '${to}': unknown revision`);
      this.moveHead(sha);
      if (flags['--hard']) return [`HEAD is now at ${this.short(sha)} ${this.commits.get(sha).message}`];
      return [];
    },
  };
  Repo.prototype.commands.switch = function (args) {
    return Repo.prototype.commands.checkout.call(this, args.map((a) => (a === '-c' || a === '--create' ? '-b' : a)));
  };

  /* ---------- ejercicios ---------- */

  const BASE = ['Initial commit', 'Add README', 'Add login form'];

  /** Un repo con la historia de partida: main con sus commits, y lo que pida cada ejercicio. */
  function scenario(build, now) {
    const r = new Repo({ now: now ?? Date.now() - 6 * 36e5 });
    for (const m of BASE) r.commit(m);
    build?.(r);
    return r;
  }

  /** Cada ejercicio: cómo parte el repo y cuándo está resuelto. Sus textos son `practice.exN.title` y `.goal`. */
  const EXERCISES = [
    {
      id: 'branch',
      setup: () => {},
      done: (r) => {
        const tip = r.branches.get('feature');
        if (!tip) return false;
        const main = r.ancestors(r.branches.get('main'));
        return r.log(tip).filter((s) => !main.has(s)).length >= 2;
      },
    },
    {
      id: 'merge',
      setup: diverge,
      done: (r) => {
        const feature = r.branches.get('feature');
        const main = r.branches.get('main');
        return !!feature && r.commits.get(main).parents.length === 2 && r.isAncestor(feature, main);
      },
    },
    {
      id: 'rebase',
      setup: diverge,
      done: (r) => {
        const feature = r.branches.get('feature');
        const main = r.branches.get('main');
        if (!feature || !r.isAncestor(main, feature) || feature === main) return false;
        // lineal: sus dos commits cuelgan uno del otro, sin fusiones
        const own = r.log(feature).filter((s) => !r.ancestors(main).has(s));
        return own.length === 2 && own.every((s) => r.commits.get(s).parents.length === 1) && r.log(main).length === BASE.length + 1;
      },
    },
    {
      id: 'reset',
      setup: (r) => {
        r.commit('Oops: debug logging left in');
      },
      done: (r) => {
        const main = r.branches.get('main');
        return !!main && r.log(main).length === BASE.length && !r.log(main).some((s) => /^Oops/.test(r.commits.get(s).message));
      },
    },
  ];

  /** main avanzó un commit mientras feature llevaba dos: las ramas divergieron. */
  function diverge(r) {
    r.commands.checkout.call(r, ['-b', 'feature']);
    r.commit('Add profile page');
    r.commit('Add profile avatar');
    r.commands.checkout.call(r, ['main']);
    r.commit('Fix login redirect');
  }

  GB.gitsim = {
    Repo,
    EXERCISES,
    hash,
    tokenize,
    /** El repo de partida de un ejercicio (índice de 0 a EXERCISES.length - 1). */
    start(index, now) {
      return scenario(EXERCISES[index].setup, now);
    },
  };
})(window.GB);
