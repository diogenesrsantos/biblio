const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('../database');
const { createBibleSchema, seedBible } = require('../lib/bible');

async function main() {
  const destination = path.join(__dirname, '..', 'resources', 'bible', 'bible.sqlite');
  const temporary = `${destination}.building`;
  fs.rmSync(temporary, { force: true });
  const database = createDatabase(temporary);
  try {
    await createBibleSchema(database.query);
    await seedBible(database);
    database.checkpoint();
    const counts = (await database.query('SELECT (SELECT count(*) FROM bible_books) books, (SELECT count(*) FROM bible_verses) verses')).rows[0];
    if (counts.books !== 66 || counts.verses !== 31102) throw new Error(`Conteúdo bíblico incompleto: ${JSON.stringify(counts)}`);
  } finally {
    database.close();
  }
  fs.rmSync(`${destination}-wal`, { force: true });
  fs.rmSync(`${destination}-shm`, { force: true });
  fs.renameSync(temporary, destination);
  console.log(`Módulo bíblico criado: ${destination}`);
}

main().catch(error => { console.error(error); process.exit(1); });
