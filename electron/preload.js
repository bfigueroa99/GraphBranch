/* Lo único que la página ve de la app de escritorio: leer y guardar los tokens de GitHub y de
   GitLab, que el proceso principal guarda cifrados con el llavero del sistema (electron/token.js),
   leer repositorios locales por su id (electron/git.js), mandar los textos de la bandeja (electron/tray.js) en su idioma y traer la ventana. La página usa
   window.GBDesktop si existe; en la web no está y los tokens siguen en localStorage. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('GBDesktop', {
  /** El token de `service` ('github', 'gitlab', 'codeberg' o 'bitbucket') → { token, where }: where es 'keychain' (cifrado con
      el llavero) o 'plain' (el sistema no tiene llavero). */
  getToken: (service = 'github') => ipcRenderer.invoke('token:get', String(service)),
  /** Guarda el token de `service` ('' lo borra) → where. */
  setToken: (token, service = 'github') => ipcRenderer.invoke('token:set', String(token), String(service)),
  /** { show, quit, hiddenTitle, hiddenBody }: los textos del ícono de la bandeja y del aviso al cerrar. */
  setLabels: (labels) => ipcRenderer.send('labels', labels),
  /** Repositorios de esta máquina. La página solo conoce el id de una carpeta elegida por el usuario. */
  git: {
    /** Abre el diálogo del sistema → { id, name }, o null si se canceló. Lanza si no es un repositorio. */
    pick: () => ipcRenderer.invoke('git:pick'),
    branches: (id) => ipcRenderer.invoke('git:branches', String(id)),
    log: (id, sha, exclude, n) => ipcRenderer.invoke('git:log', String(id), String(sha), exclude == null ? null : String(exclude), Number(n)),
    isAncestor: (id, a, b) => ipcRenderer.invoke('git:ancestor', String(id), String(a), String(b)),
    files: (id, sha, base) => ipcRenderer.invoke('git:files', String(id), String(sha), base == null ? null : String(base)),
    /** Los cambios de un commit frente a su primer padre → { text, truncated } (texto de git diff). */
    diff: (id, sha) => ipcRenderer.invoke('git:diff', String(id), String(sha)),
    /** Empieza (o deja) de vigilar las ramas de esa carpeta; los cambios llegan a onChange(id). */
    watch: (id) => ipcRenderer.invoke('git:watch', String(id)),
    unwatch: (id) => ipcRenderer.invoke('git:unwatch', String(id)),
    onChange: (fn) => {
      const on = (ev, id) => fn(String(id));
      ipcRenderer.on('git:changed', on);
      return () => ipcRenderer.removeListener('git:changed', on);
    },
  },
  /** Avisos a Slack, Discord o Teams: lo manda el proceso principal con la URL guardada de `service`
      ('slack', 'discord' o 'teams'). ev = { repo, kind, title, detail, url } → { ok, status }. */
  webhook: (service, ev) => ipcRenderer.invoke('webhook:send', String(service), ev && typeof ev === 'object' ? ev : {}),
  /** Trae la ventana aunque esté en la bandeja (al hacer clic en una notificación). */
  show: () => ipcRenderer.send('show'),
});
