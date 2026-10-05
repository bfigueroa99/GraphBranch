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

  U.shortSha = (sha) => (sha || '').slice(0, 7);
  U.firstLine = (msg) => String(msg || '').split('\n')[0].trim();
  U.truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  U.plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  U.timeAgo = (ms, now = Date.now()) => {
    if (!ms) return '';
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 5) return 'ahora';
    if (s < 60) return `hace ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    if (d < 30) return `hace ${d} d`;
    return U.fmtDate(ms);
  };

  U.fmtDate = (ms) => new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  U.fmtDateTime = (ms) =>
    new Date(ms).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  U.fmtNum = (n) => Number(n).toLocaleString('es');
  U.dayKey = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  /** Acepta "owner/repo", URLs de GitHub (https o ssh) y quita ".git". */
  U.parseRepo = (input) => {
    const s = String(input || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
    const m = s.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/i) || s.match(/^([\w.-]+)\/([\w.-]+)$/);
    return m ? { owner: m[1], name: m[2] } : null;
  };

  /** localStorage envuelto: puede no existir o lanzar (modo privado, sandbox). */
  U.store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('graphbranch:' + key);
        return v == null ? fallback : JSON.parse(v);
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

  U.initials = (name) => {
    const parts = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
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

  /** Extrae el nombre de rama de un mensaje de merge típico de GitHub o git. */
  U.mergedBranchName = (message) => {
    const line = U.firstLine(message);
    let m = line.match(/^Merge pull request #\d+ from [^/\s]+\/(\S+)/);
    if (m) return m[1];
    m = line.match(/^Merge (?:remote-tracking )?branch '([^']+)'/);
    if (m) return m[1].replace(/^origin\//, '');
    return null;
  };

  GB.U = U;
})(window.GB);
