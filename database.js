const Database = require('better-sqlite3');

function sqliteSql(sql) {
  return sql
    .replace(/now\(\)\+interval '30 days'/gi, "datetime('now', '+30 days')")
    .replace(/now\(\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/ILIKE/gi, 'LIKE')
    .replace(/::int/gi, '')
    .replace(/\$\d+/g, '?');
}

function isReturning(sql) {
  return /^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql) || /\bRETURNING\b/i.test(sql);
}

function createDatabase(file, options = {}) {
  const db = new Database(file, options.readonly ? { readonly: true, fileMustExist: true } : undefined);
  const statements = new Map();
  if (!options.readonly) db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const query = async (sql, values = []) => {
    const preparedSql = sqliteSql(sql);
    const preparedValues = /\$\d+/.test(sql)
      ? [...sql.matchAll(/\$(\d+)/g)].map(match => values[Number(match[1]) - 1])
      : values;
    if (!values.length && preparedSql.trim().replace(/;\s*$/, '').includes(';')) {
      db.exec(preparedSql);
      return { rows: [], rowCount: 0 };
    }
    let statement = statements.get(preparedSql);
    if (!statement) { statement = db.prepare(preparedSql); statements.set(preparedSql, statement); }
    if (isReturning(sql)) {
      const rows = statement.all(...preparedValues);
      return { rows, rowCount: rows.length };
    }
    const result = statement.run(...preparedValues);
    return { rows: [], rowCount: result.changes };
  };

  return {
    query,
    connect: async () => ({ query, release() {} }),
    close() { statements.clear(); db.close(); },
    checkpoint() { db.pragma('wal_checkpoint(TRUNCATE)'); },
    backup(destination) { return db.backup(destination); },
    integrityCheck() { return db.pragma('integrity_check').map(row => row.integrity_check); },
    insertBibleVerses(rows) {
      const statement = db.prepare('INSERT INTO bible_verses(translation_id,book_id,chapter,verse,verse_order,text) VALUES(?,?,?,?,?,?)');
      for (const row of rows) statement.run(row.translationId,row.bookId,row.chapter,row.verse,row.verseOrder,row.text);
    }
  };
}

module.exports = { createDatabase };
