const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

const BOOKS = [
  ['GEN','Gênesis','old'],['EXO','Êxodo','old'],['LEV','Levítico','old'],['NUM','Números','old'],['DEU','Deuteronômio','old'],['JOS','Josué','old'],['JDG','Juízes','old'],['RUT','Rute','old'],['1SA','1 Samuel','old'],['2SA','2 Samuel','old'],['1KI','1 Reis','old'],['2KI','2 Reis','old'],['1CH','1 Crônicas','old'],['2CH','2 Crônicas','old'],['EZR','Esdras','old'],['NEH','Neemias','old'],['EST','Ester','old'],['JOB','Jó','old'],['PSA','Salmos','old'],['PRO','Provérbios','old'],['ECC','Eclesiastes','old'],['SNG','Cantares','old'],['ISA','Isaías','old'],['JER','Jeremias','old'],['LAM','Lamentações','old'],['EZK','Ezequiel','old'],['DAN','Daniel','old'],['HOS','Oseias','old'],['JOL','Joel','old'],['AMO','Amós','old'],['OBA','Obadias','old'],['JON','Jonas','old'],['MIC','Miqueias','old'],['NAM','Naum','old'],['HAB','Habacuque','old'],['ZEP','Sofonias','old'],['HAG','Ageu','old'],['ZEC','Zacarias','old'],['MAL','Malaquias','old'],
  ['MAT','Mateus','new'],['MRK','Marcos','new'],['LUK','Lucas','new'],['JHN','João','new'],['ACT','Atos','new'],['ROM','Romanos','new'],['1CO','1 Coríntios','new'],['2CO','2 Coríntios','new'],['GAL','Gálatas','new'],['EPH','Efésios','new'],['PHP','Filipenses','new'],['COL','Colossenses','new'],['1TH','1 Tessalonicenses','new'],['2TH','2 Tessalonicenses','new'],['1TI','1 Timóteo','new'],['2TI','2 Timóteo','new'],['TIT','Tito','new'],['PHM','Filemom','new'],['HEB','Hebreus','new'],['JAS','Tiago','new'],['1PE','1 Pedro','new'],['2PE','2 Pedro','new'],['1JN','1 João','new'],['2JN','2 João','new'],['3JN','3 João','new'],['JUD','Judas','new'],['REV','Apocalipse','new']
].map(([code,name,testament], index) => ({ code, name, testament, canonicalOrder: index + 1 }));

const LICENSE_NOTICE = 'Bíblia Livre (BLIVRE), Copyright © 2018 Diego Santos, Mario Sérgio e Marco Teles. Licença Creative Commons Atribuição 4.0 Brasil. Reprodução permitida mediante atribuição.';
const SOURCE_URL = 'https://ebible.org/porbr2018/';

async function createBibleSchema(query) {
  await query(`CREATE TABLE bible_translations (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, language TEXT NOT NULL, license TEXT NOT NULL, source_url TEXT NOT NULL, source_version TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE bible_books (id INTEGER PRIMARY KEY AUTOINCREMENT, translation_id INTEGER NOT NULL REFERENCES bible_translations(id) ON DELETE CASCADE, code TEXT NOT NULL, name TEXT NOT NULL, testament TEXT NOT NULL CHECK(testament IN ('old','new')), canonical_order INTEGER NOT NULL, UNIQUE(translation_id,code));
    CREATE TABLE bible_verses (id INTEGER PRIMARY KEY AUTOINCREMENT, translation_id INTEGER NOT NULL REFERENCES bible_translations(id) ON DELETE CASCADE, book_id INTEGER NOT NULL REFERENCES bible_books(id) ON DELETE CASCADE, chapter INTEGER NOT NULL, verse TEXT NOT NULL, verse_order INTEGER NOT NULL, text TEXT NOT NULL, UNIQUE(book_id,chapter,verse));
    CREATE INDEX idx_bible_books_order ON bible_books(translation_id,canonical_order);
    CREATE INDEX idx_bible_verses_chapter ON bible_verses(book_id,chapter,verse_order);
    CREATE VIRTUAL TABLE bible_verses_fts USING fts5(text, content='bible_verses', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
    CREATE TRIGGER bible_verses_ai AFTER INSERT ON bible_verses BEGIN INSERT INTO bible_verses_fts(rowid,text) VALUES(new.id,new.text); END;
    CREATE TRIGGER bible_verses_ad AFTER DELETE ON bible_verses BEGIN INSERT INTO bible_verses_fts(bible_verses_fts,rowid,text) VALUES('delete',old.id,old.text); END;
    CREATE TRIGGER bible_verses_au AFTER UPDATE ON bible_verses BEGIN INSERT INTO bible_verses_fts(bible_verses_fts,rowid,text) VALUES('delete',old.id,old.text); INSERT INTO bible_verses_fts(rowid,text) VALUES(new.id,new.text); END;`);
}

function cleanUsfmText(value) {
  return value
    .replace(/\\f\s[\s\S]*?\\f\*/g, ' ')
    .replace(/\\x\s[\s\S]*?\\x\*/g, ' ')
    .replace(/\\(?:add|bd|bdit|bk|dc|em|it|k|nd|ord|pn|qt|sc|sig|sls|tl|wj)\*?/g, '')
    .replace(/\\[a-z][a-z0-9-]*\*?(?:\s+)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUsfm(source) {
  const verses = [];
  let chapter = 0;
  const parts = String(source).replace(/^\uFEFF/, '').split(/(?=\\[cv]\s+)/g);
  for (const part of parts) {
    const chapterMatch = part.match(/^\\c\s+(\d+)/);
    if (chapterMatch) { chapter = Number(chapterMatch[1]); continue; }
    const verseMatch = part.match(/^\\v\s+([^\s]+)\s+([\s\S]*)$/);
    if (!verseMatch || !chapter) continue;
    const text = cleanUsfmText(verseMatch[2]);
    if (text) verses.push({ chapter, verse: verseMatch[1], verseOrder: Number.parseInt(verseMatch[1], 10) || 0, text });
  }
  return verses;
}

async function seedBible(database, archivePath = path.join(__dirname, '..', 'resources', 'bible', 'porbr2018_usfm.zip')) {
  const query = database.query;
  const existing = (await query("SELECT id FROM bible_translations WHERE code='BLIVRE' LIMIT 1")).rows[0];
  if (existing) return existing.id;
  if (!fs.existsSync(archivePath)) throw new Error('Arquivo offline da Bíblia Livre não encontrado.');
  const zip = new AdmZip(fs.readFileSync(archivePath));
  const entries = zip.getEntries();
  const sourceBooks = BOOKS.map(book => {
    const entry = entries.find(item => new RegExp(`-${book.code}porbr2018\\.usfm$`, 'i').test(item.entryName));
    if (!entry) throw new Error(`Livro ${book.code} ausente no arquivo da Bíblia Livre.`);
    return { book, verses: parseUsfm(entry.getData().toString('utf8')) };
  });
  await query('BEGIN');
  try {
    const translation = (await query('INSERT INTO bible_translations(code,name,language,license,source_url,source_version) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', ['BLIVRE','Bíblia Livre 2018','pt-BR',LICENSE_NOTICE,SOURCE_URL,'fontes de 12 de dezembro de 2025'])).rows[0];
    const rows = [];
    for (const { book, verses } of sourceBooks) {
      const bookId = (await query('INSERT INTO bible_books(translation_id,code,name,testament,canonical_order) VALUES($1,$2,$3,$4,$5) RETURNING id', [translation.id,book.code,book.name,book.testament,book.canonicalOrder])).rows[0].id;
      for (const verse of verses) rows.push({ translationId: translation.id, bookId, ...verse });
    }
    database.insertBibleVerses(rows);
    await query("INSERT INTO bible_verses_fts(bible_verses_fts) VALUES('rebuild')");
    await query('COMMIT');
    return translation.id;
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

function bibleSearchExpression(value) {
  const words = String(value || '').normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
  return words.slice(0, 12).map(word => `"${word.replace(/"/g, '""')}"`).join(' AND ');
}

module.exports = { BOOKS, LICENSE_NOTICE, SOURCE_URL, bibleSearchExpression, cleanUsfmText, createBibleSchema, parseUsfm, seedBible };
