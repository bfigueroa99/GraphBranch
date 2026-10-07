/* GraphBranch — sonido de la actividad.
   Cada tipo de evento tiene su timbre (pulsación para los commits, campana para los PRs, acorde
   para los merges, arpegio para los releases, destello agudo para las estrellas) y todo suena
   dentro de una escala pentatónica, cuantizado a un pulso tranquilo: varios eventos juntos forman
   una frase en vez de ruido, como en "Listen to Wikipedia". La rama por defecto es la tónica y
   cada rama tiene su propia nota; con la vista 3D, el sonido sale del lado de la pantalla donde
   está la rama. Solo Web Audio: sin archivos ni librerías, así que la CSP no cambia. */
(function (GB) {
  'use strict';
  const { U } = GB;
  const BPM = 88;
  const STEP = 60 / BPM / 2; // corchea, en segundos
  const SCALE = [0, 2, 4, 7, 9]; // pentatónica mayor: ninguna combinación desafina
  const ROOT = 57; // La 3 (MIDI)
  const MAX_NOTES = 14; // por tanda: una ráfaga de eventos no se vuelve una avalancha
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  /** Grado de la escala (puede ser negativo o pasar de 5) a nota MIDI. */
  const note = (d) => ROOT + 12 * Math.floor(d / 5) + SCALE[((d % 5) + 5) % 5];

  class Synth {
    constructor() {
      this.ctx = null;
      this.nextFree = 0;
      this.defaultBranch = null;
    }

    /** El contexto de audio nace con el primer uso; si el navegador lo deja suspendido (política
        de reproducción automática), se reanuda con el siguiente gesto del usuario. */
    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return this.ctx;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = (this.ctx = new AC());
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(comp);
      // eco suave, a tempo, con los agudos apagados: da espacio sin una reverberación pesada
      this.bus = ctx.createGain();
      this.bus.connect(this.master);
      const delay = ctx.createDelay(2);
      delay.delayTime.value = STEP * 3;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2200;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.3;
      const wet = ctx.createGain();
      wet.gain.value = 0.2;
      this.bus.connect(delay);
      delay.connect(tone);
      tone.connect(feedback);
      feedback.connect(delay);
      tone.connect(wet);
      wet.connect(this.master);
      if (ctx.state === 'suspended') {
        const wake = () => {
          ctx.resume().catch(() => {});
          if (ctx.state !== 'suspended') for (const t of ['pointerdown', 'keydown']) window.removeEventListener(t, wake, true);
        };
        for (const t of ['pointerdown', 'keydown']) window.addEventListener(t, wake, true);
      }
      return ctx;
    }

    /** Nota base de cada rama: la rama por defecto es la tónica; las demás, un grado fijo según su nombre. */
    degreeOf(branch) {
      if (!branch || branch === this.defaultBranch) return 0;
      return (U.hash(branch) % 5) + 1;
    }

    /* ---------- instrumentos ---------- */

    out(pan) {
      const ctx = this.ctx;
      if (!ctx.createStereoPanner) return this.bus;
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      p.connect(this.bus);
      return p;
    }

    env(g, t, peak, attack, decay) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }

    /** Pulsación: triángulo con un filtro que se cierra (commits, ramas). */
    pluck(t, midi, pan, gain = 0.2, decay = 0.5) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = hz(midi);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(3200, t);
      f.frequency.exponentialRampToValueAtTime(700, t + decay);
      this.env(g, t, gain, 0.006, decay);
      o.connect(f).connect(g).connect(this.out(pan));
      o.start(t);
      o.stop(t + decay + 0.05);
    }

    /** Campana: parciales inarmónicos que se apagan a distinto ritmo (PRs, revisiones, estrellas). */
    bell(t, midi, pan, gain = 0.16, decay = 1.6) {
      const ctx = this.ctx;
      const dest = this.out(pan);
      for (const [ratio, amp, k] of [
        [1, 1, 1],
        [2.76, 0.32, 0.55],
        [5.4, 0.12, 0.3],
      ]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = hz(midi) * ratio;
        this.env(g, t, gain * amp, 0.004, decay * k);
        o.connect(g).connect(dest);
        o.start(t);
        o.stop(t + decay * k + 0.05);
      }
    }

    /** Acorde suave: pares de osciladores apenas desafinados detrás de un filtro (merges, releases). */
    pad(t, midis, pan, gain = 0.07, decay = 1.8) {
      const ctx = this.ctx;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1500;
      f.connect(this.out(pan));
      for (const m of midis) {
        for (const detune of [-7, 7]) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.value = hz(m);
          o.detune.value = detune;
          this.env(g, t, gain, 0.05, decay);
          o.connect(g).connect(f);
          o.start(t);
          o.stop(t + decay + 0.1);
        }
      }
    }

    /* ---------- de eventos a música ---------- */

    /** Programa los sonidos de una tanda de actividades. `panOf(a)` da el lado de la pantalla (-1 a 1). */
    play(acts, panOf) {
      const ctx = this.ensure();
      if (!ctx || !acts.length) return;
      if (this.nextFree > ctx.currentTime + 1.5) return; // ya hay frase en cola: no acumular atraso
      // en la rejilla global de corcheas: lo que llega junto se encadena como una frase
      let t = Math.max(ctx.currentTime + 0.06, this.nextFree);
      t = Math.ceil(t / STEP) * STEP;
      let budget = MAX_NOTES;
      for (const a of [...acts].sort((x, y) => x.time - y.time)) {
        if (budget <= 0) break;
        const pan = (panOf?.(a) || 0) * 0.75;
        const { steps, notes } = this.voice(a, t, pan);
        budget -= notes;
        t += steps * STEP;
      }
      this.nextFree = t;
    }

    voice(a, t, pan) {
      const d = this.degreeOf(a.branch);
      const h = STEP / 2;
      switch (a.kind) {
        case 'push': {
          // un arpegio con tantas notas como commits (hasta 4)
          const n = clamp(Number(a.title?.params?.n) || 1, 1, 4);
          for (let i = 0; i < n; i++) this.pluck(t + i * h, note(d + 5 + i), pan, 0.18);
          return { steps: Math.ceil(n / 2), notes: n };
        }
        case 'merge':
          this.pluck(t, note(d + 5), pan);
          this.pluck(t + h, note(d + 7), pan);
          return { steps: 1, notes: 2 };
        case 'force':
          this.pluck(t, note(d + 1), pan, 0.2, 0.35);
          this.pluck(t + h, note(d - 1), pan, 0.2, 0.6);
          return { steps: 1, notes: 2 };
        case 'branch-create':
          this.pluck(t, note(d + 5), pan, 0.16);
          this.pluck(t + h, note(d + 7), pan, 0.16);
          return { steps: 1, notes: 2 };
        case 'branch-delete':
        case 'branch-delete-unmerged':
          this.pluck(t, note(d + 6), pan, 0.12);
          this.pluck(t + h, note(d + 4), pan, 0.12, 0.7);
          return { steps: 1, notes: 2 };
        case 'pr-open':
          this.bell(t, note(d + 7), pan);
          return { steps: 2, notes: 1 };
        case 'pr-merge':
          // acorde en la rama base y una campana encima: el sonido de "esto llegó"
          this.pad(t, [note(d), note(d + 2), note(d + 4)], pan);
          this.bell(t + h, note(d + 10), pan, 0.12);
          return { steps: 3, notes: 2 };
        case 'pr-close':
          this.pluck(t, note(d + 3), pan, 0.12, 0.4);
          return { steps: 1, notes: 1 };
        case 'review-ok':
          this.bell(t, note(d + 8), pan, 0.12, 1.1);
          this.bell(t + h, note(d + 10), pan, 0.12, 1.3);
          return { steps: 2, notes: 2 };
        case 'review-changes':
          this.bell(t, note(d + 8), pan, 0.11, 0.9);
          this.bell(t + h, note(d + 6), pan, 0.11, 1.1);
          return { steps: 2, notes: 2 };
        case 'release': {
          for (let i = 0; i < 5; i++) this.bell(t + i * h, note(5 + i * 2), 0, 0.13, 1.4);
          this.pad(t + 5 * h, [note(0), note(2), note(4), note(5)], 0, 0.06, 2.6);
          this.bell(t + 6 * h, note(15), 0, 0.08, 2);
          return { steps: 5, notes: 7 };
        }
        case 'star':
          this.bell(t, note(14), pan, 0.07, 1.2);
          this.bell(t + h / 2, note(16), pan, 0.05, 1.4);
          return { steps: 1, notes: 2 };
        case 'fork':
          this.bell(t, note(12), pan, 0.08, 1);
          this.bell(t + h, note(9), pan, 0.07, 1.2);
          return { steps: 1, notes: 2 };
        case 'tag':
          this.bell(t, note(10), pan, 0.1, 1.4);
          return { steps: 1, notes: 1 };
        default:
          // issues, comentarios, revisiones sin veredicto y el resto: un toque discreto
          this.pluck(t, note(d + 8), pan, 0.08, 0.35);
          return { steps: 1, notes: 1 };
      }
    }

    /** Zumbido del modo vuelo: sube de tono y de volumen con la velocidad (de 0 a 1). */
    engine(level) {
      if (!this.hum && level <= 0) return;
      const ctx = this.ensure();
      if (!ctx) return;
      if (!this.hum) {
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 180;
        filter.Q.value = 3;
        const oscs = [55, 55.7].map((f) => {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.connect(filter);
          o.start();
          return o;
        });
        filter.connect(gain).connect(this.master);
        this.hum = { gain, filter, oscs };
      }
      const t = ctx.currentTime;
      const h = this.hum;
      h.gain.gain.setTargetAtTime(level * 0.05, t, 0.15);
      h.filter.frequency.setTargetAtTime(160 + level * 900, t, 0.2);
      h.oscs.forEach((o, i) => o.frequency.setTargetAtTime(48 + i * 0.6 + level * 30, t, 0.3));
    }

    /** Mundo abierto: el motivo de una rama descubierta (su nota), del destino alcanzado o del mapa completo. */
    discover(kind, branch, pan = 0) {
      const ctx = this.ensure();
      if (!ctx) return;
      const t = ctx.currentTime + 0.04;
      const h = STEP / 2;
      const d = this.degreeOf(branch);
      if (kind === 'complete') {
        for (let i = 0; i < 4; i++) this.bell(t + i * h, note(7 + i * 2), 0, 0.12, 1.4);
        this.pad(t + 4 * h, [note(0), note(4), note(7)], 0, 0.06, 2.4);
      } else if (kind === 'enter') {
        // llegada a una galaxia: un acorde grave que crece y un brillo que sube
        this.pad(t, [note(d - 7), note(d - 3), note(d)], pan, 0.07, 3.2);
        this.bell(t + h, note(d + 7), pan, 0.06, 2.2);
        this.bell(t + 2 * h, note(d + 9), pan, 0.06, 2.2);
        this.bell(t + 3 * h, note(d + 14), pan, 0.07, 2.8);
      } else if (kind === 'scan') {
        // el escáner: un ping que se aleja
        this.pluck(t, note(d + 12), pan, 0.14, 0.7);
        this.bell(t + h * 0.5, note(d + 14), pan, 0.07, 1.6);
        this.bell(t + h * 1.5, note(d + 14), pan, 0.04, 1.6);
      } else if (kind === 'arrive') {
        this.bell(t, note(d + 7), pan, 0.13, 1.3);
        this.bell(t + h, note(d + 5), pan, 0.11, 1.6);
        this.pad(t + h, [note(d), note(d + 2)], pan, 0.05, 1.6);
      } else {
        // tres notas que suben, como al encontrar un lugar nuevo
        this.bell(t, note(d + 5), pan, 0.1, 1.1);
        this.bell(t + h, note(d + 7), pan, 0.1, 1.2);
        this.bell(t + 2 * h, note(d + 10), pan, 0.11, 1.8);
      }
    }

    /** Al activar el sonido: una frase corta que confirma que funciona. */
    preview() {
      const ctx = this.ensure();
      if (!ctx) return;
      const t = ctx.currentTime + 0.05;
      const h = STEP / 2;
      this.pluck(t, note(5), 0, 0.16);
      this.pluck(t + h, note(7), 0, 0.16);
      this.bell(t + 2 * h, note(9), 0, 0.12, 1.4);
      this.nextFree = Math.max(this.nextFree, t + 3 * h);
    }
  }

  GB.Synth = Synth;
})(window.GB);
