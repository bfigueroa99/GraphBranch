/* Servidor estático mínimo para las pruebas e2e de la web: sirve la carpeta del proyecto como
   lo haría GitHub Pages. Solo para pruebas (playwright.config.mjs lo levanta solo, y la prueba de
   sin conexión levanta uno propio para poder apagarlo).

     node e2e/serve.mjs [puerto]        por defecto, 4173 (o el de GB_E2E_PORT) */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** El puerto de las e2e web: 4173, o el de GB_E2E_PORT si otra sesión de la misma máquina ya usa ese (dos
    corridas de `npm run test:e2e` a la vez se pisarían: Playwright reutiliza el servidor que encuentra, y la prueba
    de sin conexión, que levanta el suyo en el puerto siguiente, no podría). Un valor que no es un puerto es un
    error, no un 4173 callado. */
export function e2ePort(env = process.env) {
  const v = env.GB_E2E_PORT;
  if (v === undefined || v === '') return 4173;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1024 || n > 65534) throw new Error(`GB_E2E_PORT=${v}: tiene que ser un puerto entre 1024 y 65534 (la prueba de sin conexión usa el siguiente)`);
  return n;
}

/** Sirve la carpeta del proyecto en 127.0.0.1:<port>; resuelve con el servidor ya escuchando. */
export function serve(port) {
  const server = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const file = join(root, path.endsWith(sep) || path === '/' ? join(path, 'index.html') : path);
      if (!file.startsWith(root)) return res.writeHead(403).end();
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((done) => server.listen(port, '127.0.0.1', () => done(server)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2]) || e2ePort();
  serve(port).then(() => console.log(`http://127.0.0.1:${port}/`));
}
