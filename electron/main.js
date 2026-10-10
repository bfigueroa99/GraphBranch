/* Proceso principal de la app de escritorio: abre la misma página que se publica en la web.

   La página se sirve con un protocolo propio (app://graphbranch/) en vez de file://, así tiene un
   origen fijo: el CSP de index.html ('self') funciona igual que en la web, localStorage queda
   aparte del resto del sistema y el contexto es seguro (notificaciones, Wake Lock).

     npm start                         abre la demo o los repositorios que se seguían
     npm start -- --repo=owner/repo    abre ese repositorio (repetido, sigue varios)
     npm start -- --tv                 entra en modo TV (también --lang=es)

   Cerrar la ventana la esconde en la bandeja del sistema (electron/tray.js) y la app sigue
   revisando los repositorios; para salir del todo está "Salir" en el menú del ícono. */
const { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const token = require('./token');
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
  return net.fetch(pathToFileURL(file).toString());
}

/** Los argumentos --repo, --tv y --lang pasan a la página como en la web (?repo=, ?tv=1, ?lang=).
    --repo se puede repetir para seguir varios repos (el primero queda a la vista). */
function startUrl(argv) {
  const url = new URL(`${ORIGIN}/index.html`);
  for (const arg of argv) {
    const m = /^--(repo|lang)=(.+)$/.exec(arg);
    if (m) url.searchParams[m[1] === 'repo' ? 'append' : 'set'](m[1], m[2]);
    else if (arg === '--tv') url.searchParams.set('tv', '1');
  }
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

let win = null;
/** Mientras no se pide salir (menú del ícono, Cmd+Q, apagar el equipo), cerrar la ventana solo la esconde. */
let quitting = false;

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
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

  win.loadURL(startUrl(process.argv));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // abrir la app otra vez trae la ventana, también si estaba en la bandeja
  app.on('second-instance', showWindow);
  app.on('before-quit', () => (quitting = true));

  app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);
    const allow = (permission, url) => PERMISSIONS.has(permission) && isApp(url);
    session.defaultSession.setPermissionRequestHandler((wc, permission, done, details) => done(allow(permission, details.requestingUrl)));
    session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => allow(permission, origin));
    nativeTheme.on('updated', () => win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? BG.dark : BG.light));

    // el token solo se entrega a la propia página (electron/preload.js)
    const fromApp = (ev) => {
      if (!isApp(ev.senderFrame?.url)) throw new Error('origen no permitido');
    };
    ipcMain.handle('token:get', async (ev) => {
      fromApp(ev);
      const [value, where] = await Promise.all([token.read(), token.where()]);
      return { token: value, where };
    });
    ipcMain.handle('token:set', async (ev, value) => {
      fromApp(ev);
      if (typeof value !== 'string' || value.length > 1000) throw new Error('token inválido');
      await token.write(value.trim());
      return token.where();
    });
    // los textos de la bandeja, en el idioma de la página
    ipcMain.on('labels', (ev, labels) => isApp(ev.senderFrame?.url) && tray.setLabels(labels));
    ipcMain.on('show', (ev) => isApp(ev.senderFrame?.url) && showWindow());

    createWindow();
    tray.create(showWindow);
    app.on('activate', showWindow); // macOS: clic en el ícono del Dock
  });

  app.on('window-all-closed', () => process.platform === 'darwin' || app.quit());
}
