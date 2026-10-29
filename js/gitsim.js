/* GraphBranch — intérprete de git de práctica. Un repo en memoria y los comandos de todos los días
   (commit, branch, checkout/switch, merge, rebase, reset, stash, log, status), más los ejercicios guiados.
   El árbol de trabajo es solo la lista de archivos con cambios sin commit (`touch` los crea).
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
      this.tags = new Map(); // nombre -> sha
      this.head = { branch }; // { branch } o { sha } (desprendido)
      this.work = []; // archivos con cambios sin commit, en orden de llegada
      this.stashes = []; // { files, branch, sha }, el más nuevo primero (stash@{0})
      this.merging = null; // { name, theirs } mientras una fusión (merge --no-commit) espera su commit
      this.aborts = 0; // cuántas fusiones se cancelaron con merge --abort
      this.picking = null; // { sha } mientras un cherry-pick --no-commit espera su commit
      this.pickAborts = 0; // cuántos cherry-pick se cancelaron con cherry-pick --abort
      this.revertAborts = 0; // cuántos revert --no-commit se cancelaron con revert --abort
      this.rebasing = null; // { orig, branch, base, rest } mientras un rebase -i espera su --continue
      this.rebaseAborts = 0; // cuántos rebase se cancelaron con rebase --abort
      this.reflog = []; // { sha, msg }, el más nuevo al final (HEAD@{0}); cada vez que HEAD se mueve
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
      const log = /^(?:HEAD|@)@\{(\d+)\}$/.exec(base);
      if (log) {
        const i = this.reflog.length - 1 - Number(log[1]);
        if (!this.reflog.length && log[1] === '0') sha = this.headSha;
        else if (i >= 0) sha = this.reflog[i].sha;
        else return null;
      } else if (base === 'HEAD' || base === '@') sha = this.headSha;
      else if (this.branches.has(base)) sha = this.branches.get(base);
      else if (this.tags.has(base)) sha = this.tags.get(base);
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

    /** Dónde apuntan las ramas, las etiquetas y HEAD: «HEAD -> main, tag: v1, feature». */
    decorations(sha) {
      const names = [...this.branches].filter(([, s]) => s === sha).map(([n]) => n);
      const head = this.head.branch ? this.branches.get(this.head.branch) === sha : this.head.sha === sha;
      const list = names.map((n) => (head && this.head.branch === n ? `HEAD -> ${n}` : n));
      for (const [n, s] of this.tags) if (s === sha) list.push(`tag: ${n}`);
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
      this.work = [];
      return sha;
    }

    /** Lo que git anota en el reflog de HEAD por ese comando. */
    reflogMessage(cmd, args, from) {
      const { flags, rest } = parse(args, ['-m']);
      if (cmd === 'commit') return `commit: ${flags['-m'] ?? this.commits.get(this.headSha).message}`;
      if (cmd === 'checkout' || cmd === 'switch') return `checkout: moving from ${from} to ${this.head.branch ?? this.short(this.headSha)}`;
      if (cmd === 'reset') return `reset: moving to ${rest[0] || 'HEAD'}`;
      return `${cmd}${args.length ? ` ${args.join(' ')}` : ''}`;
    }

    /** Falla como git si hay cambios sin commit: en esta simulación, ir a otro commit siempre pisa los archivos cambiados. */
    needClean(verb) {
      if (this.picking) fail(`error: You have not concluded your ${this.picking.revert ? 'revert' : 'cherry-pick'} (${this.picking.revert ? 'REVERT_HEAD' : 'CHERRY_PICK_HEAD'} exists).\nPlease, commit your changes or use '${this.picking.revert ? 'revert' : 'cherry-pick'} --abort' before you ${verb === 'checkout' ? 'switch branches' : verb}.`);
      if (!this.work.length) return;
      fail(`error: Your local changes to the following files would be overwritten by ${verb}:\n${this.work.map((f) => `\t${f}`).join('\n')}\nPlease commit your changes or stash them before you ${verb === 'checkout' ? 'switch branches' : verb}.\nAborting`);
    }

    /* ---------- los comandos ---------- */

    /** Corre una línea («git commit -m "x"» o «commit -m x»). Devuelve { ok, lines } y, si cambió el repo, changed. */
    run(line) {
      const words = tokenize(line.trim());
      if (words[0] === 'git') words.shift();
      if (!words.length) return { ok: true, lines: [], changed: false };
      const [cmd, ...args] = words;
      const headBefore = this.head.branch ?? null;
      const shaBefore = this.headSha;
      // la primera línea del reflog es de dónde partió HEAD
      if (!this.reflog.length && shaBefore) this.reflog.push({ sha: shaBefore, msg: `commit: ${this.commits.get(shaBefore).message}` });
      const before = JSON.stringify([[...this.branches], [...this.tags], this.head, this.commits.size, this.merging, this.aborts, this.picking, this.pickAborts, this.revertAborts, this.rebasing, this.rebaseAborts]);
      try {
        const handler = this.commands[cmd];
        if (!handler) fail(`git: '${cmd}' is not a git command. Try 'help'.`);
        if (this.rebasing && REBASE_BLOCKED.has(cmd) && !(cmd === 'rebase' && (args.includes('--abort') || args.includes('--continue')))) {
          fail(`fatal: It seems that there is already a rebase-merge directory (a rebase is in progress).\nUse 'rebase --continue' to finish it or 'rebase --abort' to cancel it before you ${cmd}.`);
        }
        const lines = handler.call(this, args) || [];
        if (cmd !== 'reflog' && this.headSha && (this.headSha !== shaBefore || (this.head.branch ?? null) !== headBefore)) {
          this.reflog.push({ sha: this.headSha, msg: this.reflogMessage(cmd, args, headBefore ?? this.short(shaBefore ?? '')) });
          if (this.reflog.length > 100) this.reflog.shift();
        }
        const after = JSON.stringify([[...this.branches], [...this.tags], this.head, this.commits.size, this.merging, this.aborts, this.picking, this.pickAborts, this.revertAborts, this.rebasing, this.rebaseAborts]);
        return { ok: true, lines, changed: before !== after };
      } catch (e) {
        if (!(e instanceof GitError)) throw e;
        return { ok: false, lines: e.message.split('\n'), changed: false };
      }
    }
  }

  /** Lo que se niega con un rebase a medias (git exige terminarlo o cancelarlo antes). */
  const REBASE_BLOCKED = new Set(['checkout', 'switch', 'merge', 'rebase', 'reset', 'cherry-pick', 'revert', 'stash']);

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
        'checkout [-b] <name|sha>    move to a branch or commit (also: switch [-c|--detach])',
        'restore <file|.>            throw away the uncommitted changes of a file (see touch)',
        'merge <branch>              bring another branch into this one (--no-ff, --ff-only, --no-commit)',
        'merge --abort              cancel a merge that is waiting for its commit',
        'rebase [-i] <branch>        replay this branch on top of another (-i stops after the first commit)',
        'rebase --abort|--continue  cancel a stopped rebase, or replay the rest of it',
        'reset [--soft|--mixed|--hard] <to>  move the branch back (HEAD~1, a sha, HEAD@{1}); --hard drops changes',
        'reflog                      where HEAD has been (HEAD@{n}): find a commit again after a reset --hard',
        'stash [list|pop|apply|drop] put uncommitted changes aside and bring them back',
        'touch <file>                change a file (uncommitted work, for stash)',
        'cherry-pick <commit>        copy one commit on top of the current branch (-n holds it until commit or --continue)',
        'cherry-pick --abort        cancel a cherry-pick that is waiting for its commit',
        'revert <commit>             undo a commit with a new one, keeping the history (-n holds it until commit or --continue)',
        'revert --abort             cancel a revert that is waiting for its commit',
        'tag [name] [-d name]        list, create or delete tags on a commit',
        'log [--oneline]             the history that leads to HEAD',
        'status                      where HEAD is',
      ];
    },

    commit(args) {
      const { flags } = parse(args, ['-m', '--message']);
      const msg = flags['-m'] ?? flags['--message'];
      if (!msg || msg === true) fail('Aborting commit due to empty commit message.\n(use: commit -m "message")');
      if (this.merging) {
        const { theirs } = this.merging;
        const merged = this.make(msg, [this.headSha, theirs]);
        this.moveHead(merged);
        this.work = [];
        this.merging = null;
        return [`[${this.head.branch} ${this.short(merged)}] ${msg}`];
      }
      if (this.picking) this.picking = null;
      const sha = this.commit(msg);
      const where = this.head.branch || 'detached HEAD';
      return [`[${where} ${this.short(sha)}] ${msg}`];
    },

    status() {
      const where = this.head.branch ? `On branch ${this.head.branch}` : `HEAD detached at ${this.short(this.head.sha)}`;
      if (this.merging) return [where, 'All conflicts fixed but you are still merging.', '  (use "git commit" to conclude merge)', '  (use "git merge --abort" to cancel it)'];
      if (this.rebasing) return [where, `interactive rebase in progress; onto ${this.short(this.rebasing.onto)}`, `Last command done (1 command done), ${this.rebasing.rest.length} remaining.`, '  (use "git rebase --continue" to replay the rest)', '  (use "git rebase --abort" to check out the original branch)'];
      if (this.picking) {
        const verb = this.picking.revert ? 'revert' : 'cherry-pick';
        return [where, `You are currently ${this.picking.revert ? 'reverting' : 'cherry-picking'} commit ${this.short(this.picking.sha)}.`, `  (use "git ${verb} --continue" to commit it)`, `  (use "git ${verb} --abort" to cancel the ${verb} operation)`];
      }
      if (!this.work.length) return [where, 'nothing to commit, working tree clean'];
      return [where, 'Changes not staged for commit:', ...this.work.map((f) => `\tmodified:   ${f}`)];
    },

    touch(args) {
      const { rest } = parse(args);
      if (!rest.length) fail('usage: touch <file>');
      for (const f of rest) {
        if (!/^[\w][\w./-]{0,60}$/.test(f) || f.includes('..')) fail(`touch: invalid file name '${f}'`);
        if (!this.work.includes(f)) this.work.push(f);
      }
      return [];
    },

    stash(args) {
      const { flags, rest } = parse(args, ['-m', '--message']);
      const [sub = 'push', ref] = rest;
      const msg = flags['-m'] ?? flags['--message'];
      const pick = () => {
        if (!this.stashes.length) fail('error: No stash entries found.');
        const m = /^(?:stash@\{(\d+)\}|(\d+))$/.exec(ref ?? '0');
        const i = m ? Number(m[1] ?? m[2]) : -1;
        if (i < 0 || i >= this.stashes.length) fail(`error: ${ref} is not a valid reference`);
        return i;
      };
      if (sub === 'push' || sub === 'save') {
        if (!this.work.length) return ['No local changes to save'];
        if (!this.headSha) fail('You do not have the initial commit yet');
        const branch = this.head.branch || '(no branch)';
        const line = typeof msg === 'string' && msg ? `On ${branch}: ${msg}` : `WIP on ${branch}: ${this.short(this.headSha)} ${this.commits.get(this.headSha).message}`;
        this.stashes.unshift({ files: this.work, line });
        this.work = [];
        return [`Saved working directory and index state ${line}`];
      }
      if (sub === 'list') return this.stashes.map((s, i) => `stash@{${i}}: ${s.line}`);
      if (sub === 'drop') {
        const i = pick();
        const [gone] = this.stashes.splice(i, 1);
        return [`Dropped stash@{${i}} (${hash(gone.line)})`];
      }
      if (sub === 'pop' || sub === 'apply') {
        const i = pick();
        const entry = this.stashes[i];
        const clash = entry.files.filter((f) => this.work.includes(f));
        if (clash.length) fail(`error: Your local changes to the following files would be overwritten by merge:\n${clash.map((f) => `\t${f}`).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting`);
        this.work = [...this.work, ...entry.files];
        const out = this.commands.status.call(this);
        if (sub === 'pop') {
          this.stashes.splice(i, 1);
          out.push(`Dropped stash@{${i}} (${hash(entry.line)})`);
        }
        return out;
      }
      fail(`error: unknown subcommand: '${sub}'\nusage: stash [push | list | pop | apply | drop]`);
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
        if (this.branches.get(target) !== this.headSha) this.needClean('checkout');
        this.head = { branch: target };
        return [`Switched to branch '${target}'`];
      }
      const sha = this.resolve(target);
      if (!sha) fail(`error: pathspec '${target}' did not match any branch or commit known to git`);
      if (sha !== this.headSha) this.needClean('checkout');
      this.head = { sha };
      return [`HEAD is now at ${this.short(sha)} ${this.commits.get(sha).message}`];
    },

    merge(args) {
      const { flags, rest } = parse(args);
      const [name] = rest;
      if (flags['--abort']) {
        if (!this.merging) fail('fatal: There is no merge to abort (MERGE_HEAD missing).');
        this.merging = null;
        this.work = [];
        this.aborts++;
        return [];
      }
      if (this.merging) fail('fatal: You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you merge.');
      if (this.picking) fail('fatal: You have not concluded your cherry-pick (CHERRY_PICK_HEAD exists).\nPlease, commit your changes or use \'cherry-pick --abort\' before you merge.');
      if (!name) fail('fatal: no branch to merge was given');
      if (!this.head.branch) fail('fatal: you are in a detached HEAD state: go to a branch first (checkout <branch>)');
      const theirs = this.resolve(name);
      if (!theirs) fail(`merge: ${name} - not something we can merge`);
      const ours = this.headSha;
      if (this.isAncestor(theirs, ours)) return ['Already up to date.'];
      this.needClean('merge');
      if (this.isAncestor(ours, theirs) && !flags['--no-ff']) {
        this.moveHead(theirs);
        return [`Updating ${this.short(ours)}..${this.short(theirs)}`, 'Fast-forward'];
      }
      if (flags['--ff-only']) fail('fatal: Not possible to fast-forward, aborting.');
      if (flags['--no-commit']) {
        this.merging = { name, theirs };
        return ['Automatic merge went well; stopped before committing as requested'];
      }
      const sha = this.make(`Merge branch '${name}'`, [ours, theirs]);
      this.moveHead(sha);
      return ["Merge made by the 'ort' strategy."];
    },

    rebase(args) {
      const { flags, rest } = parse(args);
      if (flags['--abort']) {
        if (!this.rebasing) fail('fatal: No rebase in progress?');
        this.branches.set(this.rebasing.branch, this.rebasing.orig);
        this.head = { branch: this.rebasing.branch };
        this.rebasing = null;
        this.rebaseAborts++;
        return [];
      }
      if (flags['--continue']) {
        if (!this.rebasing) fail('fatal: No rebase in progress?');
        const { branch, rest: left } = this.rebasing;
        let base = this.headSha;
        for (const s of left) base = this.make(this.commits.get(s).message, [base]);
        this.branches.set(branch, base);
        this.head = { branch };
        this.rebasing = null;
        return [`Successfully rebased and updated refs/heads/${branch}.`];
      }
      const [name] = rest;
      if (!name) fail('fatal: no upstream given (rebase <branch>)');
      if (!this.head.branch) fail('fatal: you are in a detached HEAD state: go to a branch first (checkout <branch>)');
      const onto = this.resolve(name);
      if (!onto) fail(`fatal: invalid upstream '${name}'`);
      const tip = this.headSha;
      if (this.work.length) fail('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.');
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
      if (flags['-i'] || flags['--interactive']) {
        // sin editor: el rebase se detiene tras el primer commit, como con «edit», hasta --continue o --abort
        const [first, ...left] = own;
        base = this.make(this.commits.get(first).message, [onto]);
        this.rebasing = { orig: tip, branch: this.head.branch, onto, rest: left };
        this.head = { sha: base };
        return [`Stopped at ${this.short(base)}  ${this.commits.get(first).message}`, "You can amend the commit now, then run 'rebase --continue' (or 'rebase --abort' to cancel)."];
      }
      for (const s of own) base = this.make(this.commits.get(s).message, [base]);
      this.moveHead(base);
      return [`Successfully rebased and updated refs/heads/${this.head.branch}.`];
    },

    'cherry-pick'(args) {
      const { flags, rest } = parse(args);
      if (flags['--abort']) {
        if (!this.picking) fail('error: no cherry-pick or revert in progress');
        if (this.picking.revert) this.revertAborts++;
        else this.pickAborts++;
        this.picking = null;
        return [];
      }
      if (flags['--continue']) {
        if (!this.picking) fail('error: no cherry-pick or revert in progress');
        const { sha: pick, revert } = this.picking;
        this.picking = null;
        const c = this.commits.get(pick);
        const msg = revert ? `Revert "${c.message}"` : c.message;
        const sha = this.commit(msg);
        return [`[${this.head.branch} ${this.short(sha)}] ${msg}`];
      }
      if (!rest.length) fail('fatal: you must specify a commit to cherry-pick');
      if (!this.head.branch) fail('fatal: you are in a detached HEAD state: go to a branch first (checkout <branch>)');
      this.needClean('cherry-pick');
      if (flags['--no-commit'] || flags['-n']) {
        if (rest.length > 1) fail('error: --no-commit takes a single commit in this practice');
        const pick = this.resolve(rest[0]);
        if (!pick) fail(`fatal: bad revision '${rest[0]}'`);
        if (this.commits.get(pick).parents.length > 1) fail(`error: commit ${pick} is a merge but no -m option was given.`);
        this.picking = { sha: pick };
        return [];
      }
      const out = [];
      for (const ref of rest) {
        const pick = this.resolve(ref);
        if (!pick) fail(`fatal: bad revision '${ref}'`);
        const c = this.commits.get(pick);
        if (c.parents.length > 1) fail(`error: commit ${pick} is a merge but no -m option was given.`);
        const sha = this.commit(c.message);
        out.push(`[${this.head.branch} ${this.short(sha)}] ${c.message}`);
      }
      return out;
    },

    revert(args) {
      const { flags, rest } = parse(args);
      if (flags['--abort']) {
        if (!this.picking?.revert) fail('error: no cherry-pick or revert in progress');
        this.picking = null;
        this.revertAborts++;
        return [];
      }
      if (flags['--continue']) return this.commands['cherry-pick'].call(this, ['--continue']);
      if (!rest.length) fail('fatal: you must specify a commit to revert');
      if (!this.head.branch) fail('fatal: you are in a detached HEAD state: go to a branch first (checkout <branch>)');
      this.needClean('revert');
      if (flags['--no-commit'] || flags['-n']) {
        if (rest.length > 1) fail('error: --no-commit takes a single commit in this practice');
        const target = this.resolve(rest[0]);
        if (!target) fail(`fatal: bad revision '${rest[0]}'`);
        if (this.commits.get(target).parents.length > 1) fail(`error: commit ${target} is a merge but no -m option was given.`);
        this.picking = { sha: target, revert: true };
        return [];
      }
      const out = [];
      for (const ref of rest) {
        const target = this.resolve(ref);
        if (!target) fail(`fatal: bad revision '${ref}'`);
        const c = this.commits.get(target);
        if (c.parents.length > 1) fail(`error: commit ${target} is a merge but no -m option was given.`);
        const sha = this.commit(`Revert "${c.message}"`);
        out.push(`[${this.head.branch} ${this.short(sha)}] Revert "${c.message}"`);
      }
      return out;
    },

    tag(args) {
      const { flags, rest } = parse(args);
      if (flags['-d'] || flags['--delete']) {
        if (!rest.length) fail('fatal: tag name required');
        return rest.map((name) => {
          const tip = this.tags.get(name);
          if (!tip) fail(`error: tag '${name}' not found.`);
          this.tags.delete(name);
          return `Deleted tag '${name}' (was ${this.short(tip)})`;
        });
      }
      if (!rest.length) return [...this.tags.keys()].sort();
      const [name, target] = rest;
      if (!validName(name)) fail(`fatal: '${name}' is not a valid tag name.`);
      if (this.tags.has(name)) fail(`fatal: tag '${name}' already exists`);
      const sha = target ? this.resolve(target) : this.headSha;
      if (!sha) fail(target ? `fatal: Failed to resolve '${target}' as a valid ref.` : 'fatal: Failed to resolve HEAD as a valid ref.');
      this.tags.set(name, sha);
      return [];
    },

    reset(args) {
      const { flags, rest } = parse(args);
      const modes = ['--soft', '--mixed', '--hard'].filter((m) => flags[m]);
      if (modes.length > 1) fail(`fatal: ${modes.join(', ')} are incompatible: use only one of --soft, --mixed or --hard`);
      const to = rest[0] || 'HEAD';
      const sha = this.resolve(to);
      if (!sha) fail(`fatal: ambiguous argument '${to}': unknown revision`);
      this.moveHead(sha);
      if (flags['--hard']) this.work = [];
      this.merging = null;
      this.picking = null;
      if (flags['--hard']) return [`HEAD is now at ${this.short(sha)} ${this.commits.get(sha).message}`];
      // --mixed (lo que hace `reset` a secas): los cambios sin commit se quedan, sin preparar
      if (!flags['--soft'] && this.work.length) return ['Unstaged changes after reset:', ...this.work.map((f) => `M\t${f}`)];
      return [];
    },

    /** `reflog` (o `reflog show [HEAD]`): dónde estuvo HEAD, del más nuevo al más viejo. */
    reflog(args) {
      const [sub, ref] = args;
      if (sub && sub !== 'show') fail(`error: unknown subcommand: '${sub}'\nusage: reflog [show [HEAD]]`);
      if (ref && ref !== 'HEAD') fail(`fatal: ambiguous argument '${ref}': only HEAD has a reflog in this practice`);
      return this.reflog.map((e, i) => `${this.short(e.sha)} HEAD@{${this.reflog.length - 1 - i}}: ${e.msg}`).reverse();
    },
  };
  /** `switch` solo mueve entre ramas: `-c` crea, `--detach` va a un commit; un commit a secas no vale. */
  Repo.prototype.commands.switch = function (args) {
    const { flags, rest } = parse(args);
    if (flags['--detach'] || flags['-d']) {
      const [target] = rest;
      if (!target) fail('fatal: missing branch or commit argument');
      const sha = this.resolve(target);
      if (!sha) fail(`fatal: invalid reference: ${target}`);
      if (sha !== this.headSha) this.needClean('switch');
      this.head = { sha };
      return [`HEAD is now at ${this.short(sha)} ${this.commits.get(sha).message}`];
    }
    if (flags['-c'] || flags['--create']) {
      const [name, start] = rest;
      if (!name) fail('fatal: missing branch name');
      return Repo.prototype.commands.checkout.call(this, ['-b', ...(start ? [name, start] : [name])]);
    }
    const [target] = rest;
    if (!target) fail('fatal: missing branch or commit argument');
    if (!this.branches.has(target)) {
      if (this.resolve(target)) fail(`fatal: a branch is expected, got commit '${target}'\nhint: use 'switch --detach ${target}' to go there without a branch`);
      fail(`fatal: invalid reference: ${target}`);
    }
    return Repo.prototype.commands.checkout.call(this, [target]);
  };

  /** `restore <archivo>…` o `restore .` deja los archivos como en HEAD: tira los cambios sin commit de esos archivos. */
  Repo.prototype.commands.restore = function (args) {
    const { flags, rest } = parse(args);
    if (flags['--staged'] || flags['-S']) fail('error: this practice has no staging area: restore works on files with changes (touch <file>)');
    const source = Object.keys(flags).find((f) => f.startsWith('--source='));
    const from = source ? this.resolve(source.slice(9)) : this.headSha;
    if (!from) fail(`fatal: could not resolve ${source.slice(9)}`);
    if (!rest.length) fail('fatal: you must specify path(s) to restore');
    if (!this.headSha) fail('fatal: could not resolve HEAD');
    for (const f of rest) {
      if (f !== '.' && (!/^[\w][\w./-]{0,60}$/.test(f) || f.includes('..'))) fail(`error: pathspec '${f}' did not match any file(s) known to git`);
    }
    if (from !== this.headSha) {
      // otra fuente que HEAD: los archivos quedan distintos de HEAD, o sea cambiados sin commit
      for (const f of rest) if (f !== '.' && !this.work.includes(f)) this.work.push(f);
      return [];
    }
    this.work = rest.includes('.') ? [] : this.work.filter((f) => !rest.includes(f));
    return [];
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
    {
      id: 'cherrypick',
      setup: (r) => {
        r.commands.checkout.call(r, ['-b', 'feature']);
        r.commit('Add profile page');
        r.commit('Hotfix: escape the login URL');
        r.commands.checkout.call(r, ['main']);
      },
      done: (r) => {
        const main = r.branches.get('main');
        const feature = r.branches.get('feature');
        const tag = r.tags.get('v1.0.1');
        if (!main || !feature || tag !== main) return false;
        // main tiene el arreglo (copiado, no fusionado) y no trajo el otro commit de feature
        const mine = r.log(main).filter((s) => !r.ancestors(feature).has(s));
        return mine.length === 1 && r.commits.get(mine[0]).message === 'Hotfix: escape the login URL' && !r.isAncestor(feature, main);
      },
    },
    {
      id: 'revert',
      setup: (r) => {
        r.commit('Add dark mode');
        r.commit('Break checkout totals');
        r.commit('Add footer links');
      },
      done: (r) => {
        const main = r.branches.get('main');
        if (!main) return false;
        // el historial se conserva entero y encima hay un commit nuevo que deshace el malo
        const msgs = r.log(main).slice().reverse().map((s) => r.commits.get(s).message);
        return msgs.length === BASE.length + 4 && msgs.slice(BASE.length).join('|') === 'Add dark mode|Break checkout totals|Add footer links|Revert "Break checkout totals"';
      },
    },
    {
      id: 'stash',
      setup: (r) => {
        r.commands.checkout.call(r, ['-b', 'feature']);
        r.commit('Add profile page');
        r.work = ['profile.js', 'profile.css'];
      },
      done: (r) => {
        const main = r.branches.get('main');
        const feature = r.branches.get('feature');
        if (!main || !feature || r.head.branch !== 'feature' || r.stashes.length) return false;
        // el arreglo llegó a main solo, feature sigue con su único commit y los cambios a medias volvieron sin commitear
        const fix = r.log(main).filter((s) => !r.ancestors(feature).has(s));
        const own = r.log(feature).filter((s) => !r.ancestors(main).has(s));
        return fix.length === 1 && r.log(main).length === BASE.length + 1 && own.length === 1 && ['profile.js', 'profile.css'].every((f) => r.work.includes(f));
      },
    },
    {
      id: 'abort',
      setup: diverge,
      done: (r) => {
        const feature = r.branches.get('feature');
        const main = r.branches.get('main');
        // se probó la fusión y se canceló: main sigue en su commit, feature intacta y nada a medias
        return !!feature && r.aborts > 0 && !r.merging && r.head.branch === 'main' && r.log(main).length === BASE.length + 1 && !r.isAncestor(feature, main);
      },
    },
    {
      id: 'tagabort',
      setup: (r) => {
        r.tags.set('v2', r.headSha);
        r.commands.checkout.call(r, ['-b', 'feature']);
        r.commit('Hotfix: escape the login URL');
        r.commands.checkout.call(r, ['main']);
      },
      done: (r) => {
        const main = r.branches.get('main');
        const feature = r.branches.get('feature');
        // la etiqueta puesta de más se borró, el cherry-pick se probó y se canceló: main y feature intactas y nada a medias
        return !!feature && !r.tags.has('v2') && r.pickAborts > 0 && !r.picking && r.head.branch === 'main' && r.log(main).length === BASE.length && !r.isAncestor(feature, main);
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

  /* ---------- ejercicios propios, compartidos por URL ---------- */

  /* Un ejercicio propio es datos, nunca código: título, meta, los comandos con que parte el repo (los mismos
     de la terminal) y las condiciones que lo dan por resuelto. Va en la URL como JSON en base64 seguro. */
  const LIMITS = { code: 1800, title: 60, goal: 280, setup: 30, command: 120, checks: 8, hints: 3, hint: 160, solution: 10 };
  const BRANCH = '[\\w][\\w./-]{0,60}';
  const CHECKS = [
    [new RegExp(`^exists:(${BRANCH})$`), (r, [a]) => r.branches.get(a) != null],
    [new RegExp(`^missing:(${BRANCH})$`), (r, [a]) => !r.branches.has(a)],
    [new RegExp(`^merged:(${BRANCH})>(${BRANCH})$`), (r, [a, b]) => !!r.branches.get(a) && !!r.branches.get(b) && r.isAncestor(r.branches.get(a), r.branches.get(b))],
    [new RegExp(`^merge-commit:(${BRANCH})$`), (r, [a]) => !!r.branches.get(a) && r.commits.get(r.branches.get(a)).parents.length === 2],
    [new RegExp(`^linear:(${BRANCH})$`), (r, [a]) => !!r.branches.get(a) && r.log(r.branches.get(a)).every((s) => r.commits.get(s).parents.length < 2)],
    [new RegExp(`^commits:(${BRANCH})=(\\d{1,3})$`), (r, [a, n]) => !!r.branches.get(a) && r.log(r.branches.get(a)).length === Number(n)],
    [new RegExp(`^on:(${BRANCH})$`), (r, [a]) => r.head.branch === a],
    // el mensaje del último commit de la rama contiene ese texto (sin distinguir mayúsculas)
    [new RegExp(`^tip:(${BRANCH})~(.{1,60})$`), (r, [a, t]) => !!r.branches.get(a) && r.commits.get(r.branches.get(a)).message.toLowerCase().includes(t.toLowerCase())],
    // la rama tiene commits que la otra no (sin fusionar en ella)
    [new RegExp(`^unmerged:(${BRANCH})>(${BRANCH})$`), (r, [a, b]) => !!r.branches.get(a) && !!r.branches.get(b) && !r.isAncestor(r.branches.get(a), r.branches.get(b))],
  ];

  const b64 = {
    enc(text) {
      const bytes = new TextEncoder().encode(text);
      let bin = '';
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec(code) {
      const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
      return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    },
  };

  const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '').slice(0, max);

  /** Valida un ejercicio propio: devuelve { title, goal, setup, checks, hints } o { error } con la razón. */
  function cleanExercise(raw) {
    if (!raw || typeof raw !== 'object') return { error: 'format' };
    const title = text(raw.title, LIMITS.title);
    const goal = text(raw.goal, LIMITS.goal);
    if (!title || !goal) return { error: 'text' };
    const setup = Array.isArray(raw.setup) ? raw.setup.map((c) => text(c, LIMITS.command + 1)).filter(Boolean) : [];
    if (setup.length > LIMITS.setup || setup.some((c) => c.length > LIMITS.command)) return { error: 'setup' };
    const checks = Array.isArray(raw.checks) ? raw.checks.map((c) => text(c, 200)).filter(Boolean) : [];
    if (!checks.length || checks.length > LIMITS.checks) return { error: 'checks' };
    for (const c of checks) if (!CHECKS.some(([re]) => re.test(c))) return { error: 'check', detail: c };
    const hints = Array.isArray(raw.hints) ? raw.hints.map((h) => text(h, LIMITS.hint + 1)).filter(Boolean) : [];
    if (hints.length > LIMITS.hints || hints.some((h) => h.length > LIMITS.hint)) return { error: 'hints' };
    const solution = Array.isArray(raw.solution) ? raw.solution.map((c) => text(c, LIMITS.command + 1)).filter(Boolean) : [];
    if (solution.length > LIMITS.solution || solution.some((c) => c.length > LIMITS.command)) return { error: 'solution' };
    const spec = { title, goal, setup, checks, hints, ...(solution.length && { solution }) };
    const r = scenario();
    for (const c of setup) {
      const res = r.run(c);
      if (!res.ok) return { error: 'command', detail: c, message: res.lines[0] };
    }
    // la solución propuesta tiene que resolver el ejercicio: si no, mostrarla enseñaría algo falso
    if (solution.length) {
      for (const c of solution) {
        const res = r.run(c);
        if (!res.ok) return { error: 'solution', detail: c, message: res.lines[0] };
      }
      if (!checkTests(checks).every((t) => t(r))) return { error: 'solution', detail: solution[solution.length - 1], message: '' };
    }
    return spec;
  }

  /** Las condiciones de resuelto ya validadas, como funciones del repo. */
  function checkTests(checks) {
    return checks.map((c) => {
      for (const [re, fn] of CHECKS) {
        const m = re.exec(c);
        if (m) return (r) => fn(r, m.slice(1));
      }
      return () => false;
    });
  }

  /** El ejercicio listo para jugar: mismo molde que los de EXERCISES, más sus textos propios. */
  function customExercise(spec) {
    const tests = checkTests(spec.checks);
    return {
      id: `custom:${hash(JSON.stringify(spec)).slice(0, 8)}`,
      custom: true,
      spec,
      title: spec.title,
      goal: spec.goal,
      hints: spec.hints,
      solution: spec.solution || [],
      setup: (r) => {
        for (const c of spec.setup) r.run(c);
      },
      done: (r) => tests.every((t) => t(r)),
    };
  }

  /** De la persona a la URL: el texto que va tras `?practice=`. Nulo si el ejercicio no vale.
      La solución propuesta solo viaja si se pide (`{ solution: true }`): el enlace común no la lleva. */
  function encodeExercise(raw, { solution = false } = {}) {
    const spec = cleanExercise(raw);
    if (spec.error) return null;
    const code = b64.enc(JSON.stringify({ v: 1, t: spec.title, g: spec.goal, s: spec.setup, c: spec.checks, ...(spec.hints.length && { h: spec.hints }), ...(solution && spec.solution && { r: spec.solution }) }));
    return code.length <= LIMITS.code ? code : null;
  }

  /** De la URL a un ejercicio: { exercise } (de EXERCISES, por su número desde 1), { custom } o nulo si es basura. */
  function decodeExercise(code) {
    if (typeof code !== 'string' || !code || code.length > LIMITS.code) return null;
    if (/^\d{1,2}$/.test(code)) {
      const index = Number(code) - 1;
      return index >= 0 && index < EXERCISES.length ? { index } : null;
    }
    if (!/^[\w-]+$/.test(code)) return null;
    try {
      const o = JSON.parse(b64.dec(code));
      if (o?.v !== 1) return null;
      const spec = cleanExercise({ title: o.t, goal: o.g, setup: o.s, checks: o.c, hints: o.h, solution: o.r });
      return spec.error ? null : { custom: spec };
    } catch {
      return null;
    }
  }

  /** Un repo en memoria con las ramas y los commits que el grafo ya tiene de un repo real (`data` de una fuente):
      es una copia, no se escribe nada en el original. Un padre que no se cargó se descarta (queda como raíz);
      una rama cuyo commit no se cargó no entra. HEAD parte en la rama por defecto (o en la primera). */
  function fromData(data) {
    const real = data.commits;
    const names = [...data.branches.keys()].filter((n) => real.has(data.branches.get(n).sha));
    if (!names.length) return null;
    const def = names.includes(data.repo.defaultBranch) ? data.repo.defaultBranch : names[0];
    const r = new Repo({ now: Date.now(), branch: def });
    r.branches.clear();
    for (const n of names) r.branches.set(n, data.branches.get(n).sha);
    for (const [sha, c] of real) {
      r.commits.set(sha, { sha, parents: c.parents.filter((p) => real.has(p)), message: c.message, author: c.author, date: c.date, url: c.url || null });
      if (c.date > r.clock) r.clock = c.date;
    }
    return r;
  }

  GB.gitsim = {
    Repo,
    fromData,
    EXERCISES,
    LIMITS,
    hash,
    tokenize,
    cleanExercise,
    customExercise,
    encodeExercise,
    decodeExercise,
    /** El repo de partida de un ejercicio (índice de 0 a EXERCISES.length - 1). */
    start(index, now) {
      return scenario(EXERCISES[index].setup, now);
    },
    /** El repo de partida de un ejercicio propio (el de customExercise). */
    startCustom(exercise, now) {
      return scenario(exercise.setup, now);
    },
  };
})(window.GB);
