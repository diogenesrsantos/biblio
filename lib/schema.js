const MIGRATIONS = [
  {
    version: 1,
    async up(query) {
      await query(`CREATE TABLE IF NOT EXISTS themes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, parent_id INTEGER REFERENCES themes(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, title_color TEXT NOT NULL DEFAULT '#253229', summary TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', content_format TEXT NOT NULL DEFAULT 'html', is_theme_home INTEGER NOT NULL DEFAULT 0, written_date TEXT, language TEXT NOT NULL DEFAULT 'pt-BR', theme_id INTEGER REFERENCES themes(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS authors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS article_authors (article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE, author_id INTEGER REFERENCES authors(id) ON DELETE CASCADE, PRIMARY KEY(article_id,author_id));
        CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS article_tags (article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE, tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(article_id,tag_id));
        CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT, publisher TEXT, source_date TEXT);
        CREATE TABLE IF NOT EXISTS article_sources (article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE, source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE, PRIMARY KEY(article_id,source_id));
        CREATE TABLE IF NOT EXISTS attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE, original_name TEXT NOT NULL, storage_name TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
      const articleColumns = (await query('PRAGMA table_info(articles)')).rows.map(column => column.name);
      const themeColumns = (await query('PRAGMA table_info(themes)')).rows.map(column => column.name);
      if (!themeColumns.includes('parent_id')) await query('ALTER TABLE themes ADD COLUMN parent_id INTEGER REFERENCES themes(id) ON DELETE RESTRICT');
      if (!articleColumns.includes('content_format')) await query("ALTER TABLE articles ADD COLUMN content_format TEXT NOT NULL DEFAULT 'plain'");
      if (!articleColumns.includes('title_color')) await query("ALTER TABLE articles ADD COLUMN title_color TEXT NOT NULL DEFAULT '#253229'");
      if (!articleColumns.includes('is_theme_home')) await query('ALTER TABLE articles ADD COLUMN is_theme_home INTEGER NOT NULL DEFAULT 0');
    }
  },
  {
    version: 2,
    async up(query) {
      await query('CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at); CREATE INDEX IF NOT EXISTS idx_articles_theme_updated ON articles(theme_id, updated_at DESC); CREATE INDEX IF NOT EXISTS idx_themes_parent ON themes(parent_id); CREATE INDEX IF NOT EXISTS idx_attachments_article ON attachments(article_id);');
    }
  },
  {
    version: 3,
    async up(query) {
      const columns = (await query('PRAGMA table_info(articles)')).rows.map(column => column.name);
      if (!columns.includes('is_library_home')) await query('ALTER TABLE articles ADD COLUMN is_library_home INTEGER NOT NULL DEFAULT 0');
      await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_library_home ON articles(is_library_home) WHERE is_library_home=1');
      await query(`INSERT INTO articles(title,title_color,summary,content,content_format,is_library_home,language)
        SELECT 'Bem-vindo à minha biblioteca','#253229','Página inicial da biblioteca','<h2>Bem-vindo</h2><p>Esta é a página inicial da sua biblioteca. Use o botão de edição para personalizar este texto, acrescentar imagens, links, listas, tabelas e tudo o que desejar.</p><p>Seu acervo pode guardar leituras, estudos, ideias e referências importantes.</p>','html',1,'pt-BR'
        WHERE NOT EXISTS (SELECT 1 FROM articles WHERE is_library_home=1)`);
    }
  },
  {
    version: 4,
    async up(query) {
      const columns = (await query('PRAGMA table_info(articles)')).rows.map(column => column.name);
      if (!columns.includes('title_align')) await query("ALTER TABLE articles ADD COLUMN title_align TEXT NOT NULL DEFAULT 'left'");
    }
  },
  {
    version: 5,
    async up(query) {
      const columns = (await query('PRAGMA table_info(articles)')).rows.map(column => column.name);
      if (!columns.includes('title_size')) await query("ALTER TABLE articles ADD COLUMN title_size REAL NOT NULL DEFAULT 3.5");
      if (!columns.includes('title_margin_top')) await query("ALTER TABLE articles ADD COLUMN title_margin_top INTEGER NOT NULL DEFAULT 0");
      if (!columns.includes('title_margin_bottom')) await query("ALTER TABLE articles ADD COLUMN title_margin_bottom INTEGER NOT NULL DEFAULT 40");
    }
  }
];

async function migrate(query) {
  await query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const applied = new Set((await query('SELECT version FROM schema_migrations')).rows.map(row => row.version));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    await query('BEGIN');
    try {
      await migration.up(query);
      await query('INSERT INTO schema_migrations(version) VALUES($1)', [migration.version]);
      await query('COMMIT');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  }
  for (const name of ['Teologia', 'Filosofia', 'Culinária', 'Pensamentos']) await query('INSERT INTO themes(name) VALUES($1) ON CONFLICT DO NOTHING', [name]);
}

module.exports = { MIGRATIONS, migrate };
