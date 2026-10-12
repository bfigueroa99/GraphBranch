/* Lo único que la página ve de la app de escritorio: leer y guardar los tokens de GitHub y de
   GitLab, que el proceso principal guarda cifrados con el llavero del sistema (electron/token.js),
   mandar los textos de la bandeja (electron/tray.js) en su idioma y traer la ventana. La página usa
   window.GBDesktop si existe; en la web no está y los tokens siguen en localStorage. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('GBDesktop', {
  /** El token de `service` ('github' o 'gitlab') → { token, where }: where es 'keychain' (cifrado con
      el llavero) o 'plain' (el sistema no tiene llavero). */
  getToken: (service = 'github') => ipcRenderer.invoke('token:get', String(service)),
  /** Guarda el token de `service` ('' lo borra) → where. */
  setToken: (token, service = 'github') => ipcRenderer.invoke('token:set', String(token), String(service)),
  /** { show, quit, hiddenTitle, hiddenBody }: los textos del ícono de la bandeja y del aviso al cerrar. */
  setLabels: (labels) => ipcRenderer.send('labels', labels),
  /** Trae la ventana aunque esté en la bandeja (al hacer clic en una notificación). */
  show: () => ipcRenderer.send('show'),
});
