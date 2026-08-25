const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const [key, ...value] = line.split('=');
    if (key && !process.env[key]) process.env[key] = value.join('=');
  }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não foi configurada.');

const sqlite = new Database(path.join(root, 'data', 'biblio.db'), { readonly: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tables = ['themes', 'users', 'articles', 'authors', 'tags', 'sources', 'attachments', 'article_authors', 'article_tags', 'article_sources'];
const sequenceTables = ['themes', 'users', 'articles', 'authors', 'tags', 'sources', 'attachments'];
const columns = {
  themes: ['id', 'name', 'created_at'],
  users: ['id', 'username', 'password_hash', 'created_at'],
  articles: ['id', 'title', 'summary', 'content', 'written_date', 'language', 'theme_id', 'created_at', 'updated_at'],
  authors: ['id', 'name'], tags: ['id', 'name'], sources: ['id', 'title', 'url', 'publisher', 'source_date'],
  attachments: ['id', 'article_id', 'original_name', 'storage_name', 'mime_type', 'size_bytes', 'created_at'],
  article_authors: ['article_id', 'author_id'], article_tags: ['article_id', 'tag_id'], article_sources: ['article_id', 'source_id']
};

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of tables) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      const names = columns[table];
      const marks = names.map((_, index) => `$${index + 1}`).join(', ');
      for (const row of rows) {
        const values = names.map(name => name === 'written_date' && row[name] === '' ? null : (row[name] ?? null));
        await client.query(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${marks}) ON CONFLICT DO NOTHING`, values);
      }
    }
    for (const table of sequenceTables) await client.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), (SELECT COUNT(*) > 0 FROM ${table}))`, [table]);
    await client.query('COMMIT');
    console.log('Migração concluída.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    sqlite.close();
    await pool.end();
  }
})().catch(error => { console.error(error.message); process.exit(1); });
