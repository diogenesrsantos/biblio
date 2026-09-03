const { app, BrowserWindow, dialog, utilityProcess } = require('electron');
const path = require('node:path');

const port = 18080;
const address = `http://127.0.0.1:${port}`;
let server;
let window;
let serverError = '';

function startServer() {
  serverError = '';
  server = utilityProcess.fork(path.join(__dirname, 'server.js'), [], {
    env: { ...process.env, PORT: String(port), DATA_DIR: app.getPath('userData') },
    stdio: 'pipe',
    serviceName: 'Biblio Server'
  });
  server.stdout?.on('data', data => console.log(String(data).trimEnd()));
  server.stderr?.on('data', data => {
    const message = String(data);
    serverError = (serverError + message).slice(-4000);
    console.error(message.trimEnd());
  });
  server.on('error', (type, location) => {
    serverError = `Falha no processo do servidor (${type})${location ? ` em ${location}` : ''}.`;
  });
  server.on('exit', code => {
    if (code === 75 && !app.isQuitting) return startServer();
    if (!app.isQuitting && !serverError) serverError = `O servidor foi encerrado com o código ${code}.`;
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(`${address}/api/health`)).ok) return; } catch {}
    if (serverError) throw new Error(`A Biblio não conseguiu iniciar o servidor.\n\n${serverError.trim()}`);
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
