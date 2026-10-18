/* Los tokens de la app de escritorio (el de GitHub, el de GitLab, el de Codeberg, el de Bitbucket y las URL de webhook de Slack, de Discord y de Teams), cifrados con el llavero del
   sistema (safeStorage): Llavero en macOS, DPAPI en Windows y el llavero de GNOME o KWallet en
   Linux. Cada uno queda en su archivo de los datos de la app, nunca en localStorage.

   Sin llavero (Linux sin uno disponible: Chromium usa entonces una clave fija, "basic_text"),
   se guarda igual, pero la página lo dice: where es 'plain' en vez de 'keychain'. */
const { app, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const file = (name) => path.join(app.getPath('userData'), name);
/** Los servicios con token. Cada uno, en `<servicio>-token.enc`: cifrado (con el llavero o, en Linux
    sin llavero, con la clave fija de Chromium) o, si no hay cifrado, en claro en `<servicio>-token.txt`. */
const SERVICES = ['github', 'gitlab', 'codeberg', 'bitbucket', 'slack', 'discord', 'teams']; // los tres últimos guardan la URL de un webhook (electron/webhooks.js)
const names = (service) => {
  if (!SERVICES.includes(service)) throw new Error('servicio desconocido');
  return { ENCRYPTED: `${service}-token.enc`, PLAIN: `${service}-token.txt` };
};

async function encryption() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return 'none';
  return process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text' ? 'basic' : 'keychain';
}

/** Dónde queda el token: 'keychain' (cifrado de verdad) o 'plain'. */
async function where() {
  return (await encryption()) === 'keychain' ? 'keychain' : 'plain';
}

const readOr = (name, fallback) => fs.readFile(file(name)).catch(() => fallback);

async function read(service = 'github') {
  const { ENCRYPTED, PLAIN } = names(service);
  const enc = await readOr(ENCRYPTED, null);
  if (enc) {
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(enc);
      if (shouldReEncrypt) await write(result, service);
      return result;
    } catch (err) {
      // el llavero cambió o ya no está: hay que volver a escribir el token en Ajustes
      console.error('No se pudo descifrar el token guardado:', err.message);
      return '';
    }
  }
  return (await readOr(PLAIN, '')).toString();
}

/** Guarda el token ('' lo borra). Primero escribe el nuevo y después borra el otro formato. */
async function write(token, service = 'github') {
  const { ENCRYPTED, PLAIN } = names(service);
  const keep = !token ? null : (await encryption()) === 'none' ? PLAIN : ENCRYPTED;
  if (keep) await fs.writeFile(file(keep), keep === PLAIN ? token : await safeStorage.encryptStringAsync(token), { mode: 0o600 });
  await Promise.all([ENCRYPTED, PLAIN].filter((name) => name !== keep).map((name) => fs.rm(file(name), { force: true })));
}

module.exports = { read, write, where, SERVICES };
