/* GraphBranch — modo vuelo de la vista 3D: moverse libre por el grafo en primera persona.
   Teclado y ratón (WASD, Q/E, Mayús para acelerar; el puntero queda bloqueado y el ratón mira),
   joystick táctil en el celular y mando de juego. El movimiento tiene inercia, la cámara se
   inclina en las curvas y el campo de visión se abre al acelerar; con "reducir movimiento" no
   hay inclinación ni cambios de campo de visión. Lo usa graph3d.js. */
(function (GB) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SPEED = 9; // unidades por segundo (unos 4 commits)
  const BOOST = 3.2;
  const LOOK = 0.0022; // radianes por píxel de ratón
  const DEAD = 0.16; // zona muerta de los sticks
  const KEYS = {
    KeyW: 'f',
    ArrowUp: 'f',
    KeyS: 'b',
    ArrowDown: 'b',
    KeyA: 'l',
    ArrowLeft: 'l',
    KeyD: 'r',
    ArrowRight: 'r',
    KeyE: 'u',
    KeyQ: 'd',
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
      this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
      this.fwd = new THREE.Vector3();
      this.right = new THREE.Vector3();
      this.up = new THREE.Vector3(0, 1, 0);
      this.yaw = 0;
      this.pitch = 0;
      this.roll = 0;
      this.look = { x: 0, y: 0 }; // giro pendiente (ratón, arrastre)
      this.stick = { x: 0, y: 0 }; // joystick táctil
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
        <p class="fl-prompt"></p>
        <p class="fl-hint"></p>
        <div class="fl-stick" aria-hidden="true"><div class="fl-knob"></div></div>`;
      this.g.wrap.appendChild(ui);
      this.el = {
        prompt: ui.querySelector('.fl-prompt'),
        hint: ui.querySelector('.fl-hint'),
        stick: ui.querySelector('.fl-stick'),
        knob: ui.querySelector('.fl-knob'),
      };
      this.relocalize();
    }

    relocalize() {
      const { i18n } = GB;
      this.el.prompt.textContent = i18n.t('fly.lock');
      this.el.hint.innerHTML = touchFirst() ? GB.U.esc(i18n.t('fly.touch')) : i18n.html('fly.hint');
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
      g.ride = null;
      g.fly = null;
      g.setFollowing(false);
      g.controls.enabled = false;
      // la mirada sigue donde estaba la cámara
      this.euler.setFromQuaternion(g.camera.quaternion, 'YXZ');
      this.yaw = this.euler.y;
      this.pitch = this.euler.x;
      this.roll = 0;
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
          // con el puntero bloqueado, el clic abre el commit que está bajo la mira
          const sha = g.pick(g.W / 2, g.H / 2);
          if (sha) g.showTip(sha, true);
          else g.unpin();
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
      const k = this.keys;
      const pad = this.gamepad();
      let f = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0) - this.stick.y;
      let s = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0) + this.stick.x;
      let u = (k.has('u') ? 1 : 0) - (k.has('d') ? 1 : 0);
      let boost = k.has('boost');
      if (pad) {
        s += deadzone(pad.axes[0] || 0);
        f -= deadzone(pad.axes[1] || 0);
        this.look.x += deadzone(pad.axes[2] || 0) * 900 * dt;
        this.look.y += deadzone(pad.axes[3] || 0) * 700 * dt;
        u += (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0);
        boost ||= !!(pad.buttons[0]?.pressed || pad.buttons[10]?.pressed);
      }

      // mirar: guiñada y cabeceo (sin dar la vuelta por arriba)
      const yawRate = -this.look.x * LOOK;
      this.yaw += yawRate;
      this.pitchMoved = this.look.y !== 0;
      this.pitch = clamp(this.pitch - this.look.y * LOOK, -1.45, 1.45);
      this.look.x = this.look.y = 0;

      // moverse: hacia donde se mira, con inercia
      this.fwd.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const speed = SPEED * (boost ? BOOST : 1) * clamp(0.6 + g.radius / 14, 0.8, 2.2); // grafos grandes, vuelo más rápido
      this.want.set(0, 0, 0).addScaledVector(this.fwd, clamp(f, -1, 1)).addScaledVector(this.right, clamp(s, -1, 1)).addScaledVector(this.up, clamp(u, -1, 1));
      if (this.want.lengthSq() > 1) this.want.normalize();
      this.want.multiplyScalar(speed);
      this.vel.lerp(this.want, 1 - Math.exp(-dt * (this.want.lengthSq() ? 5 : 3.5)));
      if (this.vel.lengthSq() < 1e-6) this.vel.set(0, 0, 0);
      cam.position.addScaledVector(this.vel, dt);
      // el suelo es sólido: se puede rozar, no atravesar
      const floor = g.world ? g.world.heightAt(cam.position.x, cam.position.z) + 1.5 : -Infinity;
      if (cam.position.y < floor) {
        cam.position.y = floor;
        if (this.vel.y < 0) this.vel.y = 0;
      }

      // sensación de vuelo: se inclina en las curvas y el campo de visión se abre a toda velocidad
      const calm = !g.motion;
      const v = this.vel.length();
      const roll = calm ? 0 : clamp((yawRate / Math.max(dt, 1e-3)) * 0.06 + -s * 0.05 * (v / speed), -0.35, 0.35);
      this.roll += (roll - this.roll) * (1 - Math.exp(-dt * 4));
      this.euler.set(this.pitch, this.yaw, this.roll, 'YXZ');
      cam.quaternion.setFromEuler(this.euler);
      const fov = calm ? this.baseFov : this.baseFov + clamp(v / (SPEED * BOOST), 0, 1) * 14;
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 3));
        cam.updateProjectionMatrix();
      }
      g.opts.onFlightSpeed?.(clamp(v / (SPEED * BOOST), 0, 1));

      const moved = v > 0 || yawRate !== 0 || this.pitchMoved || Math.abs(this.roll) > 1e-4 || Math.abs(cam.fov - fov) > 0.01;
      this.pitchMoved = false;
      // la mira elige el commit del centro (el ratón está bloqueado o es táctil)
      if (moved && (this.locked || touchFirst())) g.mouse = { x: g.W / 2, y: g.H / 2, moved: true };
      return moved;
    }
  }

  GB.Flight = Flight;
})(window.GB);
