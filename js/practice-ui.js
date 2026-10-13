/* GraphBranch — la terminal de práctica de git: el ejercicio, la salida de los comandos y la línea donde se
   escriben. Habla con la fuente (sources/practice.js); el grafo lo dibuja la app con lo que la fuente emite.
   Todo texto entra con textContent: lo que se escribe nunca se interpreta como HTML. */
(function (GB) {
  'use strict';
  const { i18n } = GB;
  const MAX_LINES = 300;

  class PracticePanel {
    /** `root`: el <form> del panel; `onPick(index)`: la persona eligió o reinició un ejercicio. */
    constructor(root, { onPick }) {
      this.root = root;
      this.onPick = onPick;
      this.source = null;
      this.history = [];
      this.cursor = 0;
      root.innerHTML = `
        <div class="pr-head">
          <select class="pr-ex"></select>
          <button type="button" class="btn btn-ghost pr-restart"></button>
        </div>
        <p class="pr-goal"></p>
        <div class="pr-log" role="log" aria-live="polite" tabindex="0"></div>
        <p class="pr-status" role="status"></p>
        <div class="pr-line">
          <span class="pr-prompt" aria-hidden="true">$ git</span>
          <input class="pr-input" type="text" autocomplete="off" spellcheck="false" autocapitalize="off" autocorrect="off">
        </div>`;
      this.sel = root.querySelector('.pr-ex');
      this.restart = root.querySelector('.pr-restart');
      this.goal = root.querySelector('.pr-goal');
      this.log = root.querySelector('.pr-log');
      this.status = root.querySelector('.pr-status');
      this.input = root.querySelector('.pr-input');
      root.addEventListener('submit', (ev) => {
        ev.preventDefault();
        this.submit();
      });
      this.sel.addEventListener('change', () => this.onPick(Number(this.sel.value)));
      this.restart.addEventListener('click', () => this.onPick(this.source.index));
      this.input.addEventListener('keydown', (ev) => {
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
      GB.gitsim.EXERCISES.forEach((ex, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = `${src.solved.has(ex.id) ? '✓ ' : ''}${i + 1} · ${t(`practice.ex${i + 1}.title`)}`;
        this.sel.append(o);
      });
      this.sel.value = String(src.index);
      this.restart.textContent = t('practice.restart');
      this.goal.textContent = t(`practice.ex${src.index + 1}.goal`);
      this.input.setAttribute('aria-label', t('practice.input'));
      this.status.textContent = src.exercise.done(src.git) ? t('practice.solved') : '';
      const note = this.log.querySelector('.pr-note');
      if (note) note.textContent = t('practice.hello');
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
