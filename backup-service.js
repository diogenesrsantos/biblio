const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const Database = require('better-sqlite3');

const APP_VERSION = require('./package.json').version;

function backupName() {
  return `biblio-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.zip`;
}

async function createBackup(dataDir) {
  const database = path.join(dataDir, 'biblio.db');
  if (!fs.existsSync(database)) throw new Error('Banco de dados não encontrado.');
  const snapshot = path.join(os.tmpdir(), `biblio-snapshot-${crypto.randomUUID()}.db`);
  const source = new Database(database, { readonly: true });
  try {
    await source.backup(snapshot);
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({
      format: 'biblio-backup', formatVersion: 1, appVersion: APP_VERSION,
      createdAt: new Date().toISOString()
    }, null, 2)));
    zip.addLocalFile(snapshot, 'data', 'biblio.db');
    const mediaDir = path.join(dataDir, 'media');
    if (fs.existsSync(mediaDir)) zip.addLocalFolder(mediaDir, 'data/media');
    zip.addFile('LEIA-ME.txt', Buffer.from('Backup da Biblio. Instale a Biblio em outro computador e use a opção Restaurar cópia.\n'));
    return zip.toBuffer();
  } finally {
    source.close();
    fs.rmSync(snapshot, { force: true });
  }
}

module.exports = { backupName, createBackup };
