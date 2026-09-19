const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../database');
const { createHebrewSchema, decodeHebrewReference, hebrewSearchExpression, seedHebrew, stripHebrewMarks, translatePartOfSpeech, transliterateHebrew } = require('../lib/hebrew');

test('normaliza hebraico, transliteração, gramática e referências', () => {
  assert.equal(stripHebrewMarks('שָׁלוֹם'), 'שלום');
  assert.equal(transliterateHebrew('שָׁלוֹם'), 'shalom');
  assert.equal(translatePartOfSpeech('noun m pl'), 'substantivo masculino plural');
  assert.deepEqual(decodeHebrewReference('00100202400012'), { code: 'GEN', book_name: 'Gênesis', chapter: 2, verse: 24 });
  assert.equal(hebrewSearchExpression('H1'), '"H0001"*');
});

test('importa e pesquisa o dicionário UBS em português', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-hebrew-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = createDatabase(path.join(directory, 'hebrew.db'));
  t.after(() => database.close());
  await createHebrewSchema(database.query);
  await seedHebrew(database);
  assert.equal((await database.query('SELECT count(*) total FROM hebrew_entries')).rows[0].total, 7597);
  assert.ok((await database.query('SELECT count(*) total FROM hebrew_senses')).rows[0].total > 15000);
  const shalom = (await database.query("SELECT e.* FROM hebrew_entries_fts f JOIN hebrew_entries e ON e.id=f.rowid WHERE hebrew_entries_fts MATCH $1 LIMIT 1", [hebrewSearchExpression('shalom')])).rows[0];
  assert.equal(shalom.lemma_plain, 'שלום');
  assert.match(shalom.glosses, /paz/i);
  const father = (await database.query("SELECT e.* FROM hebrew_entries_fts f JOIN hebrew_entries e ON e.id=f.rowid WHERE hebrew_entries_fts MATCH $1 LIMIT 1", [hebrewSearchExpression('H1')])).rows[0];
  assert.equal(father.lemma_plain, 'אב');
  assert.match(father.glosses, /pai/i);
});
