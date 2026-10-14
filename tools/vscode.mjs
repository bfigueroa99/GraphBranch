#!/usr/bin/env node
/* Deja lista la extensión de VS Code (vscode/): copia la app (lo mismo que sirve la web) a vscode/app/,
   que .vscodeignore deja dentro del paquete. Publicarla en el Marketplace lo hace Benjamin:

     node tools/vscode.mjs                          copia la app a vscode/app/
     cd vscode && npx @vscode/vsce package          arma graphbranch-<versión>.vsix
     F5 en VS Code con la carpeta vscode/ abierta   la prueba sin empaquetar (usa la app del repo) */
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'vscode', 'app');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'css', 'js', 'vendor', 'icons']) cpSync(join(root, f), join(out, f), { recursive: true });
cpSync(join(root, 'LICENSE'), join(root, 'vscode', 'LICENSE'));
console.log('Listo: vscode/app/ (la app) y vscode/LICENSE. Siguiente: cd vscode && npx @vscode/vsce package');
