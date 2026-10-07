/* Lo único que la página ve de la app de escritorio: leer y guardar el token de GitHub, que el
   proceso principal guarda cifrado con el llavero del sistema (electron/token.js). La página
   usa window.GBDesktop si existe; en la web no está y el token sigue en localStorage. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('GBDesktop', {
  /** → { token, where }: where es 'keychain' (cifrado con el llavero) o 'plain' (el sistema no tiene llavero). */
  getToken: () => ipcRenderer.invoke('token:get'),
  /** Guarda el token ('' lo borra) → where. */
  setToken: (token) => ipcRenderer.invoke('token:set', String(token)),
});
