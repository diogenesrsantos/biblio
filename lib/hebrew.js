const fs = require('node:fs');
const path = require('node:path');
const { BOOKS } = require('./bible');

const SOURCE = {
  name: 'Dicionário UBS de Hebraico Bíblico — edição condensada em português',
  copyright: 'UBS Dictionary of Biblical Hebrew © United Bible Societies, 2023',
  license: 'Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional (CC BY-SA 4.0)',
  sourceUrl: 'https://github.com/ubsicap/ubs-open-license',
  derivativeUrl: 'https://github.com/TJacquesCore/Bible-Studio',
  sourceVersion: 'Bible Studio f8c093517e1946a1c48c329334ea2bf246f2363b',
  language: 'pt-BR'
};

function stripHebrewMarks(value) {
  return String(value || '').normalize('NFD').replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, '').normalize('NFC');
}

function normalizeSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function transliterateHebrew(value) {
  const source = String(value || '').normalize('NFD')
    .replace(/ו\u05BC/g, 'u')
    .replace(/ו\u05B9/g, 'o')
    .replace(/ש\u05BC?\u05C2/g, 's')
    .replace(/ש\u05BC?\u05C1/g, 'sh');
  const consonants = { א:'',ב:'b',ג:'g',ד:'d',ה:'h',ו:'v',ז:'z',ח:'h',ט:'t',י:'y',כ:'k',ך:'k',ל:'l',מ:'m',ם:'m',נ:'n',ן:'n',ס:'s',ע:'',פ:'p',ף:'p',צ:'ts',ץ:'ts',ק:'q',ר:'r',ש:'sh',ת:'t' };
  const vowels = { '\u05B0':'e','\u05B1':'e','\u05B2':'a','\u05B3':'o','\u05B4':'i','\u05B5':'e','\u05B6':'e','\u05B7':'a','\u05B8':'a','\u05B9':'o','\u05BA':'o','\u05BB':'u','\u05C7':'a' };
  let result = '';
  for (const character of source) {
    if (Object.hasOwn(consonants, character)) result += consonants[character];
    else if (Object.hasOwn(vowels, character)) result += vowels[character];
    else if (!/[\u0591-\u05C7]/u.test(character)) result += character;
  }
  return result.replace(/ov/g, 'o').replace(/iy/g, 'i').replace(/ey/g, 'e').replace(/(.)\1{2,}/g, '$1$1').replace(/[^a-z0-9 -]/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function translatePartOfSpeech(value) {
  const pieces = String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  const labels = {
    adj: 'adjetivo', adv: 'advérbio', conj: 'conjunção', 'dem.pron': 'pronome demonstrativo',
    inter: 'interrogativo', 'inter.pron': 'pronome interrogativo', intj: 'interjeição',
    name: 'nome próprio', neg: 'partícula negativa', noun: 'substantivo',
    'pers.pron': 'pronome pessoal', prep: 'preposição', verb: 'verbo'
  };
  return pieces.map(piece => {
    const [kind, ...qualifiers] = piece.split(/\s+/);
    const suffix = qualifiers.map(item => ({ m:'masculino',f:'feminino',c:'comum',pl:'plural',du:'dual' })[item] || item).join(' ');
    return [labels[kind] || kind, suffix].filter(Boolean).join(' ');
  }).join(', ');
}

function cleanLexiconText(value) {
  return String(value || '')
    .replace(/\{L:([^<{]+)(?:<[^}]+>)?\}/g, '$1')
    .replace(/\{[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStrong(value) {
  const match = String(value || '').trim().match(/^([HA])0*(\d+)$/i);
  return match ? `${match[1].toUpperCase()}${match[2].padStart(4, '0')}` : '';
}

function hebrewSearchExpression(value) {
  const raw = String(value || '').trim();
  const strong = normalizeStrong(raw);
  const normalized = /[\u0590-\u05FF]/u.test(raw) ? stripHebrewMarks(raw) : normalizeSearch(raw);
  const words = (strong || normalized).match(/[\p{L}\p{N}]+/gu) || [];
  return words.slice(0, 8).map(word => `"${word.replace(/"/g, '""')}"*`).join(' AND ');
}

async function createHebrewSchema(query) {
  await query(`CREATE TABLE hebrew_sources (id INTEGER PRIMARY KEY, name TEXT NOT NULL, copyright TEXT NOT NULL, license TEXT NOT NULL, source_url TEXT NOT NULL, derivative_url TEXT NOT NULL, source_version TEXT NOT NULL, language TEXT NOT NULL);
    CREATE TABLE hebrew_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, lemma TEXT NOT NULL, lemma_plain TEXT NOT NULL, transliteration TEXT NOT NULL, strong_codes TEXT NOT NULL, glosses TEXT NOT NULL, domains TEXT NOT NULL, parts_of_speech TEXT NOT NULL);
    CREATE TABLE hebrew_senses (id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id INTEGER NOT NULL REFERENCES hebrew_entries(id) ON DELETE CASCADE, sense_order INTEGER NOT NULL, part_of_speech TEXT NOT NULL, domain TEXT NOT NULL, glosses_json TEXT NOT NULL, definition TEXT NOT NULL, references_json TEXT NOT NULL);
    CREATE INDEX idx_hebrew_entries_plain ON hebrew_entries(lemma_plain);
    CREATE INDEX idx_hebrew_senses_entry ON hebrew_senses(entry_id,sense_order);
    CREATE VIRTUAL TABLE hebrew_entries_fts USING fts5(lemma,lemma_plain,transliteration,strong_codes,content,tokenize='unicode61 remove_diacritics 2');`);
}

async function seedHebrew(database, sourcePath = path.join(__dirname, '..', 'resources', 'hebrew', 'ubs-hebrew-pt.json')) {
  if (!fs.existsSync(sourcePath)) throw new Error('Fonte do dicionário de hebraico não encontrada.');
  const data = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (data.script !== 'hebrew' || data.language !== 'pt' || !Array.isArray(data.entries)) throw new Error('Fonte do dicionário de hebraico inválida.');
  const query = database.query;
  await query('BEGIN');
  try {
    await query('INSERT INTO hebrew_sources(id,name,copyright,license,source_url,derivative_url,source_version,language) VALUES(1,$1,$2,$3,$4,$5,$6,$7)', [SOURCE.name,SOURCE.copyright,SOURCE.license,SOURCE.sourceUrl,SOURCE.derivativeUrl,SOURCE.sourceVersion,SOURCE.language]);
    for (const entry of data.entries) {
      const senses = Array.isArray(entry.m) ? entry.m : [];
      const strongCodes = [...new Set((entry.s || []).map(normalizeStrong).filter(Boolean))];
      const glosses = [...new Set(senses.flatMap(sense => (sense.g || []).map(cleanLexiconText)).filter(Boolean))];
      const domains = [...new Set(senses.map(sense => cleanLexiconText(sense.d)).filter(Boolean))];
      const parts = [...new Set(senses.map(sense => translatePartOfSpeech(sense.p)).filter(Boolean))];
      const lemma = String(entry.l || '').normalize('NFC');
      const lemmaPlain = stripHebrewMarks(lemma);
      const transliteration = transliterateHebrew(lemma);
      const inserted = (await query('INSERT INTO hebrew_entries(lemma,lemma_plain,transliteration,strong_codes,glosses,domains,parts_of_speech) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [lemma,lemmaPlain,transliteration,strongCodes.join(' '),glosses.join('; '),domains.join('; '),parts.join('; ')])).rows[0];
      for (const [index, sense] of senses.entries()) await query('INSERT INTO hebrew_senses(entry_id,sense_order,part_of_speech,domain,glosses_json,definition,references_json) VALUES($1,$2,$3,$4,$5,$6,$7)', [inserted.id,index,translatePartOfSpeech(sense.p),cleanLexiconText(sense.d),JSON.stringify((sense.g || []).map(cleanLexiconText).filter(Boolean)),cleanLexiconText(sense.f),JSON.stringify(sense.r || [])]);
      const content = normalizeSearch([glosses.join(' '),domains.join(' '),parts.join(' '),...senses.map(sense => cleanLexiconText(sense.f))].join(' '));
      await query('INSERT INTO hebrew_entries_fts(rowid,lemma,lemma_plain,transliteration,strong_codes,content) VALUES($1,$2,$3,$4,$5,$6)', [inserted.id,lemma,lemmaPlain,transliteration,strongCodes.join(' '),content]);
    }
    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

function decodeHebrewReference(value) {
  const match = String(value || '').match(/^(\d{3})(\d{3})(\d{3})/);
  if (!match) return null;
  const book = BOOKS[Number(match[1]) - 1];
  if (!book) return null;
  return { code: book.code, book_name: book.name, chapter: Number(match[2]), verse: Number(match[3]) };
}

module.exports = { SOURCE, cleanLexiconText, createHebrewSchema, decodeHebrewReference, hebrewSearchExpression, normalizeSearch, normalizeStrong, seedHebrew, stripHebrewMarks, translatePartOfSpeech, transliterateHebrew };
