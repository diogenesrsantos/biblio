const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../database');
const { bibleSearchExpression, createBibleSchema, parseUsfm, seedBible } = require('../lib/bible');

test('interpreta capítulos, versículos e marcações USFM', () => {
  const verses = parseUsfm('\\id TST\n\\c 1\n\\p\n\\v 1 Texto \\add acrescentado\\add*.\n\\v 2 Outro \\f + \\fr 1:2 \\ft Nota\\f* texto.');
  assert.deepEqual(verses, [
    { chapter: 1, verse: '1', verseOrder: 1, text: 'Texto acrescentado.' },
    { chapter: 1, verse: '2', verseOrder: 2, text: 'Outro texto.' }
  ]);
});

test('instala offline o cânon protestante da Bíblia Livre e cria pesquisa FTS', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-scripture-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = createDatabase(path.join(directory, 'biblio.db'));
  t.after(() => database.close());
  await createBibleSchema(database.query);
  await seedBible(database);
  await seedBible(database);
  assert.equal((await database.query('SELECT count(*) total FROM bible_books')).rows[0].total, 66);
  assert.ok((await database.query('SELECT count(*) total FROM bible_verses')).rows[0].total > 30000);
  const john = (await database.query("SELECT v.text FROM bible_verses v JOIN bible_books b ON b.id=v.book_id WHERE b.code='JHN' AND v.chapter=3 AND v.verse='16'")).rows[0];
  assert.match(john.text, /Deus amou/);
  const matches = (await database.query('SELECT count(*) total FROM bible_verses_fts WHERE bible_verses_fts MATCH $1', [bibleSearchExpression('amor')])).rows[0].total;
  assert.ok(matches > 0);
});
