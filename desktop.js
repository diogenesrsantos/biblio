const { app, BrowserWindow, dialog, utilityProcess } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const port = 18080;
const address = `http://127.0.0.1:${port}`;
let server;
let window;
let serverError = '';
let logFile;
let dataDir;

function log(message) {
  try {
    logFile ||= path.join(app.getPath('userData'), 'biblio.log');
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${new Date().toISOString()} [${process.pid}] ${message}\n`);
  } catch {}
}

function errorText(error) {
  return error?.stack || error?.message || String(error);
}

function prepareDataDir() {
  const userData = app.getPath('userData');
  dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  for (const name of ['biblio.db', 'biblio.db-wal', 'biblio.db-shm', 'media', '.biblio-restore-pending.zip']) {
    const previous = path.join(userData, name);
    const destination = path.join(dataDir, name);
    if (fs.existsSync(previous) && !fs.existsSync(destination)) {
      fs.renameSync(previous, destination);
      log(`Dados anteriores migrados: ${name}`);
    }
  }
  log(`Diretório da biblioteca preparado: ${dataDir}`);
}

function startServer() {
  serverError = '';
  const modulePath = path.join(__dirname, 'server.js');
  log(`Iniciando servidor: module=${modulePath} data=${dataDir} port=${port} packaged=${app.isPackaged}`);
  server = utilityProcess.fork(modulePath, [], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: 'pipe',
    serviceName: 'Biblio Server'
  });
  server.on('spawn', () => log(`Processo servidor iniciado: pid=${server.pid || 'desconhecido'}`));
  server.stdout?.on('data', data => {
    const message = String(data).trimEnd();
    log(`servidor stdout: ${message}`);
    console.log(message);
  });
  server.stderr?.on('data', data => {
    const message = String(data);
    serverError = (serverError + message).slice(-4000);
    log(`servidor stderr: ${message.trimEnd()}`);
    console.error(message.trimEnd());
  });
  server.on('error', (type, location) => {
    serverError = `Falha no processo do servidor (${type})${location ? ` em ${location}` : ''}.`;
    log(serverError);
  });
  server.on('exit', code => {
    log(`Processo servidor encerrado: code=${code} quitting=${Boolean(app.isQuitting)}`);
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
  log('Servidor respondeu ao diagnóstico de saúde; abrindo janela.');
  window = new BrowserWindow({ width: 1380, height: 920, minWidth: 900, minHeight: 620, autoHideMenuBar: true, title: 'Biblio' });
  window.webContents.session.on('will-download', (_, item) => item.setSaveDialogOptions({ title: 'Salvar cópia da Biblio' }));
  await window.loadURL(address);
}

log(`Aplicação iniciada: version=${app.getVersion()} platform=${process.platform} arch=${process.arch} electron=${process.versions.electron}`);
process.on('uncaughtException', error => {
  log(`Erro não tratado: ${errorText(error)}`);
  app.exit(1);
});
process.on('unhandledRejection', error => log(`Rejeição não tratada: ${errorText(error)}`));
app.on('child-process-gone', (_, details) => log(`Processo auxiliar encerrado: ${JSON.stringify(details)}`));
app.whenReady().then(() => { log('Electron pronto.'); prepareDataDir(); startServer(); return openWindow(); }).catch(error => {
  log(`Falha ao abrir aplicação: ${errorText(error)}`);
  dialog.showErrorBox('Não foi possível abrir a Biblio', `${error.message}\n\nDiagnóstico: ${logFile}`);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { log('Aplicação encerrando.'); app.isQuitting = true; server?.kill(); });
