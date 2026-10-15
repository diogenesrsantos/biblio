const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sanitizeHtml = require('sanitize-html');

const PREFIX = 'Em Tradução:Dicionário Bíblico Easton (1897)/';
const SOURCE = {
  name: 'Dicionário Bíblico Easton — tradução parcial em português',
  author: 'Matthew George Easton (1823–1894)',
  original: 'Illustrated Bible Dictionary, 3ª edição, Thomas Nelson, 1897 — domínio público',
  translators: 'Colaboradores do Wikisource em português; autoria da tradução registrada no histórico de cada página',
  license: 'Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional (CC BY-SA 4.0)',
  license_url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.pt',
  source_url: 'https://pt.wikisource.org/wiki/Em_Tradu%C3%A7%C3%A3o:Dicion%C3%A1rio_B%C3%ADblico_Easton_(1897)',
  language: 'pt',
  incomplete: true,
  adaptations: 'Conversão do wikitexto para texto simples e SQLite, referências em parênteses e índice de pesquisa. Sem completar ou retraduzir verbetes. Adaptação sob CC BY-SA 4.0.'
};

function withoutTemplates(text) {
  let result = '', depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.slice(i, i + 2) === '{{') { depth++; i++; }
    else if (depth && text.slice(i, i + 2) === '}}') { depth--; i++; }
    else if (!depth) result += text[i];
  }
  return result;
}
function plainWiki(text) {
  text = withoutTemplates(text).replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<center\b[^>]*>[\s\S]*?<\/center>/gi, '')
    .split(/^==\s*Notas?\s*==/mi)[0]
    .replace(/\[\[(?:Categoria|Ficheiro|Arquivo):[^\]]*\]\]/gi, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target.replace(/^\.\.\//, '').replace(/^w:/, ''))
    .replace(/<ref\b[^>]*>([\s\S]*?)<\/ref>/gi, ' ($1)')
    .replace(/<ref\b[^>]*\/\s*>/gi, '')
    .replace(/'{2,5}/g, '')
    .replace(/<br\s*\/?\s*>/gi, '\n');
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} })
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function snapshotEntries(snapshot) {
  return snapshot.pages.filter(page => page.title.startsWith(PREFIX) && !/^[A-Z]$/.test(page.title.slice(PREFIX.length)))
    .map(page => {
      const revision = page.revisions[0], raw = revision.slots.main['*'];
      if (/^\s*#(?:redirect|redirecionamento)/i.test(raw)) return null;
      const text = plainWiki(raw);
      if (!text) return null;
      return { title: page.title.slice(PREFIX.length).replace(' (entrada)', ''), text, page_id: page.pageid, revision_id: revision.revid, revised_at: revision.timestamp,
        source_url: `https://pt.wikisource.org/w/index.php?oldid=${revision.revid}`,
        history_url: `https://pt.wikisource.org/w/index.php?title=${encodeURIComponent(page.title)}&action=history` };
    }).filter(Boolean).sort((a, b) => a.title.localeCompare(b.title, 'pt'));
}
function dictionarySearchExpression(term) {
  const words = String(term || '').normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
  return words.slice(0, 10).map(word => `"${word}"*`).join(' AND ');
}
async function buildDictionary(database, file = path.join(__dirname, '..', 'resources', 'dictionary', 'wikisource-easton-pt.json')) {
  const raw = fs.readFileSync(file), snapshot = JSON.parse(raw), entries = snapshotEntries(snapshot);
  if (!entries.length) throw new Error('Nenhum verbete traduzido encontrado.');
  const source = { ...SOURCE, snapshot_sha256: crypto.createHash('sha256').update(raw).digest('hex'), entry_count: entries.length };
  return writeDictionary(database, source, entries);
}
async function writeDictionary(database, source, entries) {
  await database.query(`CREATE TABLE dictionary_source (metadata TEXT NOT NULL);
    CREATE TABLE dictionary_entries (id INTEGER PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, page_id INTEGER NOT NULL, revision_id INTEGER NOT NULL, revised_at TEXT NOT NULL, source_url TEXT NOT NULL, history_url TEXT NOT NULL);
    CREATE VIRTUAL TABLE dictionary_entries_fts USING fts5(title,text,content='dictionary_entries',content_rowid='id',tokenize='unicode61 remove_diacritics 2');`);
  await database.query('BEGIN');
  try {
    await database.query('INSERT INTO dictionary_source(metadata) VALUES($1)', [JSON.stringify(source)]);
    for (const entry of entries) await database.query('INSERT INTO dictionary_entries(title,text,page_id,revision_id,revised_at,source_url,history_url) VALUES($1,$2,$3,$4,$5,$6,$7)', Object.values(entry));
    await database.query("INSERT INTO dictionary_entries_fts(dictionary_entries_fts) VALUES('rebuild')");
    await database.query('COMMIT');
  } catch (error) { await database.query('ROLLBACK'); throw error; }
  return source;
}
async function buildEnglishDictionary(database, directory = path.join(__dirname, '..', 'resources', 'dictionary')) {
  const raw = fs.readFileSync(path.join(directory, 'getbible-easton-en.json'));
  const metadataRaw = fs.readFileSync(path.join(directory, 'getbible-easton-en-metadata.json'));
  const snapshot = JSON.parse(raw), metadata = JSON.parse(metadataRaw);
  const hashes = JSON.parse(fs.readFileSync(path.join(directory, 'getbible-easton-en-hashes.json')));
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  if (digest(raw) !== hashes.files['easton.json'] || digest(metadataRaw) !== hashes.files['easton/metadata.json']) throw new Error('SHA-256 da edição inglesa diverge do manifesto da fonte.');
  if (snapshot.language !== 'en' || snapshot.dictionary !== 'easton' || metadata.license !== 'Public Domain' || snapshot.entries.length !== metadata.entry_count) throw new Error('Fonte inglesa inválida ou incompleta.');
  const seen = new Set();
  const entries = snapshot.entries.map(entry => {
    if (!entry.id || seen.has(entry.id) || !entry.key || !entry.text || entry.language !== 'en') throw new Error('Verbete inglês inválido ou duplicado.');
    seen.add(entry.id);
    return { title: entry.key, text: entry.text, page_id: 0, revision_id: 0, revised_at: '', source_url: `https://dictionaries.getbible.net/v1/easton/${encodeURIComponent(entry.id)}.json`, history_url: '' };
  });
  const source = {
    name: 'Easton’s Bible Dictionary — edição em inglês', author: SOURCE.author, original: SOURCE.original,
    license: 'Domínio público (Public Domain)', license_url: 'https://www.crosswire.org/sword/copyright/ModInfoCopyright.jsp?modName=Easton',
    source_url: 'https://dictionaries.getbible.net/v1/easton/metadata.json', language: 'en', incomplete: false,
    distributors: 'Texto eletrônico: Christian Classics Ethereal Library (CCEL). Módulo: CrossWire Bible Society / SWORD. Conversão e distribuição JSON: GetBible.',
    adaptations: 'Conversão do JSON GetBible para SQLite e índice de pesquisa pela Biblio. Texto inglês preservado, sem tradução; ilustrações não estão incluídas no módulo de origem.',
    snapshot_sha256: digest(raw), entry_count: entries.length, unique_key_count: metadata.unique_key_count, source_version: metadata.version,
    upstream_metadata: metadata
  };
  return writeDictionary(database, source, entries);
}
module.exports = { SOURCE, plainWiki, snapshotEntries, dictionarySearchExpression, buildDictionary, buildEnglishDictionary };
