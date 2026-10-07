/* GraphBranch — internacionalización.

   - Los textos viven en js/locales/<código>.js (uno por idioma). El inglés es la
     base y el respaldo: lo que falte en un idioma se muestra en inglés.
   - El idioma sale de ?lang=, de la elección guardada o del navegador, en ese orden.
   - Fechas, números, "hace 5 min", "hoy"/"ayer" y los plurales salen de Intl, así que
     funcionan en cualquier idioma que el navegador conozca, también sin traducción.
   - Para agregar un idioma: crea js/locales/<código>.js y súmalo a LOCALES.

   Scripts clásicos (sin módulos) para que index.html funcione también desde file://. */
window.GB = window.GB || {};

(function (GB) {
  'use strict';

  /** Idiomas con traducción. `name` es el nombre en el propio idioma (autónimo). */
  const LOCALES = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'zh-Hans', name: '简体中文' },
    { code: 'zh-Hant', name: '繁體中文' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'ar', name: 'العربية', rtl: true },
    { code: 'pt', name: 'Português' },
    { code: 'bn', name: 'বাংলা' },
    { code: 'ru', name: 'Русский' },
    { code: 'ja', name: '日本語' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'ko', name: '한국어' },
    { code: 'it', name: 'Italiano' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'ms', name: 'Bahasa Melayu' },
    { code: 'fil', name: 'Filipino' },
    { code: 'th', name: 'ไทย' },
    { code: 'fa', name: 'فارسی', rtl: true },
    { code: 'ur', name: 'اردو', rtl: true },
    { code: 'he', name: 'עברית', rtl: true },
    { code: 'ta', name: 'தமிழ்' },
    { code: 'sw', name: 'Kiswahili' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'pl', name: 'Polski' },
    { code: 'uk', name: 'Українська' },
    { code: 'cs', name: 'Čeština' },
    { code: 'sk', name: 'Slovenčina' },
    { code: 'hu', name: 'Magyar' },
    { code: 'ro', name: 'Română' },
    { code: 'bg', name: 'Български' },
    { code: 'hr', name: 'Hrvatski' },
    { code: 'el', name: 'Ελληνικά' },
    { code: 'sv', name: 'Svenska' },
    { code: 'da', name: 'Dansk' },
    { code: 'nb', name: 'Norsk bokmål' },
    { code: 'fi', name: 'Suomi' },
    { code: 'ca', name: 'Català' },
  ];
  const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));
  const FALLBACK = 'en';
  const STORE_KEY = 'graphbranch:lang';
  const LOAD_TIMEOUT = 4000;

  /** Códigos antiguos o regionales que apuntan a un idioma de la lista. */
  const ALIAS = { iw: 'he', in: 'id', no: 'nb', nn: 'nb', tl: 'fil', mo: 'ro', sh: 'hr' };

  const dicts = {};
  const loading = new Map();
  const listeners = [];
  const cache = new Map();
  let locale = FALLBACK;

  // carpeta de los idiomas, relativa a este script (funciona también bajo file://)
  const localesUrl = (() => {
    try {
      return new URL('locales/', document.currentScript.src).href;
    } catch {
      return 'js/locales/';
    }
  })();

  /* ---------- elección del idioma ---------- */

  /** Convierte una etiqueta BCP 47 (p. ej. "pt-BR", "zh-TW") en un idioma de la lista, o null. */
  function resolve(tag) {
    const parts = String(tag || '').replace(/_/g, '-').split('-').filter(Boolean);
    if (!parts.length) return null;
    const lang = parts[0].toLowerCase();
    if (lang === 'zh') {
      const script = parts.find((p) => /^[A-Za-z]{4}$/.test(p));
      const region = parts.slice(1).find((p) => /^([A-Za-z]{2}|\d{3})$/.test(p));
      const trad = script ? /^hant$/i.test(script) : /^(TW|HK|MO)$/i.test(region || '');
      return trad ? 'zh-Hant' : 'zh-Hans';
    }
    const code = ALIAS[lang] || lang;
    return BY_CODE.has(code) ? code : null;
  }

  function readStored() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_KEY));
      return BY_CODE.has(v) ? v : null;
    } catch {
      return null;
    }
  }

  function writeStored(code) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(code));
    } catch {
      /* sin almacenamiento: la app funciona igual */
    }
  }

  function detect() {
    let fromUrl = null;
    try {
      fromUrl = resolve(new URLSearchParams(location.search).get('lang'));
    } catch {
      /* sin query string */
    }
    if (fromUrl) return fromUrl;
    const stored = readStored();
    if (stored) return stored;
    const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || [];
    for (const tag of prefs) {
      const code = resolve(tag);
      if (code) return code;
    }
    return FALLBACK;
  }

  /* ---------- carga de diccionarios ---------- */

  function define(code, dict) {
    dicts[code] = dict;
  }

  /** Carga js/locales/<código>.js. Resuelve true si quedó disponible. */
  function load(code) {
    if (dicts[code]) return Promise.resolve(true);
    if (loading.has(code)) return loading.get(code);
    const p = new Promise((done) => {
      const s = document.createElement('script');
      const finish = (ok) => {
        clearTimeout(timer);
        s.onload = s.onerror = null;
        loading.delete(code);
        done(ok && !!dicts[code]);
      };
      const timer = setTimeout(() => finish(false), LOAD_TIMEOUT);
      s.onload = () => finish(true);
      s.onerror = () => finish(false);
      s.src = `${localesUrl}${code}.js`;
      document.head.appendChild(s);
    });
    loading.set(code, p);
    return p;
  }

  /* ---------- traducción ---------- */

  const pluralRules = (loc) => {
    const k = 'pr:' + loc;
    if (!cache.has(k)) cache.set(k, new Intl.PluralRules(loc));
    return cache.get(k);
  };

  /** Busca la clave en el idioma actual y, si falta, en inglés. Devuelve el valor y el idioma que lo aportó. */
  function lookup(key) {
    const own = dicts[locale] && dicts[locale][key];
    if (own !== undefined) return { value: own, loc: locale };
    const base = dicts[FALLBACK] && dicts[FALLBACK][key];
    if (base !== undefined) return { value: base, loc: FALLBACK };
    return null;
  }

  const escapeHTML = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /** Aplica plural y {parámetros}. Para plurales, `n` decide la forma y se muestra con el formato del idioma. */
  function format(found, params, escape) {
    let v = found.value;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const n = Number(params && params.n);
      v = v[pluralRules(found.loc).select(Number.isFinite(n) ? n : 1)] ?? v.other;
    }
    return String(v).replace(/\{(\w+)\}/g, (m, name) => {
      if (!params || !(name in params)) return m;
      const val = name === 'n' && typeof params.n === 'number' ? fmtNum(params.n) : params[name];
      return escape ? escape(val) : String(val);
    });
  }

  /** Texto traducido (sin HTML). Si no existe la clave, devuelve la clave. */
  function t(key, params) {
    const found = lookup(key);
    return found ? format(found, params) : key;
  }

  /** Igual que t(), pero la plantilla es HTML de confianza (<em>, <code>…) y los parámetros se escapan. */
  function html(key, params) {
    const found = lookup(key);
    return found ? format(found, params, escapeHTML) : escapeHTML(key);
  }

  /** Lista de textos (p. ej. mensajes de ejemplo). */
  function list(key) {
    const found = lookup(key);
    return found && Array.isArray(found.value) ? found.value : [];
  }

  const has = (key) => lookup(key) !== null;

  /** Mensaje diferido: se traduce al mostrarlo, así cambiar de idioma lo actualiza. */
  const msg = (key, params) => ({ $i18n: key, params });
  const text = (m) => (m && typeof m === 'object' && m.$i18n ? t(m.$i18n, m.params) : m == null ? '' : String(m));

  /* ---------- formatos según el idioma (Intl) ---------- */

  function intl(kind, opts) {
    const k = `${kind}:${locale}:${JSON.stringify(opts || {})}`;
    if (!cache.has(k)) {
      try {
        cache.set(k, new Intl[kind](locale, opts));
      } catch {
        cache.set(k, new Intl[kind](FALLBACK, opts));
      }
    }
    return cache.get(k);
  }

  const fmtNum = (n) => intl('NumberFormat').format(Number(n));
  const fmtDate = (ms) => intl('DateTimeFormat', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
  const fmtDateTime = (ms) => intl('DateTimeFormat', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
  const fmtTime = (ms) => intl('DateTimeFormat', { hour: '2-digit', minute: '2-digit' }).format(ms);
  const fmtWeekdayDate = (ms) => intl('DateTimeFormat', { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
  const fmtSeconds = (s) => intl('NumberFormat', { style: 'unit', unit: 'second', unitDisplay: 'narrow' }).format(s);
  const fmtUnit = (n, unit) => intl('NumberFormat', { style: 'unit', unit, unitDisplay: 'short' }).format(n);

  /** "ahora", "hace 5 min", "5 minutes ago", "5分前"…; pasado un mes, la fecha. */
  function timeAgo(ms, now = Date.now()) {
    if (!ms) return '';
    const rel = intl('RelativeTimeFormat', { numeric: 'always', style: 'short' });
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 5) return intl('RelativeTimeFormat', { numeric: 'auto', style: 'short' }).format(0, 'second');
    if (s < 60) return rel.format(-s, 'second');
    const m = Math.round(s / 60);
    if (m < 60) return rel.format(-m, 'minute');
    const h = Math.round(m / 60);
    if (h < 24) return rel.format(-h, 'hour');
    const d = Math.round(h / 24);
    if (d < 30) return rel.format(-d, 'day');
    return fmtDate(ms);
  }

  /** Etiqueta de un día en los ejes: "hoy", "ayer" o "lun, 3 oct". */
  function dayLabel(ms) {
    const key = (time) => {
      const d = new Date(time);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    const k = key(ms);
    const auto = () => intl('RelativeTimeFormat', { numeric: 'auto' });
    if (k === key(Date.now())) return auto().format(0, 'day');
    if (k === key(Date.now() - 864e5)) return auto().format(-1, 'day');
    return fmtWeekdayDate(ms);
  }

  /* ---------- DOM estático ---------- */

  /** Traduce los elementos con data-i18n (texto), data-i18n-html (HTML) y data-i18n-attr ("atributo:clave;…"). */
  function apply(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = html(el.dataset.i18nHtml);
    for (const el of root.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of el.dataset.i18nAttr.split(';')) {
        const i = pair.indexOf(':');
        if (i > 0) el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      }
    }
  }

  function setDocument() {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = BY_CODE.get(locale)?.rtl ? 'rtl' : 'ltr';
    root.dataset.lang = locale; // también destapa la interfaz (ver styles.css)
  }

  /** Cambia el idioma: carga su diccionario, actualiza el documento y avisa a quien escuche. */
  async function setLocale(code, { persist = true } = {}) {
    const next = BY_CODE.has(code) ? code : FALLBACK;
    await Promise.all([load(FALLBACK), load(next)]);
    locale = dicts[next] ? next : FALLBACK;
    if (persist) writeStored(locale);
    setDocument();
    apply();
    for (const fn of listeners) {
      try {
        fn(locale);
      } catch (err) {
        console.error(err);
      }
    }
    return locale;
  }

  const onChange = (fn) => listeners.push(fn);

  /* ---------- arranque ---------- */

  const initial = detect();
  locale = initial;
  const ready = Promise.all([load(FALLBACK), load(initial)]).then(() => {
    locale = dicts[initial] ? initial : FALLBACK;
    setDocument();
    apply();
  });
  // si algo se cuelga, no dejes la interfaz oculta para siempre
  setTimeout(() => {
    if (!document.documentElement.dataset.lang) setDocument();
  }, LOAD_TIMEOUT + 500);

  GB.i18n = {
    locales: LOCALES,
    ready,
    define,
    load,
    setLocale,
    onChange,
    apply,
    resolve,
    t,
    html,
    list,
    has,
    msg,
    text,
    fmtNum,
    fmtDate,
    fmtDateTime,
    fmtTime,
    fmtSeconds,
    fmtUnit,
    timeAgo,
    dayLabel,
    get locale() {
      return locale;
    },
    get dir() {
      return BY_CODE.get(locale)?.rtl ? 'rtl' : 'ltr';
    },
  };
})(window.GB);
