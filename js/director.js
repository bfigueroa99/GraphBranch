/* GraphBranch — director de cámara: en la vista 3D elige qué mirar, como el realizador de una
   transmisión. Lleva una cola con lo que acaba de pasar y un puntaje por interés (release 100,
   PR fusionado 80, PR abierto 50, commit 10), sostiene cada plano unos segundos (más en modo TV),
   no vuelve a la misma rama antes de 30 s salvo por algo grande y, tras tres planos de detalle,
   abre un plano general para que se entienda dónde pasó cada cosa. Los saltos largos se resuelven
   con un corte con fundido y no con un vuelo: un vuelo largo marea. Cuando no pasa nada rueda
   planos de ambiente (el presente, la vista general, un paseo por una rama). Cualquier gesto del
   usuario le devuelve la cámara al instante, y el director la retoma tras unos segundos sin
   tocar nada. Sin movimiento (prefers-reduced-motion) solo hay cortes, sin derivas. */
(function (GB) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (p) => p * p * (3 - 2 * p);

  /** Interés de cada tipo de actividad: lo más importante se lleva la cámara. */
  const SCORE = {
    release: 100,
    'pr-merge': 80,
    force: 60,
    'pr-open': 50,
    'review-ok': 45,
    'review-changes': 40,
    'branch-create': 35,
    tag: 30,
    merge: 30,
    'branch-delete-unmerged': 25,
    'branch-delete': 20,
    push: 10,
  };
  const BIG = 80; // desde aquí, una noticia puede volver a una rama recién filmada
  const QUEUE_TTL = 45000; // lo que no se filmó en este tiempo ya no es noticia
  const COOLDOWN = 30000; // no repetir rama antes de esto
  const DETAIL_RUN = 3; // planos de detalle seguidos antes de abrir uno general
  const CUT_DIST = 26; // saltos más largos que esto: corte con fundido en vez de vuelo
  const FADE_MS = 280;
  const FLY_MS = 1900;
  const PACE = {
    normal: { min: 4500, max: 6500, idle: 11000, resume: 12000 },
    tv: { min: 8000, max: 11000, idle: 15000, resume: 20000 },
  };
  /* planos de ambiente cuando no pasa nada, en este orden (en TV también se recorre una rama) */
  const IDLE = {
    normal: ['present', 'overview', 'tour'],
    tv: ['present', 'overview', 'tour', 'present', 'overview', 'ride'],
  };

  class Director {
    constructor(g) {
      this.g = g;
      this.on = false;
      this.tv = false;
      this.manual = false; // el usuario tomó la cámara
      this.paused = false;
      this.queue = []; // { act, kind, branch, from, score, at }
      this.seen = new Map(); // rama → cuándo se filmó
      this.toured = new Map(); // rama → cuándo se paseó por ella
      this.shot = null;
      this.cut = null; // corte con fundido en curso: { at, target, cam }
      this.detailRun = 0;
      this.idleIdx = 0;
      this.Y = new THREE.Vector3(0, 1, 0);
      this.v = new THREE.Vector3();
      this.w = new THREE.Vector3();
    }

    get pace() {
      return this.tv ? PACE.tv : PACE.normal;
    }

    /** Si ahora mismo es el director quien mueve la cámara. */
    get rolling() {
      return this.on && !this.manual && !this.paused;
    }

    setOn(on) {
      if (this.on === on) return;
      this.on = on;
      this.manual = false;
      this.end();
      const g = this.g;
      // al apagarlo, la cámara vuelve a seguir el presente (si nadie está volando o paseando)
      if (!on && !g.flight?.on && !g.ride) g.setFollowing(true);
      this.emit();
    }

    setTV(on) {
      this.tv = on;
    }

    /** Pausa: la cámara se queda donde está hasta que se reanude. */
    setPaused(on) {
      this.paused = on;
      if (on) this.end();
    }

    /** El usuario tocó la cámara: se la cede de inmediato. */
    yieldControl() {
      if (!this.on) return;
      this.end();
      if (this.manual) return;
      this.manual = true;
      this.emit();
    }

    /** Termina el plano en curso sin mover la cámara. */
    end() {
      const g = this.g;
      if (this.cut) {
        this.cut = null;
        g.setFade(false);
      }
      if (this.flying && g.fly === this.flying) g.fly = null;
      this.flying = null;
      if (this.shot?.type === 'ride' && g.ride?.auto) g.endRide();
      if (this.shot) {
        this.shot = null;
        g.opts.onShot?.(null);
      }
    }

    /** Otro repositorio, o el Replay empieza o termina: la cola y la memoria ya no valen. */
    reset() {
      this.queue = [];
      this.seen.clear();
      this.toured.clear();
      this.detailRun = 0;
      this.end();
    }

    emit() {
      this.g.opts.onDirector?.({ on: this.on, manual: this.manual });
    }

    /* ---------- la cola de noticias ---------- */

    /** Actividades recién llegadas (en vivo o del Replay). */
    push(acts) {
      if (!this.on || !acts?.length) return;
      const g = this.g;
      const now = performance.now();
      const prHead = new Map([...(g.ctx?.prs?.values() || [])].map((p) => [p.number, p.head]));
      for (const a of acts) {
        const score = SCORE[a.kind];
        if (!score) continue;
        const [head, base] = String(a.ref || '').split(' → ');
        let branch = a.branch || prHead.get(a.number) || head || null;
        let from = null;
        if (a.kind === 'pr-merge') {
          // el plano encuadra el arco entero: de la rama del PR a su base
          from = head || null;
          branch = base || a.branch || g.defaultHead();
        } else if (a.kind === 'release' || a.kind === 'tag') branch = g.defaultHead(); // los fuegos salen de ahí
        if (!branch) continue;
        const twin = this.queue.find((q) => q.branch === branch && q.kind === a.kind);
        if (twin) {
          // una ráfaga en la misma rama es una sola noticia, algo más interesante
          twin.score = Math.min(score + 20, twin.score + 4);
          twin.at = now;
          twin.act = a;
        } else this.queue.push({ act: a, kind: a.kind, branch, from, score, at: now });
      }
      if (this.queue.length > 40) this.queue = this.queue.sort((x, y) => y.score - x.score).slice(0, 40);
    }

    /** La noticia más interesante que todavía se puede filmar (o null). */
    pick(now) {
      let best = null;
      let bestV = 0;
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const q = this.queue[i];
        const age = now - q.at;
        if (age > QUEUE_TTL || !this.g.branchPos(q.branch)) {
          this.queue.splice(i, 1);
          continue;
        }
        if (q.score < BIG && now - (this.seen.get(q.branch) ?? -Infinity) < COOLDOWN) continue;
        const v = q.score * (1 - age / QUEUE_TTL);
        if (v > bestV) (best = q), (bestV = v);
      }
      return best;
    }

    /* ---------- cuadro a cuadro ---------- */

    /** Decide el plano y mueve la cámara. Devuelve true si la movió. */
    step(now, dt) {
      if (!this.on) return false;
      const g = this.g;
      if (this.manual) {
        const calm = now - g.lastInteract > this.pace.resume && !g.interacting && !g.keys.size;
        if (!calm) return false;
        if (this.tv) {
          // en una pantalla compartida nadie vuelve a cerrar lo que dejó abierto
          g.unpin();
          g.flight?.exit();
          if (g.ride) g.endRide();
        }
        if (g.pinned || g.flight?.on || g.ride) return false;
        this.manual = false;
        this.emit();
      }
      if (this.paused || !g.nodes.size) return false;
      if (g.following) g.setFollowing(false);
      if (this.cut) return this.stepCut(now);
      const s = this.shot;
      if (!s && g.fly) return false; // la entrada de la cámara termina antes del primer plano
      if (s?.type === 'ride' && g.ride) {
        // un paseo se corta solo por algo grande
        if (now - s.t0 < 3000 || !(this.pick(now)?.score >= BIG)) return false;
        g.endRide();
      }
      const age = s ? now - s.t0 : Infinity;
      if (!s || s.type === 'ride' || age >= s.max || (age >= s.min && this.pick(now))) {
        this.next(now);
        return true;
      }
      return this.drift(s, dt);
    }

    next(now) {
      const q = this.pick(now);
      const p = this.pace;
      if (q && this.detailRun >= DETAIL_RUN) {
        // un respiro: plano general para situar lo que viene
        this.detailRun = 0;
        return this.start({ type: 'overview', min: p.min * 0.7, max: p.min * 1.2 }, now);
      }
      if (q) {
        this.queue.splice(this.queue.indexOf(q), 1);
        this.detailRun++;
        this.seen.set(q.branch, now);
        if (q.from) this.seen.set(q.from, now);
        return this.start({ type: 'event', kind: q.kind, branch: q.branch, from: q.from, act: q.act, min: p.min, max: p.max }, now);
      }
      this.detailRun = 0;
      const list = this.tv ? IDLE.tv : IDLE.normal;
      for (let i = 0; i < list.length; i++) {
        const type = list[this.idleIdx++ % list.length];
        const shot = { type, min: 2000, max: p.idle };
        if (type === 'ride' && !this.g.motion) continue;
        if (type === 'tour' || type === 'ride') {
          shot.branch = this.tourBranch(now, type === 'ride');
          if (!shot.branch) continue;
        }
        return this.start(shot, now);
      }
      return this.start({ type: 'present', min: 2000, max: p.idle }, now);
    }

    /** Rama para un plano de ambiente: la que hace más que no se ve (con historia propia si es para recorrerla). */
    tourBranch(now, ride) {
      const L = this.g.layout;
      if (!L) return null;
      const own = new Map();
      if (ride) for (const n of L.nodes) own.set(n.chain, (own.get(n.chain) || 0) + 1);
      let best = null;
      let bestT = Infinity;
      for (const h of L.heads) {
        if (h.color === 'ghost' || !this.g.heads.has(h.name)) continue;
        if (ride && (own.get('b:' + h.name) || 0) < 3) continue;
        const last = Math.max(this.toured.get(h.name) ?? -1e12, this.seen.get(h.name) ?? -1e12);
        const t = last + Math.random() * 5000;
        if (t < bestT) (bestT = t), (best = h.name);
      }
      if (best) this.toured.set(best, now);
      return best;
    }

    start(shot, now) {
      const g = this.g;
      this.end();
      shot.t0 = now;
      shot.amt = 0;
      this.shot = shot;
      g.opts.onShot?.(shot.type === 'event' ? shot.act : null);
      if (shot.type === 'ride') {
        g.rideBranch(shot.branch, true);
        return;
      }
      const { target, cam } = this.compose(shot);
      if (!g.motion) this.place(target, cam);
      else if (g.controls.target.distanceTo(target) > CUT_DIST) {
        this.cut = { at: now + FADE_MS, target, cam };
        shot.t0 = now + FADE_MS;
        g.setFade(true);
      } else {
        g.flyTo(target, cam, FLY_MS);
        this.flying = g.fly;
      }
    }

    stepCut(now) {
      const c = this.cut;
      if (now < c.at) return false;
      this.cut = null;
      this.place(c.target, c.cam);
      this.g.setFade(false);
      return true;
    }

    place(target, cam) {
      const g = this.g;
      g.fly = null;
      g.controls.target.copy(target);
      g.camera.position.copy(cam);
      g.controls.update();
      g.needsRender = true;
    }

    /** Encuadre de cada plano: dónde mira la cámara, desde dónde, y cómo se mueve mientras dura. */
    compose(shot) {
      const g = this.g;
      const aspect = g.W && g.H ? g.W / g.H : 1.6;
      const wide = clamp(1.6 / aspect, 1, 1.9); // paneles angostos (celular): más lejos
      const side = Math.random() < 0.5 ? -1 : 1;
      const zTop = g.maxX * g.sp;
      shot.spin = side * 0.05; // rad/s alrededor del objetivo
      shot.push = 0; // > 0 acerca la cámara despacio
      shot.glide = 0; // avance del objetivo por el eje del tiempo
      shot.track = null;

      if (shot.type === 'overview' && g.galaxy) {
        // el universo entero, desde arriba y de lado
        const target = new THREE.Vector3();
        const d = (16 + Math.min(g.radius, 420) * 1.6) * wide;
        const dir = new THREE.Vector3(side * 0.7, 0.75, 0.5).normalize();
        shot.spin = side * 0.03;
        shot.push = -0.006;
        return { target, cam: target.clone().addScaledVector(dir, d) };
      }

      if (shot.type === 'overview') {
        const span = clamp(zTop, 12, 70);
        const target = new THREE.Vector3(0, 0, zTop - span * 0.45);
        const d = (span * 0.7 + g.radius * 2 + 12) * wide;
        const dir = new THREE.Vector3(side, 0.55, 0.35).normalize();
        shot.spin = side * 0.03;
        shot.push = -0.006;
        return { target, cam: target.clone().addScaledVector(dir, d) };
      }

      const at = (shot.type === 'event' || shot.type === 'tour') && g.branchPos(shot.branch);
      if (at) {
        const P = at.toV.clone();
        const G = g.galaxy && g.gx.galaxyOf(shot.branch);
        let dir;
        if (G) {
          // la galaxia casi de frente, un poco ladeada: se ven el brazo y el núcleo
          const tilt = new THREE.Vector3().copy(G.u).multiplyScalar(side * 0.55).addScaledVector(G.v, (Math.random() - 0.5) * 0.6);
          dir = tilt.addScaledVector(G.w, 1).normalize();
        } else {
          // desde afuera de la espiral, algo por encima y del lado del presente, mirando hacia su historia
          const out = new THREE.Vector3(P.x, P.y, 0);
          if (out.lengthSq() < 0.5) out.set(side * 0.8, 0.6, 0);
          out.normalize();
          const reverse = shot.type === 'event' && shot.kind !== 'release' && Math.random() < 0.25; // contraplano desde el pasado
          dir = out.multiplyScalar(0.6).add(this.v.set(0, 0.42, reverse ? -0.7 : 0.75)).normalize();
        }
        const target = P.clone();
        let d = G ? G.R * 2.2 + 8 : 12;
        if (shot.kind === 'release') {
          target.y += 3.5; // los fuegos suben: se mira un poco más arriba y desde más lejos
          d = 24;
        } else if (shot.kind === 'pr-merge') {
          const from = g.branchPos(shot.from);
          if (from) {
            target.lerp(from.toV, 0.5);
            d = Math.max(13, from.toV.distanceTo(P) * 1.1 + 8);
          } else d = 16;
        } else if (shot.type === 'tour') {
          d = G ? G.R * 1.6 + 6 : 9.5;
          shot.glide = G ? 0 : -0.7; // la cámara viaja despacio hacia el pasado de la rama (en el espacio, gira)
          shot.spin = side * 0.025;
        }
        if (shot.type === 'event') {
          shot.push = 0.018;
          const name = shot.branch;
          const rel = target.clone().sub(P);
          // si la rama se mueve (llegan commits), el encuadre la acompaña
          shot.track = (out) => {
            const now = g.branchPos(name);
            return now ? out.copy(now.toV).add(rel) : null;
          };
        }
        return { target, cam: target.clone().addScaledVector(dir, d * wide) };
      }

      // el presente (y todo lo que no se pudo encuadrar)
      const target = g.followPoint(new THREE.Vector3());
      const off = g.defaultOffset().applyAxisAngle(this.Y, (Math.random() - 0.5) * 0.9);
      shot.track = (out) => g.followPoint(out);
      shot.spin = side * 0.035;
      return { target, cam: target.clone().add(off) };
    }

    /** Mientras dura el plano la cámara no queda quieta: gira, se acerca o viaja, con arranque suave. */
    drift(s, dt) {
      const g = this.g;
      if (g.fly || g.interacting) return false;
      const c = g.controls;
      const cam = g.camera;
      let moved = false;
      if (s.track) {
        const want = s.track(this.v);
        if (want) {
          const d = want.sub(c.target).multiplyScalar(g.motion ? 1 - Math.exp(-dt * 2.5) : 1);
          if (d.lengthSq() > 1e-8) {
            c.target.add(d);
            cam.position.add(d);
            moved = true;
          }
        }
      }
      if (!g.motion) return moved;
      s.amt = Math.min(1, s.amt + dt / 1.5);
      const k = smooth(s.amt);
      if (s.glide && c.target.z > 0) {
        const dz = s.glide * k * dt;
        c.target.z += dz;
        cam.position.z += dz;
      }
      const off = this.w.copy(cam.position).sub(c.target);
      if (s.spin) off.applyAxisAngle(this.Y, s.spin * k * dt);
      if (s.push) off.setLength(clamp(off.length() * Math.exp(-s.push * k * dt), c.minDistance, c.maxDistance));
      cam.position.copy(c.target).add(off);
      return true;
    }
  }

  Director.SCORE = SCORE;
  GB.Director = Director;
})(window.GB);
