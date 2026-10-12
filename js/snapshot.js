/* Guardar la vista como imagen (PNG): el grafo 3D o 2D tal como se ve en ese momento, con sus
   etiquetas y efectos, y una franja abajo con el repo y la fecha.

   - En 3D, la escena se dibuja y se copia en la misma tarea: WebGL no conserva el cuadro anterior
     (preserveDrawingBuffer apagado, que es lo rápido), así que leerlo más tarde daría un lienzo vacío.
   - En 2D, el SVG se clona con sus estilos ya resueltos (los colores salen de variables CSS que
     fuera de la página no existen) y se pasa a imagen por grupos, en el orden en que se pintan.
   - Los textos se escriben con el canvas de la página y no dentro del SVG: un SVG convertido en
     imagen no puede cargar las fuentes de la página, y saldrían con otras.
   - Las etiquetas HTML (las de la vista 3D, los paneles del modo galaxias, el minimapa) se pintan
     como cajas con fondo, borde y texto. Sombras, desenfoques y degradados no se copian.

   - Grabar el Replay en video (record) repite esa misma captura cuadro a cuadro sobre un canvas
     cuyo flujo (captureStream) graba MediaRecorder: WebM en Chromium y Firefox, MP4 en Safari.

   Nada sale de la página: el PNG y el video se arman en un canvas y se descargan con un enlace blob:. */
(function (GB) {
  'use strict';

  /** Lo que nunca va en la imagen: la ficha de detalle y el fundido de los cortes del director. */
  const SKIP = '.tip, .g3-fade';
  /** Alto de la franja de abajo (repo, fecha y nombre de la app), en px de CSS. */
  const CAPTION = 30;
  /** Lado máximo de la imagen, en píxeles. */
  const MAX_SIDE = 4096;
  /** Lo que se copia de cada elemento del SVG: geometría y pintura, sin animaciones ni transiciones. */
  const SVG_PROPS = [
    'display', 'visibility', 'opacity', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
    'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'transform', 'transform-origin', 'transform-box', 'vector-effect', 'paint-order',
  ];

  /** Un color calculado que el canvas entienda: Chromium da los color-mix() como color(srgb …). */
  function canvasColor(css) {
    const m = /^color\(srgb ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)(?: \/ ([-\d.e]+))?\)$/.exec(css || '');
    if (!m) return css;
    const c = (v) => Math.round(Math.min(1, Math.max(0, +v)) * 255);
    return `rgba(${c(m[1])}, ${c(m[2])}, ${c(m[3])}, ${m[4] ?? 1})`;
  }

  const invisible = (css) => !css || css === 'none' || css === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(css) || /\/\s*0\)$/.test(css);

  /** El fondo que se ve detrás de un elemento: el suyo o el del primer antepasado que lo tenga. */
  function backdrop(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (!invisible(bg)) return canvasColor(bg);
    }
    return canvasColor(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()) || '#0a0f0e';
  }

  const fontOf = (cs, scale = 1) =>
    `${cs.fontStyle} ${cs.fontWeight} ${(parseFloat(cs.fontSize) || 12) * scale}px ${cs.fontFamily}`;

  function caseOf(text, cs) {
    if (cs.textTransform === 'uppercase') return text.toUpperCase();
    if (cs.textTransform === 'lowercase') return text.toLowerCase();
    if (cs.textTransform === 'capitalize') return text.replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase());
    return text;
  }

  /** La primera sombra de texto ("rgb(0, 0, 0) 0px 1px 2px") como sombra del canvas. */
  function textShadow(ctx, css) {
    const m = /^((?:rgba?|color)\([^)]*\)|#\w+|[a-z]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?/.exec(css || '');
    if (!m || css === 'none') return;
    ctx.shadowColor = canvasColor(m[1]);
    ctx.shadowOffsetX = +m[2];
    ctx.shadowOffsetY = +m[3];
    ctx.shadowBlur = +(m[4] || 0);
  }

  function loadImage(svgText) {
    return new Promise((done, fail) => {
      const img = new Image();
      img.onload = () => done(img);
      img.onerror = () => fail(new Error('svg'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
    });
  }

  /* ---------- SVG ---------- */

  /** Escribe un <text> del SVG en el canvas, donde la página lo dibujó. */
  function drawSvgText(ctx, t, origin) {
    const text = t.textContent;
    if (!text.trim() || !t.getClientRects().length) return;
    const cs = getComputedStyle(t);
    if (cs.visibility !== 'visible' || invisible(cs.fill)) return;
    let alpha = (+cs.fillOpacity || 0) * (+cs.opacity || 0);
    for (let n = t.parentElement; n && !(n instanceof SVGSVGElement); n = n.parentElement) alpha *= +getComputedStyle(n).opacity;
    if (alpha <= 0.01) return;
    const ctm = t.getScreenCTM();
    if (!ctm) return;
    let start;
    try {
      start = t.getStartPositionOfChar(0); // ya con text-anchor, dx y dy aplicados
    } catch {
      return;
    }
    const p = new DOMPoint(start.x, start.y).matrixTransform(ctm);
    const scale = Math.hypot(ctm.a, ctm.b) || 1;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = fontOf(cs, scale);
    if ('letterSpacing' in ctx && cs.letterSpacing !== 'normal') ctx.letterSpacing = cs.letterSpacing;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'ltr';
    const x = p.x - origin.left;
    const y = p.y - origin.top;
    const str = caseOf(text, cs);
    const strokeW = parseFloat(cs.strokeWidth) || 0;
    const halo = !invisible(cs.stroke) && strokeW > 0;
    if (halo && /^stroke/.test(cs.paintOrder)) {
      ctx.strokeStyle = canvasColor(cs.stroke);
      ctx.lineWidth = strokeW * scale;
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = canvasColor(cs.fill);
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  /** Pinta un <svg> de la página en el canvas: por tandas de grupos, y los textos de cada tanda encima. */
  async function drawSvg(ctx, svg, origin) {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const clone = svg.cloneNode(true);
    const from = [svg, ...svg.querySelectorAll('*')];
    const to = [clone, ...clone.querySelectorAll('*')];
    from.forEach((src, i) => {
      const cs = getComputedStyle(src);
      to[i].setAttribute('style', SVG_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
    });
    // la opacidad del propio <svg> ya la puso quien lo pinta (globalAlpha)
    clone.style.opacity = '1';
    clone.setAttribute('width', r.width);
    clone.setAttribute('height', r.height);
    // tandas: grupos seguidos sin textos van juntos; un grupo con textos cierra su tanda
    const kids = [...svg.children];
    const copies = [...clone.children];
    for (const t of clone.querySelectorAll('text')) t.remove();
    const head = clone.cloneNode(false);
    const open = new XMLSerializer().serializeToString(head).replace(/\/>$/, '>').replace(/<\/svg>$/, '');
    let batch = [];
    const x = r.left - origin.left;
    const y = r.top - origin.top;
    const flush = async (texts) => {
      if (batch.length) {
        const body = batch.map((n) => new XMLSerializer().serializeToString(n)).join('');
        ctx.drawImage(await loadImage(`${open}${body}</svg>`), x, y, r.width, r.height);
        batch = [];
      }
      for (const t of texts) drawSvgText(ctx, t, origin);
    };
    for (let i = 0; i < kids.length; i++) {
      const own = kids[i] instanceof SVGTextElement;
      if (!own) batch.push(copies[i]);
      const texts = own ? [kids[i]] : [...kids[i].querySelectorAll('text')];
      if (texts.length) await flush(texts);
    }
    await flush([]);
  }

  /* ---------- HTML ---------- */

  function radiusOf(css, w, h) {
    const v = parseFloat(css) || 0;
    return /%$/.test(css) ? (Math.min(w, h) * v) / 100 : v;
  }

  /** Escribe un nodo de texto en el canvas, línea por línea, donde la página lo dibujó. */
  function drawHtmlText(ctx, node, cs, origin, scale) {
    const raw = node.textContent;
    if (!raw.trim()) return;
    const pre = /^pre/.test(cs.whiteSpace);
    const rtl = cs.direction === 'rtl';
    // cada letra va a la línea a cuya altura quedó; de cada línea importa dónde empieza y termina
    // lo que se ve (los espacios del borde pueden no dibujarse, y un texto con partes en las dos
    // direcciones da varias cajas en la misma línea)
    const range = document.createRange();
    const rows = [];
    let row = null;
    for (let i = 0; i < raw.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const q = range.getClientRects()[0];
      if (q && q.width) {
        row = rows.find((w) => Math.abs(w.top - q.top) < w.height / 2);
        if (!row) rows.push((row = { top: q.top, height: q.height, left: Infinity, right: -Infinity, text: '' }));
        if (/\S/.test(raw[i])) {
          row.left = Math.min(row.left, q.left);
          row.right = Math.max(row.right, q.right);
        }
      }
      if (row) row.text += raw[i];
    }
    ctx.save();
    ctx.font = fontOf(cs, scale);
    if ('letterSpacing' in ctx && cs.letterSpacing !== 'normal') ctx.letterSpacing = cs.letterSpacing;
    ctx.fillStyle = canvasColor(cs.color);
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    textShadow(ctx, cs.textShadow);
    for (const w of rows) {
      const str = caseOf(pre ? w.text.replace(/\s+$/, '') : w.text.replace(/\s+/g, ' ').trim(), cs);
      if (!str || w.left > w.right) continue;
      const m = ctx.measureText(str);
      const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
      const desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
      // el texto va centrado en el alto de su letra, como lo pone el navegador
      const y = w.top - origin.top + (w.height - (asc + desc)) / 2 + asc;
      ctx.fillText(str, (rtl ? w.right : w.left) - origin.left, y);
    }
    ctx.restore();
  }

  /** Pinta un elemento HTML y lo que tiene adentro: su caja, sus textos y sus hijos, por z-index. */
  async function drawHtml(ctx, el, origin, skipCanvas) {
    if (el.matches(SKIP) || el.hidden) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity <= 0.01) return;
    const r = el.getBoundingClientRect();
    ctx.save();
    ctx.globalAlpha *= +cs.opacity;
    const x = r.left - origin.left;
    const y = r.top - origin.top;
    if (el instanceof HTMLCanvasElement) {
      if (el !== skipCanvas && r.width && r.height && el.width && el.height) ctx.drawImage(el, x, y, r.width, r.height);
      ctx.restore();
      return;
    }
    if (el instanceof SVGSVGElement) {
      await drawSvg(ctx, el, origin);
      ctx.restore();
      return;
    }
    if (el instanceof HTMLImageElement) {
      // solo imágenes propias: una de otro sitio (un avatar) dejaría el canvas sin poder exportarse
      if (el.complete && el.naturalWidth && /^data:/.test(el.currentSrc || el.src)) ctx.drawImage(el, x, y, r.width, r.height);
      ctx.restore();
      return;
    }
    // escala de las transformaciones CSS (etiquetas que se achican con la distancia)
    const scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const rad = radiusOf(cs.borderTopLeftRadius, r.width, r.height) * scale;
    const box = () => {
      ctx.beginPath();
      if (rad > 0 && ctx.roundRect) ctx.roundRect(x, y, r.width, r.height, Math.min(rad, r.width / 2, r.height / 2));
      else ctx.rect(x, y, r.width, r.height);
    };
    if (r.width && r.height) {
      if (!invisible(cs.backgroundColor)) {
        box();
        ctx.fillStyle = canvasColor(cs.backgroundColor);
        ctx.fill();
      }
      const bw = (parseFloat(cs.borderTopWidth) || 0) * scale;
      if (bw > 0 && cs.borderTopStyle !== 'none' && !invisible(cs.borderTopColor)) {
        ctx.beginPath();
        const h = bw / 2;
        if (rad > 0 && ctx.roundRect) ctx.roundRect(x + h, y + h, r.width - bw, r.height - bw, Math.max(0, Math.min(rad - h, (r.width - bw) / 2, (r.height - bw) / 2)));
        else ctx.rect(x + h, y + h, r.width - bw, r.height - bw);
        ctx.strokeStyle = canvasColor(cs.borderTopColor);
        ctx.lineWidth = bw;
        ctx.stroke();
      }
    }
    // lo que se sale de una caja con overflow escondido no se ve
    if (cs.overflow !== 'visible' && r.width && r.height) {
      box();
      ctx.clip();
    }
    for (const n of el.childNodes) if (n.nodeType === 3) drawHtmlText(ctx, n, cs, origin, scale);
    const kids = [...el.children]
      .map((k, i) => ({ k, i, z: parseInt(getComputedStyle(k).zIndex, 10) || 0 }))
      .sort((a, b) => a.z - b.z || a.i - b.i);
    for (const { k } of kids) await drawHtml(ctx, k, origin, skipCanvas);
    ctx.restore();
  }

  /* ---------- la imagen ---------- */

  /** Arma la imagen de la vista: `wrap` es su contenedor y `view`, el grafo (Graph o Graph3D).
      `scale`: píxeles por px de CSS (si no, los de la escena 3D, o 2× en 2D); `extra`: elementos que
      van encima aunque estén fuera del contenedor (la fecha grande y los rótulos del Replay). */
  async function capture(wrap, view, { caption = '', scale: fixed = 0, extra = [] } = {}) {
    const origin = wrap.getBoundingClientRect();
    const W = Math.round(origin.width);
    const H = Math.round(origin.height);
    if (!W || !H) throw new Error('la vista no está a la vista');
    const gl = view?.renderNow ? view.canvas : null;
    // en 3D, a la resolución con que se dibuja la escena; en 2D, nítida aunque la pantalla no lo sea
    const want = fixed || (gl ? gl.width / W : Math.max(2, window.devicePixelRatio || 1));
    const scale = Math.min(want, MAX_SIDE / W, MAX_SIDE / (H + CAPTION));
    const out = document.createElement('canvas');
    out.width = Math.round(W * scale);
    out.height = Math.round((H + (caption ? CAPTION : 0)) * scale);
    const ctx = out.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = backdrop(wrap);
    ctx.fillRect(0, 0, W, H);
    // la escena 3D se dibuja y se copia ya, antes de cualquier espera
    if (gl) ctx.drawImage(view.renderNow(), 0, 0, W, H);
    const kids = [...wrap.children]
      .map((k, i) => ({ k, i, z: parseInt(getComputedStyle(k).zIndex, 10) || 0 }))
      .sort((a, b) => a.z - b.z || a.i - b.i);
    for (const { k } of kids) await drawHtml(ctx, k, origin, gl);
    for (const el of extra) if (el) await drawHtml(ctx, el, origin, gl);
    if (caption) drawCaption(ctx, wrap, caption, W, H);
    return out;
  }

  function drawCaption(ctx, wrap, text, W, H) {
    const root = getComputedStyle(document.documentElement);
    const css = (v, d) => canvasColor(root.getPropertyValue(v).trim()) || d;
    ctx.fillStyle = css('--surface', '#111816');
    ctx.fillRect(0, H, W, CAPTION);
    ctx.fillStyle = css('--line', '#e0e5e2');
    ctx.fillRect(0, H, W, 1);
    const rtl = GB.i18n?.dir === 'rtl';
    ctx.font = `500 12px ${root.getPropertyValue('--font-ui').trim() || 'sans-serif'}`;
    ctx.fillStyle = css('--ink-2', '#48534f');
    ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillText(text, rtl ? W - 12 : 12, H + CAPTION / 2 + 0.5, W - 24);
  }

  /** Nombre del archivo: graphbranch-owner-repo-2026-10-10-1430.png (o -replay-….webm para un video). */
  function fileName(repo, { ext = 'png', kind = '', now = new Date() } = {}) {
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const slug = String(repo || 'demo').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'demo';
    return `graphbranch-${slug}${kind ? '-' + kind : ''}-${stamp}.${ext}`;
  }

  const toBlob = (canvas) =>
    new Promise((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error('toBlob'))), 'image/png'));

  /** Descarga el archivo con un enlace blob: (en la app de escritorio va a la carpeta de descargas). */
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /** Arma la imagen de la vista y la descarga. Devuelve el nombre del archivo. */
  async function save(wrap, view, { repo, caption } = {}) {
    const name = fileName(repo);
    download(await toBlob(await capture(wrap, view, { caption })), name);
    return name;
  }

  /* ---------- el video ---------- */

  /** El formato de video que este navegador sabe grabar desde un canvas: WebM (Chromium, Firefox) o
      MP4 (Safari); null si no graba ninguno (entonces no se ofrece grabar). */
  function videoFormat() {
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
    const options = [['video/webm;codecs=vp9', 'webm'], ['video/webm;codecs=vp8', 'webm'], ['video/webm', 'webm'], ['video/mp4', 'mp4']];
    for (const [mime, ext] of options) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
    return null;
  }

  /** Los números de EBML (el formato de WebM) tienen largo variable: el primer byte dice cuántos bytes
      ocupan. Devuelve el largo, el valor y si es el "tamaño desconocido" (todos los bits en 1). */
  function ebmlNumber(u8, at) {
    const first = u8[at];
    let len = 1;
    while (len <= 8 && !(first & (0x100 >> len))) len++;
    if (len > 8 || at + len > u8.length) throw new Error('EBML inválido');
    let value = first & (0xff >> len);
    let unknown = value === 0xff >> len;
    for (let i = 1; i < len; i++) {
      value = value * 256 + u8[at + i];
      unknown = unknown && u8[at + i] === 0xff;
    }
    return { len, value, unknown };
  }

  /** Un elemento de EBML que empieza en `at`: su identificador (con su marca, como se escribe), dónde
      empiezan sus datos y dónde termina (el final de `end` si su tamaño es desconocido). */
  function ebmlElement(u8, at, end) {
    const id = ebmlNumber(u8, at);
    let tag = 0;
    for (let i = 0; i < id.len; i++) tag = tag * 256 + u8[at + i];
    const size = ebmlNumber(u8, at + id.len);
    const data = at + id.len + size.len;
    return { tag, size, data, end: size.unknown ? end : data + size.value };
  }

  const EBML_HEADER = 0x1a45dfa3;
  const SEGMENT = 0x18538067;
  const INFO = 0x1549a966;
  const TIMECODE_SCALE = 0x2ad7b1;
  const DURATION = 0x4489;

  /**
   * MediaRecorder escribe el WebM mientras graba y no anota cuánto dura: sin ese dato, muchos
   * reproductores no muestran la duración ni dejan adelantar. Se agrega al bloque Info del segmento
   * (el primero, antes de las pistas y los cuadros). `ms`: la duración en milisegundos. Si el archivo
   * no tiene la forma esperada, o ya trae la duración, vuelve tal cual.
   */
  function webmDuration(bytes, ms) {
    const u8 = new Uint8Array(bytes);
    try {
      const head = ebmlElement(u8, 0, u8.length);
      if (head.tag !== EBML_HEADER) return u8;
      const seg = ebmlElement(u8, head.end, u8.length);
      if (seg.tag !== SEGMENT) return u8;
      for (let at = seg.data; at < seg.end; ) {
        const el = ebmlElement(u8, at, seg.end);
        if (el.tag === INFO && !el.size.unknown) {
          let scale = 1e6; // nanosegundos por unidad de tiempo: 1 ms si no se dice otra cosa
          for (let p = el.data; p < el.end; ) {
            const kid = ebmlElement(u8, p, el.end);
            if (kid.tag === DURATION) return u8;
            if (kid.tag === TIMECODE_SCALE) {
              scale = 0;
              for (let i = kid.data; i < kid.end; i++) scale = scale * 256 + u8[i];
            }
            p = kid.end;
          }
          // Duration: 44 89, tamaño 8 (88) y un float64; Info crece en 11 bytes y su tamaño se
          // reescribe con 8 bytes (01 y siete más), que alcanzan para cualquiera
          const dur = new Uint8Array(11);
          dur.set([0x44, 0x89, 0x88]);
          new DataView(dur.buffer).setFloat64(3, (ms * 1e6) / (scale || 1e6));
          const body = el.end - el.data + dur.length;
          const info = new Uint8Array(4 + 8 + body);
          info.set(u8.subarray(at, at + 4));
          info[4] = 0x01;
          for (let i = 0, v = body; i < 7; i++, v = Math.floor(v / 256)) info[11 - i] = v % 256;
          info.set(u8.subarray(el.data, el.end), 12);
          info.set(dur, 12 + el.end - el.data);
          const out = new Uint8Array(u8.length - (el.end - at) + info.length);
          out.set(u8.subarray(0, at));
          out.set(info, at);
          out.set(u8.subarray(el.end), at + info.length);
          // un segmento de tamaño conocido crece lo mismo (MediaRecorder lo deja desconocido)
          if (!seg.size.unknown) {
            const grown = seg.size.value + info.length - (el.end - at);
            const sizeAt = head.end + ebmlNumber(u8, head.end).len; // el tamaño va tras el identificador
            const len = seg.size.len;
            if (grown >= 2 ** (7 * len) - 1) return u8;
            for (let i = len - 1, v = grown; i >= 0; i--, v = Math.floor(v / 256)) out[sizeAt + i] = v % 256;
            out[sizeAt] |= 0x100 >> len;
          }
          return out;
        }
        if (el.size.unknown) break; // un cuadro sin tamaño: Info ya tendría que haber aparecido
        at = el.end;
      }
    } catch {
      /* no es un WebM que se entienda: va sin tocar */
    }
    return u8;
  }

  /**
   * Graba la vista en video: cada cuadro se arma con el mismo compositor que la imagen y se dibuja en
   * un canvas del que `MediaRecorder` toma la película. `target()` dice qué vista grabar en cada
   * cuadro (se puede cambiar de 3D a 2D en medio). `stop()` resuelve con el archivo.
   */
  function record(target, { caption = '', extra = () => [], fps = 30 } = {}) {
    const format = videoFormat();
    if (!format) throw new Error('este navegador no graba video desde un canvas');
    const first = target().wrap.getBoundingClientRect();
    const out = document.createElement('canvas');
    // a 1 px por px de CSS, en números pares (los códecs de video los piden así)
    out.width = Math.max(2, Math.round(first.width) & ~1);
    out.height = Math.max(2, Math.round(first.height + (caption ? CAPTION : 0)) & ~1);
    const ctx = out.getContext('2d');
    const stream = out.captureStream(fps);
    const rec = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 6e6 });
    const chunks = [];
    rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    let on = true;
    let frames = 0;
    const started = performance.now();
    const frame = async () => {
      if (!on) return;
      try {
        const { wrap, view } = target();
        const img = await capture(wrap, view, { caption, scale: 1, extra: extra() });
        // si la vista cambió de tamaño (pantalla completa), entra entera, sin deformarse
        const k = Math.min(out.width / img.width, out.height / img.height);
        const w = img.width * k;
        const h = img.height * k;
        ctx.fillStyle = backdrop(wrap);
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(img, (out.width - w) / 2, (out.height - h) / 2, w, h);
        frames++;
      } catch (err) {
        console.warn('Un cuadro del video no se pudo armar:', err);
      }
      if (on) requestAnimationFrame(frame);
    };
    rec.start(1000);
    requestAnimationFrame(frame);
    return {
      format,
      get frames() {
        return frames;
      },
      get seconds() {
        return (performance.now() - started) / 1000;
      },
      stop() {
        on = false;
        const ms = performance.now() - started;
        return new Promise((done, fail) => {
          rec.onstop = async () => {
            for (const tr of stream.getTracks()) tr.stop();
            const type = format.mime.split(';')[0];
            const blob = new Blob(chunks, { type });
            if (format.ext !== 'webm') return done(blob);
            done(new Blob([webmDuration(await blob.arrayBuffer(), ms)], { type }));
          };
          rec.onerror = (ev) => fail(ev.error || new Error('MediaRecorder'));
          if (rec.state === 'inactive') rec.onstop();
          else rec.stop();
        });
      },
    };
  }

  GB.snapshot = { capture, save, fileName, download, videoFormat, record, webmDuration, CAPTION };
})(window.GB);
