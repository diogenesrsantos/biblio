const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../database');
const { plainWiki, snapshotEntries, dictionarySearchExpression, buildDictionary, buildEnglishDictionary } = require('../lib/dictionary');
const snapshot = require('../resources/dictionary/wikisource-easton-pt.json');

test('converte tradução preservando referências e excluindo navegação e índices', () => {
  assert.equal(plainWiki('{{navegar|notas={{Wikipédia|Algo}}}}<center>Título</center>Texto [[../Abel|Abel]]<ref>Gênesis 4:1</ref>\n== Notas ==\n<references/>'), 'Texto Abel (Gênesis 4:1)');
  const entries = snapshotEntries(snapshot);
  assert.equal(entries.length, 61);
  assert.ok(entries.some(entry => entry.title === 'Abraão' && /Pai de uma multidão/.test(entry.text)));
  for (const entry of entries) {
    assert.match(entry.source_url, /^https:\/\/pt.wikisource.org\/w\/index.php\?oldid=\d+$/);
    assert.match(entry.history_url, /action=history$/);
    assert.ok(entry.revision_id > 0);
    assert.doesNotMatch(entry.text, /\{\{|\}\}|\[\[|<ref|\|obra=|\|seção=/);
  }
  assert.equal(dictionarySearchExpression('" OR * (Abraão)'), '"OR"* AND "Abraão"*');
  assert.equal(dictionarySearchExpression('***'), '');
});

test('SQLite offline mantém procedência e pesquisa sem acentos', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-dictionary-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = createDatabase(path.join(directory, 'dictionary.sqlite'));
  t.after(() => database.close());
  const source = await buildDictionary(database);
  assert.equal(source.entry_count, 61);
  assert.equal(source.language, 'pt');
  assert.equal(source.incomplete, true);
  assert.match(source.license, /CC BY-SA 4.0/);
  assert.match(source.snapshot_sha256, /^[a-f0-9]{64}$/);
  const results = await database.query('SELECT e.title FROM dictionary_entries_fts f JOIN dictionary_entries e ON e.id=f.rowid WHERE dictionary_entries_fts MATCH $1', [dictionarySearchExpression('abraao')]);
  assert.ok(results.rows.some(entry => entry.title === 'Abraão'));
  const disk = createDatabase(path.join(__dirname, '..', 'resources', 'dictionary', 'dictionary.sqlite'), { readonly: true });
  try {
    assert.deepEqual(disk.integrityCheck(), ['ok']);
    assert.equal((await disk.query('SELECT count(*) total FROM dictionary_entries')).rows[0].total, 61);
    assert.equal(JSON.parse((await disk.query('SELECT metadata FROM dictionary_source')).rows[0].metadata).snapshot_sha256, source.snapshot_sha256);
  } finally { disk.close(); }
  assert.deepEqual(database.integrityCheck(), ['ok']);
});

test('edição inglesa preserva os 3.963 verbetes, inclusive títulos repetidos e créditos', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-dictionary-en-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = createDatabase(path.join(directory, 'english.sqlite'));
  t.after(() => database.close());
  const source = await buildEnglishDictionary(database);
  assert.equal(source.entry_count, 3963);
  assert.equal(source.unique_key_count, 3961);
  assert.equal(source.language, 'en');
  assert.equal(source.incomplete, false);
  assert.match(source.license, /Public Domain/);
  assert.match(source.distributors, /CCEL/);
  assert.match(source.distributors, /CrossWire/);
  assert.match(source.distributors, /GetBible/);
  const snapshot = require('../resources/dictionary/getbible-easton-en.json');
  const entries = (await database.query('SELECT title,text,source_url FROM dictionary_entries ORDER BY id')).rows;
  assert.equal(entries.length, snapshot.entries.length);
  entries.forEach((entry, index) => {
    assert.equal(entry.title, snapshot.entries[index].key);
    assert.equal(entry.text, snapshot.entries[index].text);
    assert.ok(entry.source_url.endsWith(encodeURIComponent(snapshot.entries[index].id) + '.json'));
  });
  assert.equal(new Set(entries.map(entry => entry.title)).size, 3961);
  const faith = (await database.query('SELECT e.title FROM dictionary_entries_fts f JOIN dictionary_entries e ON e.id=f.rowid WHERE dictionary_entries_fts MATCH $1', [dictionarySearchExpression('faith')])).rows;
  assert.ok(faith.some(entry => entry.title.toLowerCase() === 'faith'));
  const disk = createDatabase(path.join(__dirname, '..', 'resources', 'dictionary', 'dictionary-en.sqlite'), { readonly: true });
  try {
    assert.deepEqual(disk.integrityCheck(), ['ok']);
    assert.equal((await disk.query('SELECT count(*) total FROM dictionary_entries')).rows[0].total, 3963);
    assert.equal(JSON.parse((await disk.query('SELECT metadata FROM dictionary_source')).rows[0].metadata).snapshot_sha256, source.snapshot_sha256);
  } finally { disk.close(); }
  assert.deepEqual(database.integrityCheck(), ['ok']);
});

test('recusa fonte inglesa modificada quando o hash não confere', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-dictionary-hash-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of ['getbible-easton-en.json', 'getbible-easton-en-metadata.json', 'getbible-easton-en-hashes.json']) fs.copyFileSync(path.join(__dirname, '..', 'resources', 'dictionary', file), path.join(directory, file));
  fs.appendFileSync(path.join(directory, 'getbible-easton-en.json'), '\n');
  const database = createDatabase(path.join(directory, 'invalid.sqlite'));
  t.after(() => database.close());
  await assert.rejects(buildEnglishDictionary(database, directory), /SHA-256/);
});
