const fs = require('node:fs');
const path = require('node:path');
const { backupName, createBackup } = require('../backup-service');

const destination = process.argv[2];
if (!destination) {
  console.error('Uso: npm run backup -- /caminho/do/HD-externo');
  process.exit(1);
}
const root = path.resolve(__dirname, '..');
const data = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
if (!fs.existsSync(data)) { console.error('Diretório de dados não encontrado: ' + data); process.exit(1); }
const target = path.resolve(destination, backupName());
async function main() {
try {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, await createBackup(data), { flag: 'wx' });
  console.log('Backup concluído em: ' + target);
} catch (error) { console.error(error.message); process.exitCode = 1; }
}
main();
