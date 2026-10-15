const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('../database');
const { buildDictionary, buildEnglishDictionary } = require('../lib/dictionary');

async function main() {
  for (const [filename, build] of [['dictionary.sqlite', buildDictionary], ['dictionary-en.sqlite', buildEnglishDictionary]]) {
    const destination = path.join(__dirname, '..', 'resources', 'dictionary', filename);
    const temporary = destination + '.building';
    fs.rmSync(temporary, { force: true });
    const database = createDatabase(temporary);
    try {
      const source = await build(database);
      if (database.integrityCheck().join() !== 'ok') throw new Error('Falha de integridade do SQLite.');
      database.checkpoint();
      await database.query('PRAGMA journal_mode=DELETE');
      console.log(`${source.entry_count} verbetes (${source.language}); SHA-256 da fonte: ${source.snapshot_sha256}`);
    } finally { database.close(); }
    fs.renameSync(temporary, destination);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
