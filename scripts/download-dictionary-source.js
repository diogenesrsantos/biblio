/* Explicit maintenance command. Review new content and licensing before rebuilding. */
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const base = { action: 'query', format: 'json', generator: 'allpages', gapnamespace: '108', gapprefix: 'Dicionário Bíblico Easton (1897)', gaplimit: '500', prop: 'revisions', rvprop: 'ids|timestamp|content', rvslots: 'main' };
  let continuation = {}, pages = new Map();
  do {
    const response = await fetch('https://pt.wikisource.org/w/api.php?' + new URLSearchParams({ ...base, ...continuation }), {
      headers: { 'User-Agent': 'Biblio/0.1.12 (offline dictionary import; https://github.com/diogenesrsantos/biblio)' }, signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error('Falha ao consultar Wikisource: HTTP ' + response.status);
    const data = await response.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    for (const page of Object.values(data.query?.pages || {})) if (page.revisions?.length) pages.set(page.pageid, page);
    continuation = data.continue;
  } while (continuation);
  if (!pages.size) throw new Error('A fonte não retornou páginas. O instantâneo anterior foi preservado.');
  const snapshot = { source: 'https://pt.wikisource.org', project: 'Em Tradução:Dicionário Bíblico Easton (1897)', license: 'CC BY-SA 4.0', pages: [...pages.values()].sort((a, b) => a.title.localeCompare(b.title, 'pt')) };
  const destination = path.join(__dirname, '..', 'resources', 'dictionary', 'wikisource-easton-pt.json');
  fs.writeFileSync(destination + '.download', JSON.stringify(snapshot, null, 2) + '\n');
  fs.renameSync(destination + '.download', destination);
  console.log(`${pages.size} páginas baixadas. Revise conteúdo, licença, contagem e hash antes de reconstruir o SQLite.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
