const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const destination = process.argv[2];
if (!destination) {
  console.error('Uso: npm run backup -- /caminho/do/HD-externo');
  process.exit(1);
}
const root = path.resolve(__dirname, '..');
const data = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const dbFile = path.join(data, 'biblio.db');
if (!fs.existsSync(dbFile)) { console.error('Banco de dados não encontrado em ' + dbFile); process.exit(1); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.resolve(destination, `biblio-backup-${stamp}`);
fs.mkdirSync(target, { recursive: true });
const db = new Database(dbFile, { readonly: true });
db.backup(path.join(target, 'biblio.db')).then(() => {
  db.close();
  fs.cpSync(path.join(data, 'media'), path.join(target, 'media'), { recursive: true, force: false });
  fs.writeFileSync(path.join(target, 'README.txt'), `Backup Biblio criado em ${new Date().toISOString()}\nRestaure substituindo a pasta data/ do servidor por este conteúdo.\n`);
  console.log('Backup concluído em: ' + target);
}).catch(error => { console.error(error.message); process.exit(1); });
