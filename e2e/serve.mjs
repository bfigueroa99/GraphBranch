/* Servidor estático mínimo para las pruebas e2e de la web: sirve la carpeta del proyecto como
   lo haría GitHub Pages. Solo para pruebas (playwright.config.mjs lo levanta solo, y la prueba de
   sin conexión levanta uno propio para poder apagarlo).

     node e2e/serve.mjs [puerto]        por defecto, 4173 */
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
  const port = Number(process.argv[2]) || 4173;
  serve(port).then(() => console.log(`http://127.0.0.1:${port}/`));
}
