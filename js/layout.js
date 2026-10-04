/* GraphBranch — layout del grafo.
   Eje X: orden de commits (padres antes que hijos, luego por fecha).
   Eje Y: carriles. Cada rama visible tiene su carril estable mientras exista;
   los commits que solo alcanza una rama ya borrada (fusionada) forman cadenas
   "fantasma" que se acomodan en los huecos libres de los carriles. */
(function (GB) {
  'use strict';
  const { U } = GB;

  const LONG_LIVED = /^(main|master|trunk|develop|development|dev|staging|stage|next|beta|production|prod|release(\/.*)?|releases?\/.*)$/i;
  const COLOR_SLOTS = 8;

  class Layout {
    constructor() {
      this.reset();
    }

    reset() {
      this.slotOf = new Map(); // rama -> carril persistente
      this.colorOf = new Map(); // rama -> color 1..8 (0 = "otras")
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

      /* 3. dueño de cada commit: primero la rama por defecto y las de larga vida */
      const rank = (b) => (b.name === def ? 0 : b.protected || LONG_LIVED.test(b.name) ? 1 : 2);
      const prio = [...heads].sort(
        (a, b) =>
          rank(a) - rank(b) ||
          (this.slotOf.get(a.name) ?? 1e9) - (this.slotOf.get(b.name) ?? 1e9) ||
          (commits.get(a.sha).date || 0) - (commits.get(b.sha).date || 0),
      );
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

      /* 4. carriles persistentes y colores para ramas visibles */
      const live = new Set(heads.map((b) => b.name));
      for (const n of [...this.slotOf.keys()]) if (!live.has(n)) this.slotOf.delete(n);
      for (const n of [...this.colorOf.keys()]) if (!live.has(n)) this.colorOf.delete(n);
      const fresh = heads
        .filter((b) => !this.slotOf.has(b.name))
        .sort((a, b) => rank(a) - rank(b) || (commits.get(b.sha).date || 0) - (commits.get(a.sha).date || 0));
      for (const b of fresh) {
        let slot = 0;
        if (b.name !== def) {
          const used = new Set(this.slotOf.values());
          slot = 1;
          while (used.has(slot)) slot++;
        }
        this.slotOf.set(b.name, slot);
        let color = 0;
        if (b.name === def) color = 1;
        else {
          const usedC = new Set(this.colorOf.values());
          for (let k = 2; k <= COLOR_SLOTS; k++)
            if (!usedC.has(k)) {
              color = k;
              break;
            }
          if (!color && !usedC.has(1) && !live.has(def)) color = 1;
        }
        this.colorOf.set(b.name, color);
      }

      /* 5. ocupación de carriles: ramas hasta el infinito, fantasmas en los huecos */
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

      /* 6. compactar carriles vacíos en filas consecutivas */
      const slots = [...new Set(chainSlot.values())].sort((a, b) => a - b);
      const rowOfSlot = new Map(slots.map((s, i) => [s, i]));
      const rowOfChain = (key) => rowOfSlot.get(chainSlot.get(key));
      const colorOfChain = (key) => {
        const ch = chains.get(key);
        return ch.branch ? 'c' + this.colorOf.get(ch.branch.name) : 'ghost';
      };

      /* 7. nodos, aristas, cabezas */
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
          color: 'c' + this.colorOf.get(b.name),
          chain: 'b:' + b.name,
          movedAt: b.movedAt || 0,
        };
      });

      const ghostLabels = ghosts
        .filter((g) => g.name)
        .map((g) => ({ id: g.key, name: g.name, x: xOf.get(g.newest), row: rowOfChain(g.key), chain: g.key }));

      /* 8. filas para la leyenda */
      const rows = slots.map((slot, row) => {
        const b = heads.find((h) => this.slotOf.get(h.name) === slot);
        return b
          ? { row, id: 'b:' + b.name, name: b.name, color: 'c' + this.colorOf.get(b.name), chain: 'b:' + b.name, ghost: false }
          : { row, id: 'g-row:' + slot, name: 'fusionadas', color: 'ghost', chain: null, ghost: true };
      });

      /* 9. marcas de día para el eje */
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
