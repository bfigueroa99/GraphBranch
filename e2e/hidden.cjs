/* Arnés de las pruebas e2e que necesitan la ventana oculta de verdad. Playwright, al conectarse a
   una página, la mantiene "visible" aunque su ventana esté escondida (Chromium la cuenta como
   capturada), y entonces no se puede probar la bandeja. Este archivo abre la app sin Playwright:
   carga electron/main.js, hace el recorrido desde el proceso principal (que no captura la
   página) e imprime el resultado como una línea "E2E {json}". Lo usa desktop.spec.mjs.

     electron e2e/hidden.cjs --user-data-dir=… [--lang=es]     con E2E_SCENARIO=tray | timers */
const { app, BrowserWindow, Notification } = require('electron');
const path = require('node:path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (await check()) return true;
  return false;
}

const SCENARIOS = {
  /** Cerrar la esconde en la bandeja; la página lo sabe, cuenta novedades y vuelve con GBDesktop.show(). */
  async tray(win, js) {
    const notices = [];
    Notification.isSupported = () => true; // el aviso, sin depender de un servicio de notificaciones
    Notification.prototype.show = function () {
      notices.push(this.title);
    };
    win.close();
    await sleep(500);
    const closed = { visible: win.isVisible(), destroyed: win.isDestroyed(), hidden: await js('document.hidden') };
    const counted = await until(async () => /^\(\d+\) /.test(win.webContents.getTitle()), 20_000);
    const titleHidden = win.webContents.getTitle();
    await js('window.GBDesktop.show()');
    await until(() => win.isVisible(), 5_000);
    await sleep(300);
    const shown = { visible: win.isVisible(), hidden: await js('document.hidden'), title: win.webContents.getTitle() };
    win.close();
    await sleep(300);
    return { closed, counted, titleHidden, shown, notices };
  },

  /** Oculta 2 minutos: Chromium empieza a espaciar los temporizadores a uno por minuto pasado el primer
      minuto oculta (con --enable-features=IntensiveWakeUpThrottling:grace_period_seconds/1; si no, a los
      5). Se cuentan las novedades del segundo minuto: sin el arreglo de main.js serían 1 o 2. */
  async timers(win, js) {
    const unread = () => Number(/^\((\d+)\)/.exec(win.webContents.getTitle())?.[1] ?? 0);
    win.close();
    await sleep(65_000);
    const first = unread();
    await sleep(60_000);
    return { hidden: await js('document.hidden'), first, second: unread() };
  },
};

app.on('browser-window-created', (_, win) => {
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code, true);
    let result;
    try {
      await until(() => js(`document.getElementById('status').dataset.state !== 'loading'`), 20_000);
      result = await SCENARIOS[process.env.E2E_SCENARIO](win, js);
    } catch (err) {
      result = { error: String(err?.stack || err) };
    }
    process.stdout.write('E2E ' + JSON.stringify(result) + '\n');
    app.exit(0);
  });
});

require(path.join(__dirname, '..', 'electron', 'main.js'));
