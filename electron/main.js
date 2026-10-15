/* Proceso principal de la app de escritorio: abre la misma página que se publica en la web.

   La página se sirve con un protocolo propio (app://graphbranch/) en vez de file://, así tiene un
   origen fijo: el CSP de index.html ('self') funciona igual que en la web, localStorage queda
   aparte del resto del sistema y el contexto es seguro (notificaciones, Wake Lock).

     npm start                         abre la demo o los repositorios que se seguían
     npm start -- --repo=owner/repo    abre ese repositorio (repetido, sigue varios)
     npm start -- --local=/ruta/repo   sigue un repositorio de esta máquina, sin GitHub (repetido, varios)
     npm start -- --api-url=https://host/api/v3   los repos de GitHub salen de un GitHub Enterprise Server
     npm start -- --gitlab-url=https://host   los proyectos de GitLab salen de un GitLab propio
     npm start -- --forge-url=https://host    se pueden seguir repos de un Forgejo o Gitea propio (forgejo:dueño/repo)
     npm start -- --tv                 entra en modo TV (también --lang=es)

   Cerrar la ventana la esconde en la bandeja del sistema (electron/tray.js) y la app sigue
   revisando los repositorios; para salir del todo está "Salir" en el menú del ícono. */
const { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const local = require('./git');
const token = require('./token');
const webhooks = require('./webhooks');
const tray = require('./tray');

const SCHEME = 'app';
const HOST = 'graphbranch';
const ORIGIN = `${SCHEME}://${HOST}`;
const ROOT = path.join(__dirname, '..');
/** Lo único que se sirve de la carpeta del proyecto: la página, sus estilos y scripts, y las librerías y fuentes. */
const PUBLIC = new Set(['index.html', 'css', 'js', 'vendor']);
/** Permisos que la página usa; los demás se niegan. */
const PERMISSIONS = new Set(['notifications', 'fullscreen', 'pointerLock', 'screen-wake-lock']);
/** Fondo de la ventana mientras carga, igual al --bg de css/styles.css, para que no destelle en blanco. */
const BG = { light: '#eef1ef', dark: '#0a0f0e' };

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
// Con la ventana oculta o minimizada, Chromium espacia los temporizadores de la página a uno por minuto
// después de 5 minutos; así la vista seguiría al día solo cada minuto. Sin esa regla (IntensiveWakeUpThrottling)
// se siguen espaciando a uno por segundo, y la página sigue sabiendo que está oculta: no dibuja y avisa.
app.commandLine.appendSwitch('disable-features', 'IntensiveWakeUpThrottling');
// En Windows, las notificaciones del sistema necesitan el mismo id que el instalador (build.appId en package.json).
if (process.platform === 'win32') app.setAppUserModelId('io.github.bfigueroa99.graphbranch');

/** Responde app://graphbranch/... con el archivo del proyecto, sin salir de PUBLIC. */
async function serve(request) {
  const notFound = () => new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  let rel;
  try {
    rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '') || 'index.html';
  } catch {
    return notFound();
  }
  const file = path.join(ROOT, rel);
  if (url.host !== HOST || !PUBLIC.has(rel.split(/[/\\]/)[0]) || path.relative(ROOT, file).startsWith('..')) return notFound();
  const res = await net.fetch(pathToFileURL(file).toString());
  // con --api-url, --gitlab-url o --forge-url, el host elegido por quien abre la app entra en el CSP (y solo él)
  if (rel === 'index.html' && (API_ARG || GITLAB_ARG || FORGE_ARG)) {
    let html = await res.text();
    if (API_ARG) html = html.replace('connect-src https://api.github.com', `connect-src https://api.github.com ${API_ARG.origin}`);
    const gl = GITLAB_ARG ? ` ${GITLAB_ARG.origin}` : '';
    const fg = FORGE_ARG ? ` ${FORGE_ARG.origin}` : '';
    if (GITLAB_ARG || FORGE_ARG) {
      html = html.replace('https://gitlab.com https://codeberg.org https://api.bitbucket.org;', `https://gitlab.com${gl} https://codeberg.org${fg} https://api.bitbucket.org;`);
      html = html.replace('img-src \'self\' data: https://avatars.githubusercontent.com https://gitlab.com https://codeberg.org;', `img-src 'self' data: https://avatars.githubusercontent.com https://gitlab.com${gl} https://codeberg.org${fg};`);
    }
    return new Response(html, { status: res.status, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return res;
}

/** --api-url=https://host/api/v3: la dirección de la API de un GitHub Enterprise Server. Solo https y sin
    usuario; otra cosa se ignora. Es lo único que se suma a connect-src del CSP de la página (ver serve). */
function apiUrlArg(argv) {
  for (const arg of argv) {
    const m = /^--api-url=(.+)$/.exec(arg);
    if (!m) continue;
    try {
      const u = new URL(m[1]);
      if (u.protocol === 'https:' && !u.username && !u.password) return { url: (u.origin + u.pathname).replace(/\/+$/, ''), origin: u.origin };
    } catch {
      /* no es una URL: se ignora */
    }
    console.error(`--api-url=${m[1]}: tiene que ser una URL https`);
  }
  return null;
}
const API_ARG = apiUrlArg(process.argv);

/** --gitlab-url=https://host: la dirección de un GitLab propio. Mismas reglas que --api-url. */
function gitlabUrlArg(argv) {
  for (const arg of argv) {
    const m = /^--gitlab-url=(.+)$/.exec(arg);
    if (!m) continue;
    try {
      const u = new URL(m[1]);
      if (u.protocol === 'https:' && !u.username && !u.password) return { url: (u.origin + u.pathname).replace(/\/+$/, ''), origin: u.origin };
    } catch {
      /* no es una URL: se ignora */
    }
    console.error(`--gitlab-url=${m[1]}: tiene que ser una URL https`);
  }
  return null;
}
const GITLAB_ARG = gitlabUrlArg(process.argv);

/** --forge-url=https://host: la dirección de un Forgejo o Gitea propio. Mismas reglas que --gitlab-url. */
function forgeUrlArg(argv) {
  for (const arg of argv) {
    const m = /^--forge-url=(.+)$/.exec(arg);
    if (!m) continue;
    try {
      const u = new URL(m[1]);
      if (u.protocol === 'https:' && !u.username && !u.password) return { url: (u.origin + u.pathname).replace(/\/+$/, ''), origin: u.origin };
    } catch {
      /* no es una URL: se ignora */
    }
    console.error(`--forge-url=${m[1]}: tiene que ser una URL https`);
  }
  return null;
}
const FORGE_ARG = forgeUrlArg(process.argv);

/** Los argumentos --repo, --api-url, --gitlab-url, --forge-url, --tv y --lang pasan a la página como en la web (?repo=, ?tv=1, ?lang=).
    --repo se puede repetir para seguir varios repos (el primero queda a la vista). */
function startUrl(argv, locals = []) {
  const url = new URL(`${ORIGIN}/index.html`);
  for (const r of locals) url.searchParams.append('repo', `local:${r.id}/${r.name}`);
  for (const arg of argv) {
    const m = /^--(repo|lang|api-url|gitlab-url|forge-url)=(.+)$/.exec(arg);
    if (m && (m[1] === 'api-url' || m[1] === 'gitlab-url' || m[1] === 'forge-url')) continue; // va validado, abajo
    if (m) url.searchParams[m[1] === 'repo' ? 'append' : 'set'](m[1], m[2]);
    else if (arg === '--tv') url.searchParams.set('tv', '1');
  }
  if (API_ARG) url.searchParams.set('api', API_ARG.url);
  if (GITLAB_ARG) url.searchParams.set('gitlab', GITLAB_ARG.url);
  if (FORGE_ARG) url.searchParams.set('forge', FORGE_ARG.url);
  return url.toString();
}

/** Node no sabe que app: es un esquema estándar (su URL.origin da 'null'): se compara esquema y host. */
const isApp = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === SCHEME + ':' && u.host === HOST;
  } catch {
    return false;
  }
};

/** Los enlaces a GitHub (commits, PRs, archivos) se abren en el navegador del sistema. */
function openOutside(url) {
  try {
    if (new URL(url).protocol === 'https:') shell.openExternal(url);
  } catch {
    /* URL inválida: se ignora */
  }
}

/** Las imágenes y los videos que guarda la página (Guardar imagen y grabar el Replay, js/snapshot.js)
    van a la carpeta de descargas sin preguntar, como en un navegador, y sin pisar otro con el mismo
    nombre. Cualquier otra descarga se cancela: la página no tiene por qué bajar nada más. */
function saveDownload(ev, item) {
  const name = item.getFilename();
  if (!item.getURL().startsWith(`blob:${ORIGIN}/`) || !/^[\w.-]+\.(png|webm|mp4)$/.test(name)) return item.cancel();
  const dir = app.getPath('downloads');
  const ext = path.extname(name);
  let file = path.join(dir, name);
  for (let i = 1; fs.existsSync(file); i++) file = path.join(dir, `${path.basename(name, ext)} (${i})${ext}`);
  item.setSavePath(file);
}

let win = null;
/** Carpetas vigiladas por la página: id -> { stop, n } (cuántas fuentes la miran). Cada cambio llega como 'git:changed'. */
const watching = new Map();
function watchRepo(id) {
  const w = watching.get(id);
  if (w) return void w.n++;
  watching.set(id, { n: 1, stop: local.watch(id, (changed) => win?.webContents.send('git:changed', changed)) });
}
function unwatchRepo(id) {
  const w = watching.get(id);
  if (w && --w.n <= 0) {
    w.stop();
    watching.delete(id);
  }
}
/** Mientras no se pide salir (menú del ícono, Cmd+Q, apagar el equipo), cerrar la ventana solo la esconde. */
let quitting = false;

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Los --local=carpeta de la línea de comandos: quien abre la app con ellos las eligió; las que no son un repo se saltan. */
async function localArgs(argv) {
  const out = [];
  for (const arg of argv) {
    const m = /^--local=(.+)$/.exec(arg);
    if (!m) continue;
    try {
      out.push(await local.allow(m[1]));
    } catch (err) {
      console.error(`--local=${m[1]}: ${err.message}`);
    }
  }
  return out;
}

async function createWindow() {
  const locals = await localArgs(process.argv);
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? BG.dark : BG.light,
    icon: process.platform === 'linux' ? path.join(__dirname, 'icon.png') : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.on('close', (ev) => {
    if (quitting) return;
    ev.preventDefault();
    win.hide();
    tray.noticeOnce();
  });
  win.on('session-end', () => (quitting = true)); // Windows: el equipo se apaga o se cierra la sesión
  win.on('closed', () => (win = null));

  const { webContents } = win;
  webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (ev, url) => {
    if (isApp(url)) return;
    ev.preventDefault();
    openOutside(url);
  });
  webContents.on('will-attach-webview', (ev) => ev.preventDefault());
  webContents.on('page-title-updated', (ev, title) => tray.setToolTip(title));

  win.loadURL(startUrl(process.argv, locals));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // abrir la app otra vez trae la ventana, también si estaba en la bandeja
  app.on('second-instance', showWindow);
  app.on('before-quit', () => (quitting = true));

  app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);
    local.init(path.join(app.getPath('userData'), 'local-repos.json'));
    const allow = (permission, url) => PERMISSIONS.has(permission) && isApp(url);
    session.defaultSession.setPermissionRequestHandler((wc, permission, done, details) => done(allow(permission, details.requestingUrl)));
    session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => allow(permission, origin));
    session.defaultSession.on('will-download', saveDownload);
    nativeTheme.on('updated', () => win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? BG.dark : BG.light));

    // los tokens solo se entregan a la propia página (electron/preload.js), cada uno con su servicio
    const fromApp = (ev, service) => {
      if (!isApp(ev.senderFrame?.url)) throw new Error('origen no permitido');
      if (!token.SERVICES.includes(service)) throw new Error('servicio desconocido');
    };
    ipcMain.handle('token:get', async (ev, service = 'github') => {
      fromApp(ev, service);
      const [value, where] = await Promise.all([token.read(service), token.where()]);
      return { token: value, where };
    });
    ipcMain.handle('token:set', async (ev, value, service = 'github') => {
      fromApp(ev, service);
      if (typeof value !== 'string' || value.length > 1000) throw new Error('token inválido');
      await token.write(value.trim(), service);
      return token.where();
    });
    // avisos a Slack y Discord (electron/webhooks.js): la URL no sale del proceso principal
    const testPrefix = app.isPackaged ? '' : process.env.GB_WEBHOOK_TEST_PREFIX || '';
    ipcMain.handle('webhook:send', async (ev, service, event) => {
      fromApp(ev, service);
      if (!webhooks.SERVICES.includes(service)) throw new Error('servicio desconocido');
      return webhooks.send(service, await token.read(service), event, net.fetch, testPrefix);
    });
    // repositorios locales (electron/git.js): la página trabaja con ids de carpetas que el usuario eligió
    const guard = (fn) => async (ev, ...args) => {
      if (!isApp(ev.senderFrame?.url)) throw new Error('origen no permitido');
      try {
        return await fn(...args);
      } catch (err) {
        throw new Error(`${err.kind || 'git'}: ${err.message}`); // por IPC solo viaja el mensaje: el tipo va delante
      }
    };
    ipcMain.handle('git:pick', guard(async () => {
      const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
      return r.canceled || !r.filePaths[0] ? null : local.allow(r.filePaths[0]);
    }));
    ipcMain.handle('git:branches', guard((id) => local.branches(id)));
    ipcMain.handle('git:log', guard((id, sha, exclude, n) => local.log(id, sha, exclude, n)));
    ipcMain.handle('git:ancestor', guard((id, a, b) => local.isAncestor(id, a, b)));
    ipcMain.handle('git:files', guard((id, sha, base) => local.files(id, sha, base)));
    ipcMain.handle('git:diff', guard((id, sha) => local.diff(id, sha)));
    ipcMain.handle('git:watch', guard((id) => watchRepo(id)));
    ipcMain.handle('git:unwatch', guard((id) => unwatchRepo(id)));
    // los textos de la bandeja, en el idioma de la página
    ipcMain.on('labels', (ev, labels) => isApp(ev.senderFrame?.url) && tray.setLabels(labels));
    ipcMain.on('show', (ev) => isApp(ev.senderFrame?.url) && showWindow());

    createWindow();
    tray.create(showWindow);
    app.on('activate', showWindow); // macOS: clic en el ícono del Dock
  });

  app.on('window-all-closed', () => process.platform === 'darwin' || app.quit());
}
