/* GraphBranch — modo vuelo de la vista 3D: moverse libre por el grafo en primera persona, como
   en una nave. Teclado y ratón (WASD para moverse, Q/E para inclinar la nave, Espacio/C para subir
   y bajar, Mayús para acelerar, X para el escáner, J para el hiperimpulsor en el espacio; el puntero
   queda bloqueado y el ratón mira),
   joystick táctil en el celular y mando de juego. Una línea de horizonte junto a la mira muestra
   cuánto está inclinada la nave. La nave gira libre en los tres ejes: el ratón la orienta respecto de
   ella misma, así que inclinada también se mira "hacia arriba" de la nave. En el valle, sin tocar
   Q/E, vuelve sola a nivelarse con el horizonte; en el espacio (modo galaxias) se queda como la
   dejaste. El movimiento tiene inercia, la cámara se ladea un poco en las curvas y el campo de
   visión se abre al acelerar; con "reducir movimiento" no hay ladeo ni cambios de campo de visión
   (la inclinación con Q/E sí, porque la pide quien vuela). Lo usa graph3d.js. */
(function (GB) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SPEED = 9; // unidades por segundo (unos 4 commits)
  const BOOST = 3.2;
  const LOOK = 0.0022; // radianes por píxel de ratón
  const ROLL = 1.9; // rad/s de inclinación con Q/E
  const LEVEL = 1.6; // en el valle, cuán rápido se nivela sola la nave al soltar Q/E
  const DEAD = 0.16; // zona muerta de los sticks
  const AX = new THREE.Vector3(1, 0, 0);
  const AY = new THREE.Vector3(0, 1, 0);
  const AZ = new THREE.Vector3(0, 0, 1);
  const KEYS = {
    KeyW: 'f',
    ArrowUp: 'f',
    KeyS: 'b',
    ArrowDown: 'b',
    KeyA: 'l',
    ArrowLeft: 'l',
    KeyD: 'r',
    ArrowRight: 'r',
    KeyQ: 'rl',
    KeyE: 'rr',
    Space: 'u',
    KeyC: 'd',
    KeyX: 'scan',
    KeyJ: 'jump',
    ShiftLeft: 'boost',
    ShiftRight: 'boost',
  };
  const touchFirst = () => !!window.matchMedia?.('(pointer: coarse)').matches;
  const deadzone = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

  class Flight {
    constructor(g) {
      this.g = g;
      this.on = false;
      this.keys = new Set();
      this.vel = new THREE.Vector3();
      this.want = new THREE.Vector3();
      this.q = new THREE.Quaternion(); // orientación de la nave
      this.dq = new THREE.Quaternion();
      this.fwd = new THREE.Vector3();
      this.right = new THREE.Vector3();
      this.up = new THREE.Vector3(0, 1, 0);
      this.yaw = 0; // rumbo en el plano del suelo, para la brújula y el minimapa
      this.bank = 0; // ladeo de adorno en las curvas (no cambia el rumbo)
      this.rollVel = 0;
      this.levelAt = 0;
      this.look = { x: 0, y: 0 }; // giro pendiente (ratón, arrastre)
      this.stick = { x: 0, y: 0 }; // joystick táctil
      this.rollIn = 0; // botones de inclinar en el celular
      this.baseFov = g.camera.fov;
      this.buildUI();
      this.bind();
    }

    get locked() {
      return document.pointerLockElement === this.g.canvas;
    }

    /* ---------- interfaz: mira, avisos y joystick ---------- */

    buildUI() {
      const ui = (this.ui = document.createElement('div'));
      ui.className = 'fl-ui';
      ui.hidden = true;
      ui.innerHTML = `
        <div class="fl-cross" aria-hidden="true"></div>
        <div class="fl-horizon" aria-hidden="true"></div>
        <p class="fl-prompt"></p>
        <p class="fl-hint"></p>
        <p class="fl-msg" aria-live="polite"></p>
        <div class="fl-stick" aria-hidden="true"><div class="fl-knob"></div></div>
        <div class="fl-roll" aria-hidden="true">
          <button type="button" data-roll="1" tabindex="-1"><svg viewBox="0 0 16 16"><path d="M3.2 9.5a5 5 0 1 0 1.6-5.2M4.6 1.8v2.8h2.8"/></svg></button>
          <button type="button" data-roll="-1" tabindex="-1"><svg viewBox="0 0 16 16"><path d="M12.8 9.5a5 5 0 1 1-1.6-5.2M11.4 1.8v2.8H8.6"/></svg></button>
          <button type="button" data-scan tabindex="-1"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="1.4"/><path d="M4.6 11.4a4.8 4.8 0 0 1 0-6.8M11.4 4.6a4.8 4.8 0 0 1 0 6.8M2.4 13.6a7.9 7.9 0 0 1 0-11.2M13.6 2.4a7.9 7.9 0 0 1 0 11.2"/></svg></button>
          <button type="button" data-jump tabindex="-1"><svg viewBox="0 0 16 16"><path d="M2.5 8h8M8 4.5 11.5 8 8 11.5"/><path d="M13.5 3.5v9"/></svg></button>
        </div>`;
      this.g.wrap.appendChild(ui);
      this.el = {
        prompt: ui.querySelector('.fl-prompt'),
        hint: ui.querySelector('.fl-hint'),
        msg: ui.querySelector('.fl-msg'),
        stick: ui.querySelector('.fl-stick'),
        knob: ui.querySelector('.fl-knob'),
        roll: ui.querySelector('.fl-roll'),
        horizon: ui.querySelector('.fl-horizon'),
      };
      this.relocalize();
    }

    relocalize() {
      const { i18n } = GB;
      this.el.prompt.textContent = i18n.t('fly.lock');
      let hint = i18n.html('fly.hint');
      if (!this.g.galaxy) hint = hint.replace(/<kbd>J<\/kbd>[^·]*·\s*/, ''); // el hiperimpulsor solo existe en el espacio
      this.el.hint.innerHTML = touchFirst() ? GB.U.esc(i18n.t('fly.touch')) : hint;
      this.el.roll.querySelector('[data-jump]').title = i18n.t('galaxy.jump');
    }

    /** Un aviso breve bajo la mira (por ejemplo, que no hay a dónde saltar). */
    say(text) {
      const m = this.el.msg;
      m.textContent = text;
      m.classList.remove('show');
      void m.offsetWidth;
      m.classList.add('show');
    }

    showHint() {
      const h = this.el.hint;
      h.classList.remove('show');
      void h.offsetWidth;
      h.classList.add('show');
    }

    render() {
      this.ui.hidden = !this.on;
      this.ui.classList.toggle('locked', this.locked);
      this.ui.classList.toggle('touch', touchFirst());
    }

    /* ---------- entrar y salir ---------- */

    enter() {
      if (this.on) return;
      const g = this.g;
      g.touch(); // el director de cámara cede el mando
      g.ride = null;
      g.fly = null;
      g.setFollowing(false);
      g.controls.enabled = false;
      // la mirada sigue donde estaba la cámara
      this.q.copy(g.camera.quaternion);
      this.bank = 0;
      this.rollVel = 0;
      this.rollIn = 0;
      this.vel.set(0, 0, 0);
      this.keys.clear();
      this.on = true;
      g.wrap.focus({ preventScroll: true });
      this.render();
      this.showHint();
      g.opts.onFlightChange?.(true);
    }

    exit() {
      if (!this.on) return;
      const g = this.g;
      this.on = false;
      if (this.locked) document.exitPointerLock?.();
      this.keys.clear();
      this.stick.x = this.stick.y = 0;
      this.rollIn = this.rollVel = 0;
      this.vel.set(0, 0, 0);
      // vuelve a orbitar alrededor de lo que se estaba mirando
      const cam = g.camera;
      cam.fov = this.baseFov;
      cam.updateProjectionMatrix();
      this.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
      g.controls.target.copy(cam.position).addScaledVector(this.fwd, 12);
      g.controls.enabled = true;
      g.controls.update();
      g.needsRender = true;
      this.render();
      g.opts.onFlightChange?.(false);
      g.opts.onFlightSpeed?.(0);
    }

    toggle() {
      if (this.on) this.exit();
      else this.enter();
    }

    /* ---------- entradas ---------- */

    bind() {
      const g = this.g;
      const canvas = g.canvas;
      g.wrap.addEventListener('keydown', (ev) => {
        if (!this.on) return;
        if (ev.key === 'Escape' && !this.locked) return this.exit();
        const k = KEYS[ev.code];
        if (!k || ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest?.('.tip')) return;
        ev.preventDefault();
        ev.stopImmediatePropagation(); // las flechas vuelan, no orbitan
        if (k === 'scan') return ev.repeat || g.gx?.pulseScan();
        if (k === 'jump') return ev.repeat || (g.galaxy && g.gx?.jumpAim());
        this.keys.add(k);
      });
      g.wrap.addEventListener('keyup', (ev) => this.keys.delete(KEYS[ev.code]));
      g.wrap.addEventListener('focusout', () => this.keys.clear());

      // ratón: un clic bloquea el puntero (el ratón mira); sin bloqueo, arrastrar también mira
      let drag = null;
      canvas.addEventListener('pointerdown', (ev) => {
        if (!this.on) return;
        if (ev.pointerType === 'mouse' && !this.locked && canvas.requestPointerLock) {
          const r = canvas.requestPointerLock();
          if (r?.catch) r.catch(() => {});
          return;
        }
        if (this.locked) {
          // con el puntero bloqueado, el clic abre el commit (o el planeta) que está bajo la mira
          g.openAt(g.W / 2, g.H / 2);
          return;
        }
        drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
      });
      canvas.addEventListener('pointermove', (ev) => {
        if (!this.on) return;
        if (this.locked) {
          this.look.x += ev.movementX;
          this.look.y += ev.movementY;
        } else if (drag && ev.pointerId === drag.id) {
          this.look.x += (ev.clientX - drag.x) * 1.4;
          this.look.y += (ev.clientY - drag.y) * 1.4;
          drag.x = ev.clientX;
          drag.y = ev.clientY;
        }
      });
      const end = (ev) => drag && ev.pointerId === drag.id && (drag = null);
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      document.addEventListener('pointerlockchange', () => {
        this.render();
        if (this.locked) this.showHint();
      });

      // joystick táctil: arrastrar el botón desde el centro
      const stick = this.el.stick;
      let st = null;
      const move = (ev) => {
        const r = stick.getBoundingClientRect();
        const R = r.width / 2;
        let x = (ev.clientX - (r.left + R)) / R;
        let y = (ev.clientY - (r.top + R)) / R;
        const len = Math.hypot(x, y);
        if (len > 1) (x /= len), (y /= len);
        this.stick.x = x;
        this.stick.y = y;
        this.el.knob.style.transform = `translate(${(x * R * 0.6).toFixed(1)}px,${(y * R * 0.6).toFixed(1)}px)`;
      };
      stick.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        st = ev.pointerId;
        stick.setPointerCapture(ev.pointerId);
        move(ev);
      });
      stick.addEventListener('pointermove', (ev) => ev.pointerId === st && move(ev));
      const release = (ev) => {
        if (ev.pointerId !== st) return;
        st = null;
        this.stick.x = this.stick.y = 0;
        this.el.knob.style.transform = '';
      };
      stick.addEventListener('pointerup', release);
      stick.addEventListener('pointercancel', release);

      // inclinar la nave en el celular: se mantiene pulsado
      const roll = this.el.roll;
      roll.addEventListener('pointerdown', (ev) => {
        if (ev.target.closest('[data-scan]')) return g.gx?.pulseScan();
        if (ev.target.closest('[data-jump]')) return g.gx?.jumpAim();
        const b = ev.target.closest('[data-roll]');
        if (!b) return;
        ev.preventDefault();
        b.setPointerCapture(ev.pointerId);
        this.rollIn = Number(b.dataset.roll);
      });
      const stopRoll = () => (this.rollIn = 0);
      roll.addEventListener('pointerup', stopRoll);
      roll.addEventListener('pointercancel', stopRoll);
    }

    /** Mando de juego: el primero conectado. Start entra o sale del modo vuelo. */
    gamepad() {
      if (!this.g.padSeen) return null;
      const pads = navigator.getGamepads?.() || [];
      for (const p of pads) if (p && p.connected) return p;
      return null;
    }

    /* ---------- cuadro a cuadro ---------- */

    /** Avanza el vuelo. Devuelve true si la cámara cambió. */
    step(dt) {
      const g = this.g;
      const cam = g.camera;
      // en pleno salto hiperespacial la cámara la lleva galaxy.js; la nave sale quieta del túnel
      if (g.gx?.hyper) {
        this.vel.set(0, 0, 0);
        this.level = 0;
        g.opts.onFlightSpeed?.(0);
        return true;
      }
      const k = this.keys;
      const pad = this.gamepad();
      let f = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0) - this.stick.y;
      let s = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0) + this.stick.x;
      let u = (k.has('u') ? 1 : 0) - (k.has('d') ? 1 : 0);
      let r = (k.has('rl') ? 1 : 0) - (k.has('rr') ? 1 : 0) + this.rollIn;
      let boost = k.has('boost');
      if (pad) {
        s += deadzone(pad.axes[0] || 0);
        f -= deadzone(pad.axes[1] || 0);
        this.look.x += deadzone(pad.axes[2] || 0) * 900 * dt;
        this.look.y += deadzone(pad.axes[3] || 0) * 700 * dt;
        u += (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0);
        r += (pad.buttons[4]?.pressed ? 1 : 0) - (pad.buttons[5]?.pressed ? 1 : 0); // LB / RB inclinan
        boost ||= !!(pad.buttons[0]?.pressed || pad.buttons[10]?.pressed);
        const scan = !!pad.buttons[2]?.pressed; // X (o cuadrado): el escáner
        if (scan && !this.padScan) g.gx?.pulseScan();
        this.padScan = scan;
        const jump = !!pad.buttons[3]?.pressed; // Y (o triángulo): el hiperimpulsor
        if (jump && !this.padJump && g.galaxy) g.gx?.jumpAim();
        this.padJump = jump;
      }
      r = clamp(r, -1, 1);
      // quien pilota está usando la cámara: el director (en modo TV) no se la quita
      if (f || s || u || r || boost || this.look.x || this.look.y) g.lastInteract = performance.now();

      // mirar: guiñada y cabeceo respecto de la nave (inclinada, "arriba" es el techo de la nave)
      const q = this.q;
      const yawRate = -this.look.x * LOOK;
      const pitchRate = -this.look.y * LOOK;
      this.look.x = this.look.y = 0;
      if (yawRate) q.multiply(this.dq.setFromAxisAngle(AY, yawRate));
      if (pitchRate) q.multiply(this.dq.setFromAxisAngle(AX, pitchRate));
      // Q/E: inclinar la nave, con inercia (arranca y frena con suavidad)
      this.rollVel += (r * ROLL - this.rollVel) * (1 - Math.exp(-dt * 6));
      if (Math.abs(this.rollVel) < 1e-3 && !r) this.rollVel = 0;
      if (this.rollVel) q.multiply(this.dq.setFromAxisAngle(AZ, this.rollVel * dt));
      this.fwd.set(0, 0, -1).applyQuaternion(q);
      this.right.set(1, 0, 0).applyQuaternion(q);
      this.up.set(0, 1, 0).applyQuaternion(q);
      // en el valle hay horizonte: al soltar Q/E la nave vuelve a nivelarse (en el espacio no hay "arriba")
      let leveled = 0;
      const space = !!g.galaxy;
      if (r) this.levelAt = 0.5;
      else if (this.levelAt > 0) this.levelAt -= dt;
      else if (!space && Math.abs(this.fwd.y) < 0.9) {
        const tilt = Math.atan2(this.right.y, this.up.y); // 0: nivelada; π: de cabeza
        if (Math.abs(tilt) > 1e-3) {
          leveled = -tilt * (1 - Math.exp(-dt * LEVEL));
          q.multiply(this.dq.setFromAxisAngle(AZ, leveled));
          this.right.set(1, 0, 0).applyQuaternion(q);
          this.up.set(0, 1, 0).applyQuaternion(q);
        }
      }
      q.normalize();
      // rumbo en el plano del suelo: mirando casi en vertical, lo da el techo de la nave
      const h = Math.abs(this.fwd.y) > 0.97 ? this.tmpH().copy(this.up).multiplyScalar(this.fwd.y > 0 ? -1 : 1) : this.fwd;
      this.yaw = Math.atan2(-h.x, -h.z);

      // moverse: hacia donde apunta la nave, con inercia
      const scale = clamp(0.6 + g.radius / 14, 0.8, space ? 3.4 : 2.2); // grafos grandes, vuelo más rápido
      // entre los planetas de una galaxia, más despacio: se pasa entre ellos con calma
      const calmK = space && g.gx ? g.gx.nearFactor(cam.position) : 1;
      const speed = SPEED * (boost ? BOOST : 1) * scale * calmK;
      this.want.set(0, 0, 0).addScaledVector(this.fwd, clamp(f, -1, 1)).addScaledVector(this.right, clamp(s, -1, 1)).addScaledVector(this.up, clamp(u, -1, 1));
      if (this.want.lengthSq() > 1) this.want.normalize();
      this.want.multiplyScalar(speed);
      this.vel.lerp(this.want, 1 - Math.exp(-dt * (this.want.lengthSq() ? 5 : 3.5)));
      if (this.vel.lengthSq() < 1e-6) this.vel.set(0, 0, 0);
      cam.position.addScaledVector(this.vel, dt);
      if (space) g.gx?.collide(cam.position, this.vel); // los planetas y los asteroides tampoco se atraviesan
      // el suelo es sólido: se puede rozar, no atravesar
      const floor = g.world ? g.world.heightAt(cam.position.x, cam.position.z) + 1.5 : -Infinity;
      if (cam.position.y < floor) {
        cam.position.y = floor;
        if (this.vel.y < 0) this.vel.y = 0;
      }

      // sensación de vuelo: se ladea un poco en las curvas y el campo de visión se abre a toda velocidad
      const calm = !g.motion;
      const v = this.vel.length();
      const bank = calm ? 0 : clamp((yawRate / Math.max(dt, 1e-3)) * 0.06 + -s * 0.05 * (v / speed), -0.35, 0.35);
      this.bank += (bank - this.bank) * (1 - Math.exp(-dt * 4));
      cam.quaternion.copy(q).multiply(this.dq.setFromAxisAngle(AZ, this.bank));
      const fov = calm ? this.baseFov : this.baseFov + clamp(v / (SPEED * BOOST), 0, 1) * 14;
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 3));
        cam.updateProjectionMatrix();
      }
      g.opts.onFlightSpeed?.(clamp(v / (SPEED * BOOST), 0, 1));
      this.level = clamp(v / (SPEED * BOOST * scale), 0, 1); // para las estelas del espacio
      // horizonte junto a la mira: cuánto está inclinada la nave respecto del "suelo" del mundo
      const tilt = Math.atan2(this.right.y, this.up.y);
      if (Math.abs(tilt - (this.shownTilt ?? 9)) > 0.003) {
        this.shownTilt = tilt;
        this.el.horizon.style.transform = `rotate(${tilt.toFixed(3)}rad)`;
      }

      const moved =
        v > 0 || yawRate !== 0 || pitchRate !== 0 || this.rollVel !== 0 || leveled !== 0 || Math.abs(this.bank) > 1e-4 || Math.abs(cam.fov - fov) > 0.01;
      // la mira elige el commit del centro (el ratón está bloqueado o es táctil)
      if (moved && (this.locked || touchFirst())) g.mouse = { x: g.W / 2, y: g.H / 2, moved: true };
      return moved;
    }

    tmpH() {
      return this._h || (this._h = new THREE.Vector3());
    }
  }

  GB.Flight = Flight;
})(window.GB);
