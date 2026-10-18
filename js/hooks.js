/* GraphBranch — avisos a Slack, Discord y Teams (solo en la app de escritorio): qué eventos de la actividad
   en vivo van a cada webhook. Esto decide y da forma; el envío lo hace el proceso principal
   (electron/webhooks.js), que es quien guarda la URL. No hace ninguna consulta. */
(function (GB) {
  'use strict';

  /** Los eventos que se pueden mandar, cada uno con el tipo de actividad que lo dispara. */
  const EVENTS = ['release', 'merge', 'ci', 'force'];
  const SERVICES = ['slack', 'discord', 'teams'];
  const MAX_PER_BATCH = 5; // más de golpe sería ruido en el canal: pasan los más graves y el resto se descarta

  /** El evento de una actividad, o null. Release, CI en rojo y force-push en la rama por defecto
      (la actividad de CI ya es solo de esa rama) y los merges a ella: un PR fusionado o un commit
      de merge directo. */
  function eventOf(a, defaultBranch) {
    if (!a) return null;
    if (a.kind === 'release') return 'release';
    if (a.kind === 'ci-fail') return 'ci';
    if (!defaultBranch || a.branch !== defaultBranch) return null;
    if (a.kind === 'force') return 'force';
    if (a.kind === 'pr-merge' || a.kind === 'merge') return 'merge';
    return null;
  }

  /** Eventos que cada servicio elige; sin elección guardada, todos. */
  const chosen = (prefs, service) => (Array.isArray(prefs?.[service]) ? prefs[service].filter((e) => EVENTS.includes(e)) : EVENTS);

  /** Qué actividades van a cada servicio → { slack: [a…], discord: [a…], teams: [a…] }. `urls`: los servicios con
      webhook. Un PR fusionado cuenta una vez aunque también llegue su commit de merge. */
  function route(acts, defaultBranch, prefs, urls) {
    const out = { slack: [], discord: [], teams: [] };
    const prMerged = new Set(acts.filter((a) => a.kind === 'pr-merge').map((a) => a.branch));
    const rank = { force: 0, ci: 1, release: 2, merge: 3 };
    for (const service of SERVICES) {
      if (!urls?.[service]) continue;
      const on = new Set(chosen(prefs, service));
      out[service] = acts
        .map((a) => [eventOf(a, defaultBranch), a])
        .filter(([e, a]) => e && on.has(e) && !(a.kind === 'merge' && prMerged.has(a.branch)))
        .sort((x, y) => rank[x[0]] - rank[y[0]])
        .slice(0, MAX_PER_BATCH)
        .map(([, a]) => a);
    }
    return out;
  }

  GB.hooks = { EVENTS, SERVICES, MAX_PER_BATCH, eventOf, chosen, route };
})(window.GB);
