const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const Database = require('better-sqlite3');

const MAX_EXPANDED_SIZE = 1024 * 1024 * 1024;

function restoreBackup(archive, dataDir) {
  const zip = new AdmZip(archive);
  const manifest = zip.getEntry('manifest.json');
  const database = zip.getEntry('data/biblio.db');
  if (!manifest || !database) throw new Error('Esta não é uma cópia válida da Biblio.');
  let metadata;
  try { metadata = JSON.parse(manifest.getData().toString('utf8')); } catch { throw new Error('Manifesto de backup inválido.'); }
  if (metadata.format !== 'biblio-backup' || metadata.formatVersion !== 1) throw new Error('Formato de backup incompatível.');
  const expandedSize = zip.getEntries().reduce((total, entry) => total + Number(entry.header?.size || 0), 0);
  if (expandedSize > MAX_EXPANDED_SIZE) throw new Error('O conteúdo expandido do backup excede o limite de segurança.');

  const parent = path.dirname(dataDir);
  const staging = path.join(parent, `.biblio-restauracao-${crypto.randomUUID()}`);
  fs.mkdirSync(path.join(staging, 'media'), { recursive: true });
  let previous = null;
  try {
    fs.writeFileSync(path.join(staging, 'biblio.db'), database.getData());
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !entry.entryName.startsWith('data/media/')) continue;
      const name = entry.entryName.slice('data/media/'.length);
      if (!name || name !== path.basename(name)) throw new Error('Nome de mídia inválido no backup.');
      fs.writeFileSync(path.join(staging, 'media', name), entry.getData());
    }
    const check = new Database(path.join(staging, 'biblio.db'), { readonly: true, fileMustExist: true });
    try {
      if (check.pragma('integrity_check')[0]?.integrity_check !== 'ok') throw new Error('O banco do backup está corrompido.');
    } finally { check.close(); }
    previous = `${dataDir}.antes-da-restauracao-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    if (fs.existsSync(dataDir)) fs.renameSync(dataDir, previous);
    fs.renameSync(staging, dataDir);
    return { previous, metadata };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (previous && fs.existsSync(previous) && !fs.existsSync(dataDir)) fs.renameSync(previous, dataDir);
    throw error;
  }
}

module.exports = { restoreBackup };
