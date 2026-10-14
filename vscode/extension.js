/* Extensión de VS Code: abre GraphBranch en un panel con el repo del espacio de trabajo, usando la
   sesión de GitHub que VS Code ya tiene (vscode.authentication), sin que haya que pegar un token.
   La página es la misma de la web; ver server.js (el servidor local) y vscode/README.md. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');
const { start, repoFromGitConfig } = require('./server');

let running = null; // { panel, server }

/** La carpeta de la app: la copia que deja `node tools/vscode.mjs` o, al correr desde el repo, la carpeta de arriba. */
function appRoot(ctx) {
  for (const dir of [path.join(ctx.extensionPath, 'app'), path.join(ctx.extensionPath, '..')]) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

/** El repo del primer espacio de trabajo que tenga un `origin` conocido. */
function workspaceRepo() {
  for (const f of vscode.workspace.workspaceFolders || []) {
    try {
      const repo = repoFromGitConfig(fs.readFileSync(path.join(f.uri.fsPath, '.git', 'config'), 'utf8'));
      if (repo) return repo;
    } catch {
      /* sin .git: se prueba el siguiente */
    }
  }
  return '';
}

/** El token de la sesión de GitHub de VS Code, o '' si la persona no inicia sesión (la app sigue sin token). */
async function sessionToken() {
  try {
    const s = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false }).catch(() => undefined);
    return (s && s.accessToken) || '';
  } catch {
    return '';
  }
}

async function open(ctx, { signIn = false } = {}) {
  if (running) {
    running.panel.reveal();
    return;
  }
  const root = appRoot(ctx);
  if (!root) {
    vscode.window.showErrorMessage(vscode.l10n.t('GraphBranch: app files not found. Run "node tools/vscode.mjs" first.'));
    return;
  }
  let token = await sessionToken();
  if (!token && signIn) {
    try {
      token = (await vscode.authentication.getSession('github', ['repo'], { createIfNone: true })).accessToken;
    } catch {
      /* la persona cerró el diálogo: sigue sin token */
    }
  }
  const server = await start({ root, token, repo: workspaceRepo() });
  const panel = vscode.window.createWebviewPanel('graphbranch', 'GraphBranch', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
    portMapping: [{ webviewPort: server.port, extensionHostPort: server.port }],
  });
  const external = await vscode.env.asExternalUri(vscode.Uri.parse(server.url));
  const src = external.toString(true);
  panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${new URL(src).origin}; style-src 'unsafe-inline'">
<style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:0;overflow:hidden}</style></head>
<body><iframe src="${src}" title="GraphBranch"></iframe></body></html>`;
  running = { panel, server };
  panel.onDidDispose(() => {
    running = null;
    server.close();
  });
}

function activate(ctx) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('graphbranch.open', () => open(ctx)),
    vscode.commands.registerCommand('graphbranch.signIn', async () => {
      if (running) running.panel.dispose();
      await open(ctx, { signIn: true });
    }),
    { dispose: () => running && running.panel.dispose() },
  );
}

module.exports = { activate, deactivate() {} };
