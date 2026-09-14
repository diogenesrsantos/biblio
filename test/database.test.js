const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../database');
const { migrate, MIGRATIONS } = require('../lib/schema');

test('migra banco novo de forma idempotente', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-db-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = createDatabase(path.join(directory, 'biblio.db'));
  t.after(() => database.close());
  await migrate(database.query);
  await migrate(database.query);
  const versions = (await database.query('SELECT version FROM schema_migrations ORDER BY version')).rows;
  assert.deepEqual(versions.map(row => row.version), MIGRATIONS.map(item => item.version));
  assert.equal((await database.query('SELECT * FROM themes')).rows.length, 4);
  assert.equal((await database.query('SELECT * FROM articles WHERE is_library_home=1')).rows.length, 1);
  assert.deepEqual(database.integrityCheck(), ['ok']);
});
