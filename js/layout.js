/* GraphBranch — layout del grafo.
   Eje X: orden de commits (padres antes que hijos, luego por fecha).
   Eje Y: carriles. La rama por defecto va arriba y las demás se ordenan por su
   última actividad (la más reciente primero), así que se reordenan solas en
   cada push; los commits que solo alcanza una rama ya borrada (fusionada)
   forman cadenas "fantasma" que se acomodan en los huecos libres de los carriles. */
(function (GB) {
  'use strict';
  const { U, palette: P } = GB;

  const LONG_LIVED = /^(main|master|trunk|develop|development|dev|staging|stage|next|beta|production|prod|release(\/.*)?|releases?\/.*)$/i;

  class Layout {
    constructor() {
      this.reset();
    }

    reset() {
      this.slotOf = new Map(); // rama -> carril del último cálculo (desempata el orden)
      this.seqOf = new Map(); // rama -> orden de aparición (quién se queda los commits compartidos)
      this.colorOf = new Map(); // rama viva -> color 1, 2, 3… de la paleta (el gris queda para las ramas muertas)
      this.seq = 0;
    }

    compute(data) {
      const { commits, branches, repo } = data;
      const def = repo.defaultBranch;
      const heads = [...branches.values()].filter((b) => commits.has(b.sha));

      /* 1. commits alcanzables desde las ramas visibles */
      const reach = U.reachable(commits, heads.map((b) => b.sha)).set;

      /* 2. orden en X: por fecha, con padres siempre antes que hijos */
      const byDate = [...reach].map((s) => commits.get(s)).sort((a, b) => a.date - b.date || (a.sha < b.sha ? -1 : 1));
      const order = [];
      const placed = new Set();
      for (const start of byDate) {
        if (placed.has(start.sha)) continue;
        const stack = [[start, 0]];
        while (stack.length) {
          const top = stack[stack.length - 1];
          const cur = top[0];
          if (placed.has(cur.sha)) {
            stack.pop();
            continue;
          }
          let descended = false;
          while (top[1] < cur.parents.length) {
            const p = cur.parents[top[1]++];
            if (reach.has(p) && !placed.has(p)) {
              stack.push([commits.get(p), 0]);
              descended = true;
              break;
            }
          }
          if (!descended) {
            placed.add(cur.sha);
            order.push(cur);
            stack.pop();
          }
        }
      }
      const xOf = new Map(order.map((c, i) => [c.sha, i]));

      /* 3. ramas nuevas: orden de aparición, que las acompaña mientras existan */
      const rank = (b) => (b.name === def ? 0 : b.protected || LONG_LIVED.test(b.name) ? 1 : 2);
      const live = new Set(heads.map((b) => b.name));
      for (const m of [this.slotOf, this.seqOf]) for (const n of [...m.keys()]) if (!live.has(n)) m.delete(n);
      const fresh = heads
        .filter((b) => !this.seqOf.has(b.name))
        .sort((a, b) => rank(a) - rank(b) || (commits.get(b.sha).date || 0) - (commits.get(a.sha).date || 0));
      for (const b of fresh) this.seqOf.set(b.name, this.seq++);

      /* 4. dueño de cada commit: primero la rama por defecto y las de larga vida; entre
         las demás, la que apareció antes. No depende del carril, así reordenar las filas
         no cambia la forma del grafo. */
      const prio = [...heads].sort((a, b) => rank(a) - rank(b) || this.seqOf.get(a.name) - this.seqOf.get(b.name));
      const owner = new Map();
      const chains = new Map();
      const claim = (key, sha, branch) => {
        const chain = { key, branch, shas: [] };
        while (sha && reach.has(sha) && !owner.has(sha)) {
          owner.set(sha, key);
          chain.shas.push(sha);
          sha = commits.get(sha).parents[0];
        }
        chains.set(key, chain);
        return chain;
      };
      for (const b of prio) claim('b:' + b.name, b.sha, b);
      for (let i = order.length - 1; i >= 0; i--) {
        const c = order[i];
        if (!owner.has(c.sha)) claim('g:' + c.sha, c.sha, null);
      }

      const children = new Map();
      for (const c of order) for (const p of c.parents) if (reach.has(p)) (children.get(p) || children.set(p, []).get(p)).push(c.sha);

      /* 5. carriles: la rama por defecto arriba y el resto por última actividad
         (commit más nuevo o último movimiento visto, lo que sea más reciente) */
      const activity = (b) => Math.max(commits.get(b.sha).date || 0, b.movedAt || 0);
      const prevSlot = this.slotOf;
      const byActivity = heads
        .filter((b) => b.name !== def)
        .sort(
          (a, b) =>
            activity(b) - activity(a) || (prevSlot.get(a.name) ?? 1e9) - (prevSlot.get(b.name) ?? 1e9) || (a.name < b.name ? -1 : 1),
        );
      this.slotOf = new Map(byActivity.map((b, i) => [b.name, i + 1]));
      if (live.has(def)) this.slotOf.set(def, 0);

      /* ramas muertas: ya fusionadas en la rama por defecto pero que nadie borró. No cuentan las
         de larga vida (develop, release/…), que siguen vivas aunque main las haya absorbido, ni
         las que apuntan justo a la cabeza de la rama por defecto (una rama recién creada). */
      const defHead = heads.find((b) => b.name === def)?.sha;
      const inDef = defHead ? U.reachable(commits, [defHead]).set : new Set();
      const dead = new Set(
        heads
          .filter((b) => b.name !== def && b.sha !== defHead && inDef.has(b.sha) && !(b.protected || LONG_LIVED.test(b.name)))
          .map((b) => b.name),
      );

      /* colores: el gris es solo de lo muerto (ramas fusionadas, borradas o no); toda rama viva
         tiene un color propio de la paleta sin tope (ver palette.js), que conserva mientras
         exista. La rama por defecto toma el 1 y cada rama nueva, el menor que esté libre: así
         las primeras usan los colores validados a mano y las siguientes los generados. */
      const colorOf = new Map();
      const taken = new Set();
      const give = (name, c) => {
        colorOf.set(name, c);
        taken.add(c);
      };
      if (live.has(def)) give(def, 1);
      const active = byActivity.filter((b) => !dead.has(b.name));
      for (const b of active) {
        const c = this.colorOf.get(b.name);
        if (c && !taken.has(c)) give(b.name, c);
      }
      let next = 1;
      for (const b of active) {
        if (colorOf.has(b.name)) continue;
        while (taken.has(next)) next++;
        give(b.name, next);
      }
      this.colorOf = colorOf;
      P.ensure(Math.max(0, ...colorOf.values()));
      const colorOfBranch = (name) => (dead.has(name) ? 'ghost' : 'c' + colorOf.get(name));

      /* 6. ocupación de carriles: ramas hasta el infinito, fantasmas en los huecos */
      const occ = new Map();
      const occupy = (slot, a, b) => (occ.get(slot) || occ.set(slot, []).get(slot)).push([a, b]);
      const fits = (slot, a, b) => !(occ.get(slot) || []).some(([s, e]) => a <= e + 0.6 && s <= b + 0.6);
      const chainSlot = new Map();
      const headInfo = new Map();

      for (const b of heads) {
        const chain = chains.get('b:' + b.name);
        const slot = this.slotOf.get(b.name);
        chainSlot.set(chain.key, slot);
        let start;
        if (chain.shas.length) {
          const oldest = commits.get(chain.shas[chain.shas.length - 1]);
          const p = oldest.parents[0];
          start = p && xOf.has(p) ? xOf.get(p) : xOf.get(oldest.sha);
        } else start = xOf.get(b.sha);
        occupy(slot, start, Infinity);
        headInfo.set(b.name, { own: chain.shas.length > 0, start });
      }

      const ghosts = [...chains.values()].filter((c) => !c.branch);
      for (const g of ghosts) {
        const newest = g.shas[0];
        const oldest = commits.get(g.shas[g.shas.length - 1]);
        const kids = children.get(newest) || [];
        g.end = kids.length ? Math.max(...kids.map((k) => xOf.get(k))) : xOf.get(newest);
        const p = oldest.parents[0];
        g.start = p && xOf.has(p) ? xOf.get(p) : xOf.get(oldest.sha);
        const mergeChild = kids.map((k) => commits.get(k)).find((k) => k.parents[0] !== newest);
        g.name = mergeChild ? U.mergedBranchName(mergeChild.message) : null;
        g.newest = newest;
      }
      ghosts.sort((a, b) => b.end - a.end);
      for (const g of ghosts) {
        let slot = 1;
        while (!fits(slot, g.start, g.end)) slot++;
        occupy(slot, g.start, g.end);
        chainSlot.set(g.key, slot);
      }

      /* 7. compactar carriles vacíos en filas consecutivas */
      const slots = [...new Set(chainSlot.values())].sort((a, b) => a - b);
      const rowOfSlot = new Map(slots.map((s, i) => [s, i]));
      const rowOfChain = (key) => rowOfSlot.get(chainSlot.get(key));
      const colorOfChain = (key) => {
        const ch = chains.get(key);
        return ch.branch ? colorOfBranch(ch.branch.name) : 'ghost';
      };

      /* 8. nodos, aristas, cabezas */
      const headsBySha = new Map();
      for (const b of heads) (headsBySha.get(b.sha) || headsBySha.set(b.sha, []).get(b.sha)).push(b.name);

      const nodes = order.map((c) => {
        const key = owner.get(c.sha);
        return {
          sha: c.sha,
          x: xOf.get(c.sha),
          row: rowOfChain(key),
          chain: key,
          color: colorOfChain(key),
          merge: c.parents.length > 1,
          heads: headsBySha.get(c.sha) || [],
          commit: c,
        };
      });
      const nodeOf = new Map(nodes.map((n) => [n.sha, n]));

      const edges = [];
      for (const n of nodes) {
        n.commit.parents.forEach((p, i) => {
          const pn = nodeOf.get(p);
          if (!pn) {
            if (i === 0) edges.push({ id: n.sha + '<', kind: 'stub', from: null, to: n.sha, color: n.color, chain: n.chain });
            return;
          }
          const kind = i === 0 ? (pn.chain === n.chain ? 'line' : 'fork') : 'merge';
          edges.push({
            id: p + '>' + n.sha,
            kind,
            from: p,
            to: n.sha,
            color: kind === 'merge' ? pn.color : n.color,
            chain: kind === 'merge' ? pn.chain : n.chain,
          });
        });
      }

      const headList = heads.map((b) => {
        const node = nodeOf.get(b.sha);
        const info = headInfo.get(b.name);
        return {
          name: b.name,
          sha: b.sha,
          isDefault: b.name === def,
          protected: !!b.protected,
          x: node.x,
          row: rowOfChain('b:' + b.name),
          own: info.own,
          color: colorOfBranch(b.name),
          chain: 'b:' + b.name,
          movedAt: b.movedAt || 0,
        };
      });

      const ghostLabels = ghosts
        .filter((g) => g.name)
        .map((g) => ({ id: g.key, name: g.name, x: xOf.get(g.newest), row: rowOfChain(g.key), chain: g.key }));

      /* 9. filas para la leyenda */
      const rows = slots.map((slot, row) => {
        const b = heads.find((h) => this.slotOf.get(h.name) === slot);
        return b
          ? { row, id: 'b:' + b.name, name: b.name, color: colorOfBranch(b.name), chain: 'b:' + b.name, ghost: false }
          : { row, id: 'g-row:' + slot, name: 'fusionadas', color: 'ghost', chain: null, ghost: true };
      });

      /* 10. marcas de día para el eje */
      const days = [];
      let prev = null;
      for (const c of order) {
        const k = U.dayKey(c.date);
        if (k !== prev) days.push({ id: k, x: xOf.get(c.sha), time: c.date });
        prev = k;
      }

      return { nodes, nodeOf, edges, heads: headList, ghostLabels, rows, days, maxX: Math.max(0, order.length - 1) };
    }
  }

  GB.Layout = Layout;
})(window.GB);
