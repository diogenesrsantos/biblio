const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const port = process.env.PORT || '8080';
const address = `http://127.0.0.1:${port}`;
let server;

const open = () => {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', address] : [address];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
};

let opened = false;
function start() {
  server = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, stdio: 'inherit', env: process.env });
  let tries = 0;
  const timer = setInterval(async () => {
  try {
    const response = await fetch(`${address}/api/health`);
    if (response.ok) { clearInterval(timer); if (!opened) { open(); opened = true; } }
  } catch {}
  if (++tries === 40) clearInterval(timer);
  }, 250);
  server.on('exit', code => { if (code === 75) start(); else process.exit(code || 0); });
}

process.on('SIGINT', () => server?.kill('SIGINT'));
process.on('SIGTERM', () => server?.kill('SIGTERM'));
start();
