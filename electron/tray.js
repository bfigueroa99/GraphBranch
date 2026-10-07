/* Ícono en la bandeja del sistema (en macOS, en la barra de menús): con la ventana cerrada, la app
   sigue revisando el repositorio y avisando. Los textos llegan de la página, en su idioma
   (GBDesktop.setLabels); hasta entonces van en inglés. */
const { app, Menu, Notification, Tray } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const labels = {
  show: 'Show GraphBranch',
  quit: 'Quit GraphBranch',
  hiddenTitle: 'GraphBranch is still running',
  hiddenBody: 'It keeps watching the repository in the background. Open it again or quit it for good from its icon in the system tray or menu bar.',
};
let tray = null;
let show = () => {};

function render() {
  tray?.setContextMenu(
    Menu.buildFromTemplate([{ label: labels.show, click: () => show() }, { type: 'separator' }, { label: labels.quit, click: () => app.quit() }]),
  );
}

/** onShow muestra la ventana: lo usan el clic en el ícono (Windows), su menú y el aviso. */
function create(onShow) {
  show = onShow;
  // en macOS, "Template" hace que el sistema lo pinte claro u oscuro según la barra de menús
  tray = new Tray(path.join(__dirname, process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
  tray.setToolTip('GraphBranch');
  tray.on('click', () => show());
  render();
}

/** Solo se aceptan los textos conocidos, y como texto corto. */
function setLabels(next) {
  for (const key of Object.keys(labels)) if (typeof next?.[key] === 'string' && next[key] && next[key].length < 400) labels[key] = next[key];
  render();
}

/** El título de la ventana lleva el número de novedades sin ver: el del ícono también. */
const setToolTip = (title) => tray?.setToolTip(title);

/** La primera vez que la ventana se cierra a la bandeja, un aviso del sistema explica dónde quedó. */
function noticeOnce() {
  const flag = path.join(app.getPath('userData'), 'tray-notice-shown');
  if (fs.existsSync(flag) || !Notification.isSupported()) return;
  fs.writeFileSync(flag, '');
  const notice = new Notification({ title: labels.hiddenTitle, body: labels.hiddenBody });
  notice.on('click', () => show());
  notice.show();
}

module.exports = { create, setLabels, setToolTip, noticeOnce };
