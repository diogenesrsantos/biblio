/* Explicit maintenance download; runtime reading never calls GetBible. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

async function main() {
  const base = 'https://dictionaries.getbible.net/v1/';
  async function download(name) {
    const response = await fetch(base + name, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error('Falha no download: HTTP ' + response.status);
    return Buffer.from(await response.arrayBuffer());
  }
  const hashes = JSON.parse((await download('hashes.json')).toString());
  const selected = {}, files = [];
  for (const [remote, local] of [['easton.json', 'getbible-easton-en.json'], ['easton/metadata.json', 'getbible-easton-en-metadata.json']]) {
    const raw = await download(remote), digest = crypto.createHash('sha256').update(raw).digest('hex');
    if (digest !== hashes.files[remote]) throw new Error('Hash divergente. Repita o download para obter arquivos da mesma publicação.');
    selected[remote] = digest; files.push([local, raw]);
  }
  const dictionary = JSON.parse(files[0][1]), metadata = JSON.parse(files[1][1]);
  if (dictionary.language !== 'en' || metadata.license !== 'Public Domain' || dictionary.entries.length !== metadata.entry_count) throw new Error('Fonte inválida: revise idioma, licença e contagem.');
  files.push(['getbible-easton-en-hashes.json', JSON.stringify({ source: base + 'hashes.json', algorithm: 'sha256', files: selected }, null, 2) + '\n']);
  const directory = path.join(__dirname, '..', 'resources', 'dictionary');
  for (const [name, raw] of files) fs.writeFileSync(path.join(directory, name + '.download'), raw);
  for (const [name] of files) fs.renameSync(path.join(directory, name + '.download'), path.join(directory, name));
  console.log(`${dictionary.entries.length} verbetes baixados e verificados. Revise fontes e documentação antes de reconstruir o SQLite.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
