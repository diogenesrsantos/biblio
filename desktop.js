const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');

const port = 18080;
const address = `http://127.0.0.1:${port}`;
let server;
let window;

function startServer() {
  server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port), DATA_DIR: app.getPath('userData') },
    stdio: 'ignore'
  });
  server.on('exit', code => {
    if (code === 75 && !app.isQuitting) return startServer();
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(`${address}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('A Biblio não conseguiu iniciar.');
}

async function openWindow() {
  await waitForServer();
  window = new BrowserWindow({ width: 1380, height: 920, minWidth: 900, minHeight: 620, autoHideMenuBar: true, title: 'Biblio' });
  window.webContents.session.on('will-download', (_, item) => item.setSaveDialogOptions({ title: 'Salvar cópia da Biblio' }));
  await window.loadURL(address);
}

app.whenReady().then(() => { startServer(); return openWindow(); }).catch(error => {
  dialog.showErrorBox('Não foi possível abrir a Biblio', error.message);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { app.isQuitting = true; server?.kill(); });
