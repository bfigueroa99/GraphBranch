/* GraphBranch — la terminal de práctica de git: el ejercicio, la salida de los comandos y la línea donde se
   escriben. Habla con la fuente (sources/practice.js); el grafo lo dibuja la app con lo que la fuente emite.
   Todo texto entra con textContent: lo que se escribe nunca se interpreta como HTML. */
(function (GB) {
  'use strict';
  const { i18n } = GB;
  const MAX_LINES = 300;

  class PracticePanel {
    /** `root`: el <form> del panel; `onPick(index, custom)`: la persona eligió o reinició un ejercicio;
        `onMake(spec)`: creó uno propio; `onRehearse(data)`: reinicia el ensayo sobre los datos de ese repo; `urlFor(source)`: el enlace que lo comparte (o nulo). */
    constructor(root, { onPick, onMake, onRehearse, urlFor }) {
      this.root = root;
      this.onPick = onPick;
      this.onMake = onMake;
      this.onRehearse = onRehearse;
      this.urlFor = urlFor;
      this.source = null;
      this.history = [];
      this.cursor = 0;
      root.innerHTML = `
        <div class="pr-head">
          <select class="pr-ex"></select>
          <button type="button" class="btn btn-ghost pr-restart"></button>
          <button type="button" class="btn btn-ghost pr-share"></button>
        </div>
        <p class="pr-goal"></p>
        <input class="pr-link" type="text" readonly hidden>
        <div class="pr-log" role="log" aria-live="polite" tabindex="0"></div>
        <p class="pr-status" role="status"></p>
        <details class="pr-make">
          <summary></summary>
          <label><span class="pr-l-title"></span><input class="pr-m-title" type="text" maxlength="60"></label>
          <label><span class="pr-l-goal"></span><textarea class="pr-m-goal" rows="2" maxlength="280"></textarea></label>
          <label><span class="pr-l-setup"></span><textarea class="pr-m-setup" rows="3" spellcheck="false" placeholder="checkout -b feature&#10;commit -m &quot;one&quot;"></textarea></label>
          <label><span class="pr-l-checks"></span><textarea class="pr-m-checks" rows="2" spellcheck="false" placeholder="exists:feature&#10;merged:feature>main"></textarea></label>
          <p class="pr-m-help"></p>
          <p class="pr-m-err" role="alert"></p>
          <button type="button" class="btn pr-m-go"></button>
        </details>
        <div class="pr-line">
          <span class="pr-prompt" aria-hidden="true">$ git</span>
          <input class="pr-input" type="text" autocomplete="off" spellcheck="false" autocapitalize="off" autocorrect="off">
        </div>`;
      this.sel = root.querySelector('.pr-ex');
      this.restart = root.querySelector('.pr-restart');
      this.share = root.querySelector('.pr-share');
      this.link = root.querySelector('.pr-link');
      this.make = root.querySelector('.pr-make');
      this.goal = root.querySelector('.pr-goal');
      this.log = root.querySelector('.pr-log');
      this.status = root.querySelector('.pr-status');
      this.input = root.querySelector('.pr-input');
      root.addEventListener('submit', (ev) => {
        ev.preventDefault();
        this.submit();
      });
      this.sel.addEventListener('change', () => {
        if (this.sel.value !== 'custom' && this.sel.value !== 'rehearsal') this.onPick(Number(this.sel.value));
      });
      this.restart.addEventListener('click', () => (this.source.rehearsal ? this.onRehearse(this.source.rehearsal.data) : this.onPick(this.source.index, this.source.custom)));
      this.share.addEventListener('click', () => this.shareLink());
      this.make.querySelector('.pr-m-go').addEventListener('click', () => this.create());
      this.input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          // con más de un campo el formulario ya no envía solo al pulsar Enter
          ev.preventDefault();
          this.submit();
          return;
        }
        if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
        ev.preventDefault();
        this.cursor = Math.max(0, Math.min(this.history.length, this.cursor + (ev.key === 'ArrowUp' ? -1 : 1)));
        this.input.value = this.history[this.cursor] || '';
      });
    }

    /** Muestra el panel para esta fuente (o lo esconde si no es de práctica). */
    attach(source) {
      this.source = source?.run ? source : null;
      this.root.hidden = !this.source;
      if (!this.source) return;
      this.log.textContent = '';
      this.link.hidden = true;
      this.print(i18n.t('practice.hello'), 'pr-note');
      this.render();
    }

    /** Textos y estado según el idioma y los ejercicios resueltos. */
    render() {
      const src = this.source;
      if (!src) return;
      const t = i18n.t;
      this.sel.setAttribute('aria-label', t('practice.ex'));
      this.sel.textContent = '';
      this.share.hidden = !!src.rehearsal;
      this.make.hidden = !!src.rehearsal;
      if (src.rehearsal) {
        const o = document.createElement('option');
        o.value = 'rehearsal';
        o.textContent = `${src.rehearsal.owner}/${src.rehearsal.name}`;
        this.sel.append(o);
      } else if (src.custom) {
        const o = document.createElement('option');
        o.value = 'custom';
        o.textContent = `${src.check() ? '✓ ' : ''}${src.custom.title}`;
        this.sel.append(o);
      }
      GB.gitsim.EXERCISES.forEach((ex, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = `${src.solved.has(ex.id) ? '✓ ' : ''}${i + 1} · ${t(`practice.ex${i + 1}.title`)}`;
        this.sel.append(o);
      });
      this.sel.value = src.rehearsal ? 'rehearsal' : src.custom ? 'custom' : String(src.index);
      this.restart.textContent = t('practice.restart');
      this.share.textContent = t('practice.share');
      this.link.setAttribute('aria-label', t('practice.link'));
      this.goal.textContent = src.rehearsal ? t('practice.rehearseGoal', { repo: `${src.rehearsal.owner}/${src.rehearsal.name}` }) : src.custom ? src.custom.goal : t(`practice.ex${src.index + 1}.goal`);
      this.make.querySelector('summary').textContent = t('practice.make');
      for (const k of ['title', 'goal', 'setup', 'checks']) this.make.querySelector(`.pr-l-${k}`).textContent = t(`practice.make.${k}`);
      this.make.querySelector('.pr-m-help').textContent = t('practice.make.help');
      this.make.querySelector('.pr-m-go').textContent = t('practice.make.go');
      this.input.setAttribute('aria-label', t('practice.input'));
      this.status.textContent = src.exercise.done(src.git) ? t('practice.solved') : '';
      const note = this.log.querySelector('.pr-note');
      if (note) note.textContent = t('practice.hello');
    }

    /** Muestra el enlace del ejercicio y lo copia si el navegador deja. */
    async shareLink() {
      const url = this.urlFor?.(this.source);
      if (!url) return;
      this.link.value = url;
      this.link.hidden = false;
      this.link.select();
      try {
        await navigator.clipboard.writeText(url);
        this.status.textContent = i18n.t('practice.copied');
      } catch {
        /* sin portapapeles: el enlace queda a la vista para copiarlo a mano */
      }
    }

    /** Lee el formulario de «Crear un ejercicio» y lo empieza; si no vale, dice por qué. */
    create() {
      const q = (c) => this.make.querySelector(c).value;
      const lines = (c) => q(c).split('\n').map((l) => l.trim()).filter(Boolean);
      const spec = GB.gitsim.cleanExercise({ title: q('.pr-m-title'), goal: q('.pr-m-goal'), setup: lines('.pr-m-setup'), checks: lines('.pr-m-checks') });
      const err = this.make.querySelector('.pr-m-err');
      if (spec.error || !GB.gitsim.encodeExercise(spec)) {
        err.textContent = i18n.t(`practice.make.err.${spec.error || 'long'}`, { detail: spec.detail || '', message: spec.message || '' });
        return;
      }
      err.textContent = '';
      this.onMake(spec);
    }

    print(text, cls = '') {
      const line = document.createElement('div');
      line.className = `pr-row ${cls}`.trim();
      line.textContent = text;
      this.log.append(line);
      while (this.log.childElementCount > MAX_LINES) this.log.firstElementChild.remove();
      this.log.scrollTop = this.log.scrollHeight;
    }

    submit() {
      const text = this.input.value.trim();
      if (!text || !this.source) return;
      this.history.push(text);
      this.cursor = this.history.length;
      this.input.value = '';
      this.print(`$ git ${text.replace(/^git\s+/, '')}`, 'pr-cmd');
      const res = this.source.run(text);
      for (const l of res.lines) this.print(l, res.ok ? '' : 'pr-err');
      this.render();
    }

    focus() {
      this.input.focus();
    }
  }

  GB.PracticePanel = PracticePanel;
})(window.GB);
