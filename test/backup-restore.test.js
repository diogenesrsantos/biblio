const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../database');
const { migrate } = require('../lib/schema');
const { createBackup } = require('../backup-service');
const { restoreBackup } = require('../restore-service');

test('backup e restauração preservam banco e mídias', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-backup-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  fs.mkdirSync(path.join(source, 'media'), { recursive: true });
  const database = createDatabase(path.join(source, 'biblio.db'));
  await migrate(database.query);
  await database.query("INSERT INTO settings(key,value) VALUES('teste','preservado')");
  database.close();
  fs.writeFileSync(path.join(source, 'media', 'arquivo.txt'), 'mídia');
  const archive = await createBackup(source);
  const destination = path.join(root, 'destination');
  const result = restoreBackup(archive, destination);
  assert.equal(result.metadata.format, 'biblio-backup');
  assert.equal(fs.readFileSync(path.join(destination, 'media', 'arquivo.txt'), 'utf8'), 'mídia');
  const restored = createDatabase(path.join(destination, 'biblio.db'));
  assert.equal((await restored.query("SELECT value FROM settings WHERE key='teste'")).rows[0].value, 'preservado');
  restored.close();
});
