#!/usr/bin/env node
/* Pruebas de lo que js/snapshot.js arma sin navegador: el nombre de los archivos y la duración que
   se le agrega al WebM que graba MediaRecorder (que no la anota). Los WebM de prueba se arman a mano
   con la misma forma que los de Chrome: cabecera, segmento de tamaño desconocido, Info, pistas y
   cuadros de tamaño desconocido.

     node --test                      todas las pruebas (archivos *.test.mjs)
     node tools/snapshot.test.mjs     solo estas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: { GB: {} } });
vm.runInContext(readFileSync(join(root, 'js', 'snapshot.js'), 'utf8'), ctx, { filename: 'snapshot.js' });
const { fileName, webmDuration } = ctx.window.GB.snapshot;

/* ---------- un WebM a mano ---------- */

const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const uint = (n, bytes) => Array.from({ length: bytes }, (_, i) => Math.floor(n / 256 ** (bytes - 1 - i)) % 256);
/** El tamaño de un elemento con los bytes justos (`len` para forzar más). */
function size(n, len = 0) {
  len ||= [1, 2, 3, 4, 5, 6, 7, 8].find((l) => n < 2 ** (7 * l) - 1);
  const out = uint(n, len);
  out[0] |= 0x100 >> len;
  return out;
}
const UNKNOWN = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const el = (id, payload) => [...id, ...size(payload.length), ...payload];

const ID = {
  header: [0x1a, 0x45, 0xdf, 0xa3],
  segment: [0x18, 0x53, 0x80, 0x67],
  info: [0x15, 0x49, 0xa9, 0x66],
  scale: [0x2a, 0xd7, 0xb1],
  duration: [0x44, 0x89],
  tracks: [0x16, 0x54, 0xae, 0x6b],
  cluster: [0x1f, 0x43, 0xb6, 0x75],
};

function webm({ scale = 1e6, duration = null, segmentSize = null } = {}) {
  const header = el(ID.header, el([0x42, 0x82], ascii('webm')));
  const info = el(ID.info, [
    ...el(ID.scale, uint(scale, 3)),
    ...el([0x4d, 0x80], ascii('Chrome')),
    ...el([0x57, 0x41], ascii('Chrome')),
    ...(duration == null ? [] : el(ID.duration, [...new Uint8Array(new Float64Array([duration]).buffer)].reverse())),
  ]);
  const tracks = el(ID.tracks, el([0xae], [0xd7, 0x81, 0x01]));
  const clusters = [...ID.cluster, ...UNKNOWN, ...el([0xe7], [0]), ...el([0xa3], [0x81, 0, 0, 0x80, 1, 2, 3])];
  const body = [...info, ...tracks, ...clusters];
  const seg = segmentSize === 'known' ? size(body.length, 8) : UNKNOWN;
  return { bytes: Uint8Array.from([...header, ...ID.segment, ...seg, ...body]), tail: Uint8Array.from([...tracks, ...clusters]) };
}

/* ---------- y un lector independiente del de snapshot.js ---------- */

function num(u8, at) {
  let len = 1;
  while (!(u8[at] & (0x100 >> len))) len++;
  let v = u8[at] & (0xff >> len);
  for (let i = 1; i < len; i++) v = v * 256 + u8[at + i];
  return { len, v, unknown: v === 2 ** (7 * len) - 1 };
}
function read(u8, at, end) {
  const idLen = num(u8, at).len;
  const id = [...u8.subarray(at, at + idLen)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sz = num(u8, at + idLen);
  const data = at + idLen + sz.len;
  return { id, data, end: sz.unknown ? end : data + sz.v, unknown: sz.unknown, size: sz.v };
}
/** La duración que dice el archivo (en unidades de su escala), dónde termina Info y el segmento. */
function inspect(u8) {
  const head = read(u8, 0, u8.length);
  assert.equal(head.id, '1a45dfa3');
  const seg = read(u8, head.end, u8.length);
  assert.equal(seg.id, '18538067');
  const info = read(u8, seg.data, seg.end);
  assert.equal(info.id, '1549a966');
  let duration = null;
  for (let p = info.data; p < info.end; ) {
    const kid = read(u8, p, info.end);
    if (kid.id === '4489') duration = new DataView(u8.buffer, u8.byteOffset + kid.data, 8).getFloat64(0);
    p = kid.end;
  }
  return { duration, infoStart: seg.data, infoEnd: info.end, seg };
}

/* ---------- las pruebas ---------- */

test('al WebM de MediaRecorder se le agrega la duración, sin tocar las pistas ni los cuadros', () => {
  const { bytes, tail } = webm();
  const before = inspect(bytes);
  assert.equal(before.duration, null);
  const out = webmDuration(bytes.buffer, 11250.5);
  const { duration, infoEnd, seg } = inspect(out);
  assert.equal(duration, 11250.5);
  assert.ok(seg.unknown, 'el segmento sigue con tamaño desconocido');
  assert.deepEqual([...out.subarray(infoEnd)], [...tail]);
  const head = before.infoStart;
  assert.deepEqual([...out.subarray(0, head)], [...bytes.subarray(0, head)], 'la cabecera y el comienzo del segmento quedan igual');
});

test('la duración va en la escala de tiempo del archivo', () => {
  const { bytes } = webm({ scale: 1000 }); // microsegundos
  assert.equal(inspect(webmDuration(bytes, 2500)).duration, 2500000);
});

test('un segmento de tamaño conocido crece lo mismo que Info', () => {
  const { bytes, tail } = webm({ segmentSize: 'known' });
  const out = webmDuration(bytes, 1000);
  const { duration, infoEnd, seg } = inspect(out);
  assert.equal(duration, 1000);
  assert.equal(seg.end, out.length, 'el tamaño del segmento llega justo al final del archivo');
  assert.deepEqual([...out.subarray(infoEnd)], [...tail]);
});

test('un archivo que ya dice su duración, o que no es un WebM, vuelve tal cual', () => {
  const { bytes } = webm({ duration: 5000 });
  assert.deepEqual([...webmDuration(bytes, 1234)], [...bytes]);
  const mp4 = Uint8Array.from([0, 0, 0, 0x18, ...ascii('ftypmp42'), 0, 0, 0, 0, ...ascii('isommp42')]);
  assert.deepEqual([...webmDuration(mp4, 1000)], [...mp4]);
  const cut = webm().bytes.subarray(0, 52); // cortado en medio de Info
  assert.deepEqual([...webmDuration(cut, 1000)], [...cut]);
  assert.deepEqual([...webmDuration(new Uint8Array(0), 1000)], []);
});

test('los archivos se llaman como el repo, con la fecha, y el video lleva -replay', () => {
  const now = new Date(2026, 9, 12, 8, 5);
  assert.equal(fileName('Owner/Repo', { now }), 'graphbranch-owner-repo-2026-10-12-0805.png');
  assert.equal(fileName('demo', { ext: 'webm', kind: 'replay', now }), 'graphbranch-demo-replay-2026-10-12-0805.webm');
  assert.equal(fileName('gitlab.com/grupo/sub/proyecto', { ext: 'mp4', kind: 'replay', now }), 'graphbranch-gitlab.com-grupo-sub-proyecto-replay-2026-10-12-0805.mp4');
  assert.equal(fileName('', { now }), 'graphbranch-demo-2026-10-12-0805.png');
});
