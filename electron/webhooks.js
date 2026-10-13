/* Avisos a Slack y a Discord desde la app de escritorio: una URL de webhook no acepta llamadas desde
   una página (no manda CORS), así que las hace el proceso principal. La URL es un secreto (quien la
   tiene puede escribir en el canal): se guarda cifrada como un token (electron/token.js, servicios
   'slack' y 'discord') y solo se acepta si es de verdad del servicio, nunca una dirección cualquiera.
   Este archivo no usa Electron: lo prueban tools/webhooks.test.mjs y la e2e de escritorio. */

const SERVICES = ['slack', 'discord'];
const URLS = {
  slack: /^https:\/\/hooks\.slack\.com\/(services|workflows|triggers)\/[\w\-/]{8,200}$/,
  discord: /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d{5,30}\/[\w-]{8,200}$/,
};
const TIMEOUT = 10_000;

/** ¿Es `url` un webhook de `service`? `testPrefix` (solo en pruebas, nunca empaquetada) admite además
    un servidor local. */
function valid(service, url, testPrefix = '') {
  if (!SERVICES.includes(service) || typeof url !== 'string') return false;
  if (testPrefix && url.startsWith(testPrefix)) return true;
  return URLS[service].test(url);
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const link = (v) => (/^https:\/\/[^\s<>|]+$/.test(str(v, 500)) ? v : '');

/** El aviso, con los textos que mandó la página (ya en su idioma): { repo, kind, title, detail, url }. */
function clean(ev = {}) {
  return { repo: str(ev.repo, 100), kind: str(ev.kind, 60), title: str(ev.title, 200), detail: str(ev.detail, 300), url: link(ev.url) };
}

const slackText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); // sin @canal ni enlaces ajenos

/** El cuerpo JSON que cada servicio espera. Un texto de GitHub no puede mencionar a nadie. */
function payload(service, ev) {
  const e = clean(ev);
  if (service === 'slack') {
    const head = [e.repo && `*${slackText(e.repo)}*`, slackText(e.kind)].filter(Boolean).join(' · ');
    const lines = [head, slackText(e.title), e.detail && `_${slackText(e.detail)}_`, e.url && `<${e.url}>`].filter(Boolean);
    return { text: lines.join('\n') };
  }
  const head = [e.repo && `**${e.repo}**`, e.kind].filter(Boolean).join(' · ');
  const lines = [head, e.title, e.detail && `> ${e.detail.replace(/\n/g, ' ')}`, e.url && `<${e.url}>`].filter(Boolean);
  return { content: lines.join('\n').slice(0, 2000), allowed_mentions: { parse: [] } };
}

/** Manda el aviso → { ok, status }. Nunca lleva la URL en un error. */
async function send(service, url, ev, fetchFn, testPrefix = '') {
  if (!valid(service, url, testPrefix)) throw new Error('webhook inválido');
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload(service, ev)),
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch(() => null);
  return { ok: !!res && res.status >= 200 && res.status < 300, status: res ? res.status : 0 };
}

module.exports = { SERVICES, valid, payload, send };
