/* GraphBranch — feed de actividad y alertas: lista filtrable, avisos emergentes,
   sonido opcional, notificaciones del sistema y contador en la pestaña. */
(function (GB) {
  'use strict';
  const { U, i18n } = GB;
  const { t } = i18n;

  const ICONS = {
    commit: '<circle cx="8" cy="8" r="2.6"/><path d="M1.5 8h3.9M10.6 8h3.9"/>',
    merge: '<circle cx="4.5" cy="3.5" r="1.8"/><circle cx="4.5" cy="12.5" r="1.8"/><circle cx="11.5" cy="8.5" r="1.8"/><path d="M4.5 5.3v5.4M4.5 5.3c0 2.6 2.2 3.2 5.2 3.2"/>',
    branch: '<circle cx="4.5" cy="3.5" r="1.8"/><circle cx="4.5" cy="12.5" r="1.8"/><circle cx="11.5" cy="4.5" r="1.8"/><path d="M4.5 5.3v5.4M11.5 6.3c0 3-3 3.2-7 4.4"/>',
    force: '<path d="M9.2 1.5 3.6 9h4.1l-1 5.5L12.4 7H8.3z"/>',
    pr: '<circle cx="4.5" cy="3.5" r="1.8"/><circle cx="4.5" cy="12.5" r="1.8"/><circle cx="11.5" cy="12.5" r="1.8"/><path d="M4.5 5.3v5.4M11.5 10.7V6.5a2 2 0 0 0-2-2H7.4M9 2.9 7.4 4.5 9 6.1"/>',
    prClosed: '<circle cx="4.5" cy="3.5" r="1.8"/><circle cx="4.5" cy="12.5" r="1.8"/><circle cx="11.5" cy="12.5" r="1.8"/><path d="M4.5 5.3v5.4M11.5 10.7V8M9.8 2.3l3.4 3.4M13.2 2.3 9.8 5.7"/>',
    trash: '<path d="M2.8 4.5h10.4M6.3 4.5V2.8h3.4v1.7M4.3 4.5l.7 8.7h6l.7-8.7"/>',
    check: '<circle cx="8" cy="8" r="6"/><path d="m5.3 8.2 1.9 1.9 3.6-3.8"/>',
    x: '<circle cx="8" cy="8" r="6"/><path d="m5.9 5.9 4.2 4.2M10.1 5.9l-4.2 4.2"/>',
    run: '<circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.3 1.6"/>',
    cancel: '<circle cx="8" cy="8" r="6"/><path d="M3.8 12.2 12.2 3.8"/>',
    issue: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="1.3"/>',
    issueClosed: '<circle cx="8" cy="8" r="6"/><path d="m5.3 8.2 1.9 1.9 3.6-3.8"/>',
    comment: '<path d="M2.5 3h11v7.3H8l-3.2 2.7v-2.7H2.5z"/>',
    review: '<path d="M1.5 8s2.4-4.6 6.5-4.6S14.5 8 14.5 8s-2.4 4.6-6.5 4.6S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.9"/>',
    star: '<path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/>',
    fork: '<circle cx="4" cy="3" r="1.6"/><circle cx="12" cy="3" r="1.6"/><circle cx="8" cy="13" r="1.6"/><path d="M4 4.6v.9c0 1.4 1 2.4 2.4 2.4h3.2c1.4 0 2.4-1 2.4-2.4v-.9M8 7.9v3.5"/>',
    tag: '<path d="M2.2 2.2h5.4l6.2 6.2-5.4 5.4-6.2-6.2z"/><circle cx="5.2" cy="5.2" r="0.9"/>',
    dot: '<circle cx="8" cy="8" r="3"/>',
    link: '<path d="M6.5 3.5h-3v9h9v-3M9.5 2.5h4v4M13.5 2.5 7.5 8.5"/>',
    close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  };
  const icon = (name, cls = '') =>
    `<svg class="ico ${cls}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.dot}</svg>`;

  const KINDS = {
    push: { cat: 'commits', sev: 'info', icon: 'commit' },
    merge: { cat: 'commits', sev: 'good', icon: 'merge' },
    force: { cat: 'commits', sev: 'warn', icon: 'force' },
    'branch-create': { cat: 'branches', sev: 'info', icon: 'branch' },
    'branch-delete': { cat: 'branches', sev: 'info', icon: 'trash' },
    'branch-delete-unmerged': { cat: 'branches', sev: 'warn', icon: 'trash' },
    'pr-open': { cat: 'prs', sev: 'info', icon: 'pr' },
    'pr-merge': { cat: 'prs', sev: 'good', icon: 'merge' },
    'pr-close': { cat: 'prs', sev: 'info', icon: 'prClosed' },
    review: { cat: 'prs', sev: 'info', icon: 'review' },
    'review-ok': { cat: 'prs', sev: 'good', icon: 'review' },
    'review-changes': { cat: 'prs', sev: 'warn', icon: 'review' },
    'ci-start': { cat: 'ci', sev: 'info', icon: 'run', quiet: true },
    'ci-ok': { cat: 'ci', sev: 'good', icon: 'check' },
    'ci-fail': { cat: 'ci', sev: 'bad', icon: 'x' },
    'ci-cancel': { cat: 'ci', sev: 'info', icon: 'cancel' },
    'issue-open': { cat: 'issues', sev: 'info', icon: 'issue' },
    'issue-close': { cat: 'issues', sev: 'good', icon: 'issueClosed' },
    comment: { cat: 'issues', sev: 'info', icon: 'comment' },
    release: { cat: 'other', sev: 'good', icon: 'tag' },
    tag: { cat: 'other', sev: 'info', icon: 'tag' },
    star: { cat: 'other', sev: 'info', icon: 'star' },
    fork: { cat: 'other', sev: 'info', icon: 'fork' },
    other: { cat: 'other', sev: 'info', icon: 'dot' },
  };
  const CATS = ['commits', 'branches', 'prs', 'ci', 'issues', 'other'];
  const SEV_RANK = { bad: 3, warn: 2, good: 1, info: 0 };
  const meta = (a) => KINDS[a.kind] || KINDS.other;
  const kindLabel = (a) => t('kind.' + (KINDS[a.kind] ? a.kind : 'other'));
  /* titulo y detalle pueden ser texto de GitHub o mensajes diferidos (i18n.msg): se traducen al mostrar */
  const titleOf = (a) => i18n.text(a.title);
  const detailOf = (a) => i18n.text(a.detail);

  class Feed {
    constructor({ list, empty, chips, toasts, count, onSelect }) {
      this.list = list;
      this.empty = empty;
      this.chipsEl = chips;
      this.toastsEl = toasts;
      this.countEl = count;
      this.onSelect = onSelect;
      this.items = [];
      this.els = new Map();
      this.filters = new Set(U.store.get('filters', CATS));
      this.sound = !!U.store.get('sound', false);
      this.notifySupported = typeof window.Notification === 'function';
      this.notify = this.notifySupported && U.store.get('notify', false) && Notification.permission === 'granted';
      this.unread = 0;
      this.baseTitle = document.title;
      this.lastChime = 0;
      this.renderChips();
      setInterval(() => this.refreshTimes(), 20000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.unread = 0;
          this.updateTitle();
        }
      });
    }

    /* ---------- datos ---------- */

    clear() {
      this.items = [];
      this.els.clear();
      this.list.textContent = '';
      this.toastsEl.textContent = '';
      this.unread = 0;
      this.updateTitle();
      this.render();
    }

    add(acts, { live }) {
      const known = new Set(this.items.map((a) => a.id));
      const fresh = acts.filter((a) => a && !known.has(a.id));
      if (!fresh.length) return;
      const now = Date.now();
      for (const a of fresh) {
        a.live = live;
        a.addedAt = now;
      }
      this.items = [...fresh, ...this.items].sort((a, b) => b.time - a.time).slice(0, 300);
      const keep = new Set(this.items.map((a) => a.id));
      for (const id of [...this.els.keys()]) if (!keep.has(id)) (this.els.get(id).remove(), this.els.delete(id));
      this.render();
      if (live) this.alert(fresh);
    }

    lastTime() {
      return this.items[0]?.time || null;
    }

    /* ---------- lista ---------- */

    renderChips() {
      this.drawChips();
      this.chipsEl.addEventListener('click', (ev) => {
        const b = ev.target.closest('.chip');
        if (!b) return;
        const cat = b.dataset.cat;
        if (this.filters.has(cat)) this.filters.delete(cat);
        else this.filters.add(cat);
        b.setAttribute('aria-pressed', this.filters.has(cat));
        U.store.set('filters', [...this.filters]);
        this.render();
      });
    }

    drawChips() {
      this.chipsEl.innerHTML = CATS.map(
        (key) =>
          `<button type="button" class="chip cat-${key}" data-cat="${key}" aria-pressed="${this.filters.has(key)}">${U.esc(t('cat.' + key))}<span class="chip-n" data-n="${key}">0</span></button>`,
      ).join('');
    }

    /** Vuelve a dibujar todo con el idioma activo (los textos de cada actividad se arman al mostrarlos). */
    relocalize() {
      this.drawChips();
      this.els.clear();
      this.list.textContent = '';
      this.render();
    }

    render() {
      const counts = Object.fromEntries(CATS.map((k) => [k, 0]));
      for (const a of this.items) counts[meta(a).cat]++;
      for (const [k, n] of Object.entries(counts)) {
        const el = this.chipsEl.querySelector(`[data-n="${k}"]`);
        if (el) el.textContent = n;
      }
      const visible = this.items.filter((a) => this.filters.has(meta(a).cat));
      const shown = new Set();
      let prev = null;
      for (const a of visible) {
        let li = this.els.get(a.id);
        if (!li) {
          li = this.makeItem(a);
          this.els.set(a.id, li);
        }
        const want = prev ? prev.nextSibling : this.list.firstChild;
        if (want !== li) this.list.insertBefore(li, want);
        prev = li;
        shown.add(li);
      }
      for (const li of [...this.list.children]) if (!shown.has(li)) li.remove();
      this.empty.hidden = visible.length > 0;
      this.empty.textContent = this.items.length ? t('feed.emptyFiltered') : t('feed.empty');
      this.countEl.textContent = this.items.length ? U.fmtNum(this.items.length) : '';
    }

    makeItem(a) {
      const m = meta(a);
      const li = document.createElement('li');
      li.className = `act sev-${m.sev}${a.live ? ' fresh' : ''}`;
      const focusable = !!(a.sha || a.branch);
      const metaParts = [];
      if (a.actor) metaParts.push(`${U.avatarHTML(a.actor, 16)}<span>${U.esc(a.actor.login || a.actor.name || t('author.unknown'))}</span>`);
      if (a.ref || a.branch) metaParts.push(`<code>${U.esc(a.ref || a.branch)}</code>`);
      metaParts.push(`<time datetime="${new Date(a.time).toISOString()}" title="${U.esc(U.fmtDateTime(a.time))}" data-t="${a.time}">${U.timeAgo(a.time)}</time>`);
      const inner = `
        <span class="act-icon">${icon(m.icon)}</span>
        <span class="act-body">
          <span class="act-kind">${U.esc(kindLabel(a))}</span>
          <span class="act-title">${U.esc(titleOf(a))}</span>
          ${detailOf(a) ? `<span class="act-detail">${U.esc(detailOf(a))}</span>` : ''}
          <span class="act-meta">${metaParts.join('<span class="sep" aria-hidden="true">·</span>')}</span>
        </span>`;
      li.innerHTML =
        (focusable
          ? `<button type="button" class="act-main" title="${U.esc(t('feed.locate'))}">${inner}</button>`
          : `<div class="act-main">${inner}</div>`) +
        (a.url ? `<a class="act-link" href="${U.esc(a.url)}" target="_blank" rel="noopener" title="${U.esc(t('feed.openGithub'))}" aria-label="${U.esc(t('feed.openGithub'))}">${icon('link')}</a>` : '');
      if (focusable) li.querySelector('.act-main').addEventListener('click', () => this.onSelect?.(a));
      if (a.live) setTimeout(() => li.classList.remove('fresh'), 6000);
      return li;
    }

    refreshTimes() {
      const now = Date.now();
      for (const el of this.list.querySelectorAll('time[data-t]')) el.textContent = U.timeAgo(Number(el.dataset.t), now);
    }

    /* ---------- alertas ---------- */

    alert(acts) {
      const ranked = [...acts].sort((a, b) => SEV_RANK[meta(b).sev] - SEV_RANK[meta(a).sev] || b.time - a.time);
      const loud = ranked.filter((a) => !meta(a).quiet && this.filters.has(meta(a).cat));
      const shown = loud.length > 3 ? loud.slice(0, 2) : loud;
      for (const a of shown.reverse()) this.toast(a);
      if (loud.length > 3) this.summaryToast(loud.length - 2);
      if (this.sound && loud.length) this.chime(meta(loud[0]).sev);
      if (document.hidden) {
        this.unread += acts.length;
        this.updateTitle();
        if (this.notify) this.systemNotify(ranked);
      }
    }

    toast(a) {
      const m = meta(a);
      const el = document.createElement('div');
      el.className = `toast sev-${m.sev}`;
      el.setAttribute('role', m.sev === 'bad' ? 'alert' : 'status');
      el.innerHTML = `
        <button type="button" class="toast-main">
          <span class="act-icon">${icon(m.icon)}</span>
          <span class="toast-body">
            <span class="act-kind">${U.esc(kindLabel(a))}</span>
            <span class="toast-title">${U.esc(titleOf(a))}</span>
            ${detailOf(a) ? `<span class="toast-detail">${U.esc(U.truncate(detailOf(a), 120))}</span>` : ''}
          </span>
        </button>
        <button type="button" class="toast-close" aria-label="${U.esc(t('toast.close'))}">${icon('close')}</button>
        <span class="toast-timer" aria-hidden="true"></span>`;
      const ttl = m.sev === 'bad' ? 14000 : m.sev === 'warn' ? 10000 : 6000;
      el.style.setProperty('--ttl', ttl + 'ms');
      const close = () => {
        if (el.classList.contains('leaving')) return;
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 260);
      };
      let timer = setTimeout(close, ttl);
      let remaining = ttl;
      let started = Date.now();
      el.addEventListener('pointerenter', () => {
        clearTimeout(timer);
        remaining -= Date.now() - started;
        el.classList.add('paused');
      });
      el.addEventListener('pointerleave', () => {
        started = Date.now();
        timer = setTimeout(close, Math.max(1500, remaining));
        el.classList.remove('paused');
      });
      el.querySelector('.toast-close').addEventListener('click', close);
      el.querySelector('.toast-main').addEventListener('click', () => {
        this.onSelect?.(a);
        close();
      });
      this.toastsEl.appendChild(el);
      const all = this.toastsEl.querySelectorAll('.toast:not(.leaving)');
      if (all.length > 3) all[0].querySelector('.toast-close').click();
    }

    summaryToast(n) {
      this.toast({ kind: 'other', title: i18n.msg('toast.more', { n }), detail: i18n.msg('toast.moreDetail'), time: Date.now() });
    }

    updateTitle() {
      document.title = this.unread ? `(${this.unread}) ${this.baseTitle}` : this.baseTitle;
    }

    setBaseTitle(title) {
      this.baseTitle = title;
      this.updateTitle();
    }

    /* ---------- sonido ---------- */

    setSound(on) {
      this.sound = on;
      U.store.set('sound', on);
      if (on) this.chime('good', true);
    }

    chime(sev, force) {
      const now = Date.now();
      if (!force && now - this.lastChime < 1200) return;
      this.lastChime = now;
      try {
        this.audio ||= new (window.AudioContext || window.webkitAudioContext)();
        const ctx = this.audio;
        if (ctx.state === 'suspended') ctx.resume();
        const notes = { info: [740], good: [660, 990], warn: [520, 520], bad: [440, 330] }[sev] || [740];
        notes.forEach((f, i) => {
          const t0 = ctx.currentTime + i * 0.13;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = f;
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + 0.25);
        });
      } catch {
        /* audio no disponible */
      }
    }

    /* ---------- notificaciones del sistema ---------- */

    async setNotify(on) {
      if (!on || !this.notifySupported) {
        this.notify = false;
        U.store.set('notify', false);
        return false;
      }
      let perm = Notification.permission;
      if (perm === 'default') {
        try {
          perm = await Notification.requestPermission();
        } catch {
          perm = 'denied';
        }
      }
      this.notify = perm === 'granted';
      U.store.set('notify', this.notify);
      return this.notify;
    }

    systemNotify(ranked) {
      try {
        const top = ranked[0];
        const body = ranked.length > 1 ? `${detailOf(top)}\n${t('notify.more', { n: ranked.length - 1 })}` : detailOf(top);
        const n = new Notification(titleOf(top), { body, tag: 'graphbranch', renotify: true, silent: !this.sound });
        n.onclick = () => {
          window.focus();
          this.onSelect?.(top);
          n.close();
        };
      } catch {
        /* el navegador puede negarse */
      }
    }
  }

  Feed.KINDS = KINDS;
  Feed.icon = icon;
  GB.Feed = Feed;
})(window.GB);
