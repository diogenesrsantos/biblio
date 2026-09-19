const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('../database');
const { createHebrewSchema, seedHebrew } = require('../lib/hebrew');

async function main() {
  const destination = path.join(__dirname, '..', 'resources', 'hebrew', 'hebrew.sqlite');
  const temporary = `${destination}.building`;
  fs.rmSync(temporary, { force: true });
  const database = createDatabase(temporary);
  try {
    await createHebrewSchema(database.query);
    await seedHebrew(database);
    database.checkpoint();
    const counts = (await database.query('SELECT (SELECT count(*) FROM hebrew_entries) entries,(SELECT count(*) FROM hebrew_senses) senses')).rows[0];
    if (counts.entries !== 7597 || counts.senses < 15000) throw new Error(`Dicionário incompleto: ${JSON.stringify(counts)}`);
  } finally {
    database.close();
  }
  fs.rmSync(`${destination}-wal`, { force: true });
  fs.rmSync(`${destination}-shm`, { force: true });
  fs.renameSync(temporary, destination);
  console.log(`Dicionário de hebraico criado: ${destination}`);
}

main().catch(error => { console.error(error); process.exit(1); });
