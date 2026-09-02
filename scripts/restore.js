const fs = require('node:fs');
const path = require('node:path');
const { restoreBackup } = require('../restore-service');

const archive = process.argv[2];
if (!archive) {
  console.error('Uso: npm run restore -- /caminho/para/biblio-backup.zip');
  process.exit(1);
}
const root = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
try {
  const result = restoreBackup(fs.readFileSync(path.resolve(archive)), dataDir);
  console.log('Restauração concluída. Dados anteriores preservados em: ' + result.previous);
} catch (error) { console.error(error.message); process.exitCode = 1; }
