const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');

function restoreBackup(archive, dataDir) {
  const zip = new AdmZip(archive);
  const manifest = zip.getEntry('manifest.json');
  const database = zip.getEntry('data/biblio.db');
  if (!manifest || !database) throw new Error('Esta não é uma cópia válida da Biblio.');
  let metadata;
  try { metadata = JSON.parse(manifest.getData().toString('utf8')); } catch { throw new Error('Manifesto de backup inválido.'); }
  if (metadata.format !== 'biblio-backup' || metadata.formatVersion !== 1) throw new Error('Formato de backup incompatível.');

  const parent = path.dirname(dataDir);
  const staging = path.join(parent, `.biblio-restauracao-${crypto.randomUUID()}`);
  fs.mkdirSync(path.join(staging, 'media'), { recursive: true });
  try {
    fs.writeFileSync(path.join(staging, 'biblio.db'), database.getData());
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !entry.entryName.startsWith('data/media/')) continue;
      const name = entry.entryName.slice('data/media/'.length);
      if (!name || name !== path.basename(name)) throw new Error('Nome de mídia inválido no backup.');
      fs.writeFileSync(path.join(staging, 'media', name), entry.getData());
    }
    const previous = `${dataDir}.antes-da-restauracao-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    if (fs.existsSync(dataDir)) fs.renameSync(dataDir, previous);
    fs.renameSync(staging, dataDir);
    return { previous, metadata };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { restoreBackup };
