import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";

const DB_FILENAME = ".sanctum/index.db";

export function getDbPath(vaultPath: string): string {
  return path.join(vaultPath, DB_FILENAME);
}

export function openDatabase(vaultPath: string): Database.Database {
  const dbPath = getDbPath(vaultPath);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return db;
}

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      path      TEXT UNIQUE NOT NULL,
      title     TEXT DEFAULT '',
      folder    TEXT DEFAULT '',
      tags      TEXT DEFAULT '[]',
      content   TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      indexed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      path, title, content, tags,
      tokenize='porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS term_index (
      term      TEXT NOT NULL,
      doc_id    INTEGER NOT NULL,
      frequency INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (term, doc_id),
      FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder);
    CREATE INDEX IF NOT EXISTS idx_term_index_term ON term_index(term);
  `);
}

export function closeDatabase(db: Database.Database): void {
  db.close();
}
