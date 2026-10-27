/* GraphBranch — utilidades compartidas. Scripts clásicos (sin módulos) para que
   index.html funcione también abierto directamente desde el disco (file://). */
window.GB = window.GB || {};

(function (GB) {
  'use strict';

  const U = {};

  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  U.esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /** Solo http(s): una URL que llega de la API no puede ser javascript:, data: ni otro esquema. */
  U.safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');

  U.shortSha = (sha) => (sha || '').slice(0, 7);
  U.firstLine = (msg) => String(msg || '').split('\n')[0].trim();
  U.truncate = (s, n) => {
    if (s.length <= n) return s;
    let end = n - 1;
    const c = s.charCodeAt(end - 1);
    if (c >= 0xd800 && c <= 0xdbff) end--; // no partir un par sustituto (emoji, kanji raros)
    return s.slice(0, end) + '…';
  };

  /* fechas, números y tiempos relativos según el idioma activo (ver i18n.js) */
  U.timeAgo = (ms, now) => GB.i18n.timeAgo(ms, now);
  U.fmtDate = (ms) => GB.i18n.fmtDate(ms);
  U.fmtDateTime = (ms) => GB.i18n.fmtDateTime(ms);
  U.fmtNum = (n) => GB.i18n.fmtNum(n);
  U.dayKey = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  /** Acepta "owner/repo", URLs de GitHub (https o ssh) y quita ".git". Un repo de Bitbucket Cloud, con su URL de bitbucket.org o como "bitbucket:espacio/repo": devuelve { host: 'bitbucket', owner, name }. Un repo de Codeberg va con su
      URL de codeberg.org o como "codeberg:dueño/repo": devuelve { host: 'codeberg', owner, name }. Un servidor propio de Forgejo/Gitea
      (?forge=) va con su URL o como "forgejo:dueño/repo": { host: 'forgejo', owner, name }. Un proyecto de GitLab, con
      sus subgrupos, va con su URL de gitlab.com (también la de una rama o un archivo, o ssh) o como
      "gitlab:grupo/proyecto": devuelve { host: 'gitlab', owner: 'grupo/sub', name: 'proyecto' }. */
  U.forgeBase = ''; // la dirección de un Forgejo/Gitea propio (?forge=, --forge-url=): sus URLs también se reconocen, como "forgejo:dueño/repo" (ver app.js)
  U.bitbucketBase = ''; // la dirección de un Bitbucket Data Center/Server propio (?bitbucket=, --bitbucket-url=): sus URLs también se reconocen, como "bitbucketdc:CLAVE/repo" (ver app.js)
  U.gitlabBase = ''; // la dirección de un GitLab propio (?gitlab=, --gitlab-url=): sus URLs también se reconocen (ver app.js)
  U.parseRepo = (input) => {
    // un repo de esta máquina (app de escritorio): local:<id de la carpeta>/<nombre>; el id lo da el proceso principal
    const here = String(input || '').trim().match(/^local:([0-9a-f]{12})\/(.{1,200})$/);
    if (here) return { host: 'local', owner: here[1], name: here[2] };
    const s = String(input || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/, '');
    // un GitLab propio: su URL https (con la ruta en que cuelgue) o git@host: por ssh; se compara por prefijo exacto, no por subcadena
    let own = null;
    if (U.gitlabBase) {
      const base = U.gitlabBase.replace(/\/+$/, '');
      const ssh = `git@${base.replace(/^https:\/\//, '')}`;
      const lower = s.toLowerCase();
      if (lower.startsWith(base.toLowerCase() + '/')) own = [null, s.slice(base.length + 1)];
      else if (/^[^/]+$/.test(base.slice(8)) && lower.startsWith(ssh.toLowerCase() + ':')) own = [null, s.slice(ssh.length + 1)];
    }
    // un Forgejo/Gitea propio: su URL https (o git@host: por ssh), también por prefijo exacto
    if (U.forgeBase) {
      const base = U.forgeBase.replace(/\/+$/, '');
      const ssh = `git@${base.replace(/^https:\/\//, '')}`;
      const lower = s.toLowerCase();
      let rest = null;
      if (lower.startsWith(base.toLowerCase() + '/')) rest = s.slice(base.length + 1);
      else if (/^[^/]+$/.test(base.slice(8)) && lower.startsWith(ssh.toLowerCase() + ':')) rest = s.slice(ssh.length + 1);
      else if (/^forgejo:/i.test(s)) rest = s.slice(8);
      if (rest !== null) {
        const parts = rest.split('/').filter(Boolean);
        if (parts.length < 2 || !parts.slice(0, 2).every((p) => /^[\w.-]+$/.test(p) && !/^\.+$/.test(p))) return null;
        return { host: 'forgejo', owner: parts[0], name: parts[1] };
      }
    }
    // un Bitbucket Data Center/Server propio: projects/CLAVE/repos/repo, users/ana/repos/repo o scm/clave/repo.git bajo su dirección
    if (U.bitbucketBase) {
      const base = U.bitbucketBase.replace(/\/+$/, '');
      const lower = s.toLowerCase();
      let owner = null;
      let name = null;
      if (lower.startsWith(base.toLowerCase() + '/')) {
        const parts = s.slice(base.length + 1).split('/').filter(Boolean);
        if ((parts[0] === 'projects' || parts[0] === 'users') && parts[2] === 'repos') [owner, name] = [parts[0] === 'users' ? '~' + parts[1] : parts[1], parts[3]];
        else if (parts[0] === 'scm') [owner, name] = [parts[1], parts[2]];
        else return null;
      } else if (/^bitbucketdc:/i.test(s)) [owner, name] = s.slice(12).split('/').filter(Boolean);
      if (owner !== null) {
        if (!owner || !name || !/^~?[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name) || /^\.+$/.test(owner.replace(/^~/, '')) || /^\.+$/.test(name)) return null;
        return { host: 'bitbucketdc', owner, name };
      }
    }
    const lab = own || s.match(/^gitlab:(.+)$/i) || s.match(/gitlab\.com[/:](.+)$/i);
    if (lab) {
      const parts = lab[1].split('/-/')[0].split('/').filter(Boolean);
      if (parts.length < 2 || !parts.every((p) => /^[\w.-]+$/.test(p) && !/^\.+$/.test(p))) return null;
      return { host: 'gitlab', owner: parts.slice(0, -1).join('/'), name: parts[parts.length - 1] };
    }
    const bb = s.match(/^bitbucket:(.+)$/i) || s.match(/bitbucket\.org[/:](.+)$/i);
    if (bb) {
      const parts = bb[1].split('/').filter(Boolean);
      if (parts.length < 2 || !parts.slice(0, 2).every((p) => /^[\w.-]+$/.test(p) && !/^\.+$/.test(p))) return null;
      return { host: 'bitbucket', owner: parts[0], name: parts[1].replace(/\.git$/, '') };
    }
    const cb = s.match(/^codeberg:(.+)$/i) || s.match(/codeberg\.org[/:](.+)$/i);
    if (cb) {
      const parts = cb[1].split('/').filter(Boolean);
      if (parts.length < 2 || !parts.slice(0, 2).every((p) => /^[\w.-]+$/.test(p) && !/^\.+$/.test(p))) return null;
      return { host: 'codeberg', owner: parts[0], name: parts[1] };
    }
    const m = s.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/i) || s.match(/^([\w.-]+)\/([\w.-]+)$/);
    return m && !/^\.+$/.test(m[1]) && !/^\.+$/.test(m[2]) ? { owner: m[1], name: m[2] } : null;
  };

  /** Una organización o un usuario de GitHub entero: org:nombre, user:nombre, @nombre o la URL de su
      perfil (github.com/nombre, github.com/orgs/nombre). null si no es eso: un nombre suelto no
      cuenta, para no confundirlo con un repo mal escrito. */
  U.parseOwner = (input) => {
    const s = String(input || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
    const m = s.match(/^(?:org:|user:|@)(.+)$/i) || s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(?:orgs\/)?([^/]+)$/i);
    // como GitHub: letras, números y guiones sueltos, sin guion al principio ni al final, hasta 39
    return m && /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(m[1]) ? { owner: m[1] } : null;
  };

  /** Un grupo de GitLab entero: group:ruta (con subgrupos, `group:gitlab-org/ci-cd`) o la URL de su página
      (`gitlab.com/groups/ruta`, o la de un GitLab propio con `?gitlab=`). null si no es eso. */
  U.parseGroup = (input) => {
    const s = String(input || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
    let rest = (s.match(/^group:(.+)$/i) || [])[1];
    if (rest == null) {
      const bases = ['https://gitlab.com', 'https://www.gitlab.com', 'gitlab.com', 'www.gitlab.com'];
      if (U.gitlabBase) bases.push(U.gitlabBase.replace(/\/+$/, ''));
      const lower = s.toLowerCase();
      const base = bases.find((b) => lower.startsWith(b.toLowerCase() + '/groups/'));
      if (base) rest = s.slice(base.length + 8).split('/-/')[0];
    }
    const parts = String(rest || '').split('/').filter(Boolean);
    return parts.length && parts.every((p) => /^[\w.-]+$/.test(p) && !/^\.+$/.test(p)) ? { group: parts.join('/') } : null;
  };

  /** localStorage envuelto: puede no existir o lanzar (modo privado, sandbox). Un valor guardado que no es
      del tipo del `fallback` (lista, texto, número, booleano) está corrupto: se devuelve el `fallback`. */
  U.store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('graphbranch:' + key);
        if (v == null) return fallback;
        const got = JSON.parse(v);
        if (fallback == null) return got;
        return Array.isArray(fallback) ? (Array.isArray(got) ? got : fallback) : typeof got === typeof fallback && got !== null && !Array.isArray(got) ? got : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        if (value == null) localStorage.removeItem('graphbranch:' + key);
        else localStorage.setItem('graphbranch:' + key, JSON.stringify(value));
      } catch {
        /* sin almacenamiento: la app funciona igual */
      }
    },
  };

  /** Los tokens de la web. En `<usuario>.github.io` el origen lo comparten todos los proyectos del usuario, y un
      `localStorage` ahí lo lee cualquiera de ellos: el token vive en `sessionStorage` (se pierde al cerrar la
      pestaña) y el que ya estuviera en `localStorage` pasa a la sesión y se borra. En otro origen sigue en `store`. */
  U.secret = {
    shared: () => /\.github\.io$/i.test((typeof location !== 'undefined' && location.hostname) || ''),
    get(key, fallback) {
      if (!U.secret.shared()) return U.store.get(key, fallback);
      try {
        const own = sessionStorage.getItem('graphbranch:' + key);
        if (own != null) return JSON.parse(own);
      } catch {
        /* sin sessionStorage: se sigue con lo que haya en localStorage */
      }
      const old = U.store.get(key, fallback);
      if (old && old !== fallback) {
        U.secret.set(key, old);
        U.store.set(key, null);
      }
      return old;
    },
    set(key, value) {
      if (!U.secret.shared()) return U.store.set(key, value);
      U.store.set(key, null);
      try {
        if (value == null) sessionStorage.removeItem('graphbranch:' + key);
        else sessionStorage.setItem('graphbranch:' + key, JSON.stringify(value));
      } catch {
        /* sin almacenamiento: la app funciona igual */
      }
    },
  };

  U.initials = (name) => {
    const parts = String(name || '?').replace(/[^\p{L}\p{M}\p{N} ]/gu, ' ').trim().split(/\s+/);
    const first = (w) => Array.from(w || '?')[0]; // por carácter, no por unidad UTF-16
    return (first(parts[0]) + (parts.length > 1 ? first(parts[parts.length - 1]) : '')).toUpperCase();
  };

  U.hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };

  /** Avatar: imagen real si hay URL; si falla o no existe, iniciales. */
  U.avatarHTML = (actor, size = 20) => {
    const name = actor?.login || actor?.name || '?';
    const init = U.esc(U.initials(actor?.name || name));
    const tint = U.hash(name) % 6;
    const fallback = `<span class="avatar avatar-i t${tint}" style="--sz:${size}px" aria-hidden="true">${init}</span>`;
    if (!actor?.avatar) return fallback;
    const src = actor.avatar + (actor.avatar.includes('?') ? '&' : '?') + 's=' + size * 2;
    return `<img class="avatar" style="--sz:${size}px" src="${U.esc(src)}" alt="" loading="lazy" data-fb="${U.esc(fallback)}">`;
  };

  /* El CSP de index.html no permite manejadores en línea (onerror=…). Los errores de carga de
     una imagen no burbujean, pero sí se capturan en el documento: así sirve para todas. */
  document.addEventListener(
    'error',
    (ev) => {
      const img = ev.target;
      if (img instanceof HTMLImageElement && img.dataset.fb && img.parentNode) img.outerHTML = img.dataset.fb;
    },
    true,
  );

  /** Emisor mínimo de eventos para las fuentes de datos. */
  class Emitter {
    constructor() {
      this._handlers = {};
    }
    on(type, fn) {
      (this._handlers[type] ||= []).push(fn);
      return this;
    }
    emit(type, payload) {
      for (const fn of this._handlers[type] || []) {
        try {
          fn(payload);
        } catch (err) {
          console.error(err);
        }
      }
    }
  }
  U.Emitter = Emitter;

  /** Commits conocidos alcanzables desde `starts` (BFS). Devuelve {set, truncated}. */
  U.reachable = (commits, starts, limit = 100000) => {
    const set = new Set();
    let truncated = false;
    const queue = [...starts];
    for (let i = 0; i < queue.length && set.size < limit; i++) {
      const sha = queue[i];
      if (set.has(sha)) continue;
      const c = commits.get(sha);
      if (!c) {
        truncated = true;
        continue;
      }
      set.add(sha);
      for (const p of c.parents) if (!set.has(p)) queue.push(p);
    }
    return { set, truncated };
  };

  U.ancestors = (commits, start) => U.reachable(commits, [start]);

  U.matches = (name, filter) => !filter || name.toLowerCase().includes(filter.toLowerCase());

  /** Clases de <html> que no cambian colores: tv-idle solo esconde el puntero y la barra del modo TV. */
  const NOT_THEME = new Set(['tv-idle']);
  const themeClasses = (s) => new Set(String(s || '').split(/\s+/).filter((c) => c && !NOT_THEME.has(c)));

  /**
   * Avisa cuando cambia el tema: el del sistema, `data-theme` o una clase de <html> que pueda
   * cambiar colores. Lo que no cambia nada (reescribir la misma clase, tv-idle) no avisa: el modo TV
   * toca tv-idle en cada movimiento del ratón y releer el tema redibuja el grafo entero.
   */
  U.onThemeChange = (fn) => {
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', fn);
    const root = document.documentElement;
    new MutationObserver((list) => {
      const now = themeClasses(root.className);
      const changed = list.some((m) => {
        if (m.attributeName !== 'class') return m.oldValue !== root.getAttribute(m.attributeName);
        const before = themeClasses(m.oldValue);
        return before.size !== now.size || [...before].some((c) => !now.has(c));
      });
      if (changed) fn();
    }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'class'], attributeOldValue: true });
  };

  /** Extrae el nombre de rama de un mensaje de merge típico de GitHub o git. */
  U.mergedBranchName = (message) => {
    const line = U.firstLine(message);
    let m = line.match(/^Merge pull request #\d+ from [^/\s]+\/(\S+)/);
    if (m) return m[1];
    m = line.match(/^Merge (?:remote-tracking )?branch '([^']+)'/);
    if (m) return m[1].replace(/^origin\//, '');
    return null;
  };

  /** Texto → base64 de sus bytes UTF-8, de a tramos (un archivo grande no revienta la pila). Las APIs de los
      servicios mandan y reciben así el contenido de un archivo (ver js/editor.js). */
  U.b64encode = (text) => {
    const bytes = new TextEncoder().encode(String(text ?? ''));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  /** base64 → { text, binary }: binary si los bytes no son UTF-8 válido o traen un byte nulo (no se editan como texto). */
  U.b64decode = (b64) => {
    let bin;
    try {
      bin = atob(String(b64 || '').replace(/\s+/g, ''));
    } catch {
      return { text: '', binary: true };
    }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.includes(0)) return { text: '', binary: true };
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), binary: false };
    } catch {
      return { text: '', binary: true };
    }
  };

  /** Una ruta de archivo para la URL de una API: cada tramo escapado, las barras como barras. */
  U.encPath = (path) => String(path || '').split('/').map(encodeURIComponent).join('/');

  GB.U = U;
})(window.GB);
