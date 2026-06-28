import type Database from "better-sqlite3";
import { openDatabase, migrate } from "./database.js";

export interface SearchResult {
  path: string;
  title: string;
  folder: string;
  snippet: string;
  relevance: number;
}

function escapeFts5(query: string): string {
  return query
    .replace(/'/g, "''")
    .replace(/[()"*]/g, "")
    .trim();
}

export function search(
  vaultPath: string,
  query: string,
  limit = 10,
  folderFilter?: string
): SearchResult[] {
  const db = openDatabase(vaultPath);
  migrate(db);

  try {
    const escaped = escapeFts5(query);
    if (!escaped) return [];

    const terms = escaped.split(/\s+/).filter(Boolean).join(" AND ");

    const ftsQuery = `"${terms}"`;

    let sql = `
      SELECT
        d.path,
        d.title,
        d.folder,
        snippet(documents_fts, 2, '▶', '◀', '...', 25) as snippet_raw,
        rank
      FROM documents_fts f
      JOIN documents d ON d.id = f.rowid
      WHERE documents_fts MATCH ?
    `;

    const params: unknown[] = [ftsQuery];

    if (folderFilter) {
      sql += ` AND d.folder = ?`;
      params.push(folderFilter);
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Array<{
      path: string;
      title: string;
      folder: string;
      snippet_raw: string;
      rank: number;
    }>;

    return rows.map((r) => ({
      path: r.path,
      title: r.title,
      folder: r.folder,
      snippet: r.snippet_raw,
      relevance: Math.round((1 / (r.rank + 1)) * 1000) / 10,
    }));
  } finally {
    db.close();
  }
}

export function searchAndCollect(
  vaultPath: string,
  query: string,
  limit = 10,
  folderFilter?: string
): string {
  const results = search(vaultPath, query, limit, folderFilter);

  if (results.length === 0) {
    return "";
  }

  const parts = results.map(
    (r, i) =>
      `[Resultado ${i + 1}] ${r.title} (${r.path})\nRelevancia: ${r.relevance}%\n\n${r.snippet}`
  );

  return `Resultados de búsqueda para "${query}":\n\n${parts.join("\n\n---\n\n")}`;
}

export function getKeywordSuggestions(
  vaultPath: string,
  prefix: string,
  limit = 10
): string[] {
  const db = openDatabase(vaultPath);
  migrate(db);

  try {
    const rows = db
      .prepare(
        `
      SELECT term, SUM(frequency) as total
      FROM term_index
      WHERE term LIKE ?
      GROUP BY term
      ORDER BY total DESC
      LIMIT ?
    `
      )
      .all(`${prefix.toLowerCase()}%`, limit) as Array<{
      term: string;
      total: number;
    }>;

    return rows.map((r) => r.term);
  } finally {
    db.close();
  }
}
