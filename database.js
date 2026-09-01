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

function createDatabase(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const query = async (sql, values = []) => {
    const preparedSql = sqliteSql(sql);
    if (!values.length && preparedSql.trim().replace(/;\s*$/, '').includes(';')) {
      db.exec(preparedSql);
      return { rows: [], rowCount: 0 };
    }
    const statement = db.prepare(preparedSql);
    if (isReturning(sql)) {
      const rows = statement.all(...values);
      return { rows, rowCount: rows.length };
    }
    const result = statement.run(...values);
    return { rows: [], rowCount: result.changes };
  };

  return {
    query,
    connect: async () => ({ query, release() {} }),
    close() { db.close(); },
    checkpoint() { db.pragma('wal_checkpoint(TRUNCATE)'); },
    backup(destination) { return db.backup(destination); }
  };
}

module.exports = { createDatabase };
