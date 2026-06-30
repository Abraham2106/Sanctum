import type Database from "better-sqlite3";
import { openDatabase, migrate } from "./database.js";
import { embedText, cosineSimilarity, deserializeVector, isEmbeddingAvailable } from "./embedder.js";

export interface SearchResult {
  path: string;
  title: string;
  folder: string;
  snippet: string;
  relevance: number;
}

export interface HybridSearchResult extends SearchResult {
  ftsScore: number;
  semanticScore: number;
  combinedScore: number;
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

export async function hybridSearch(
  vaultPath: string,
  query: string,
  limit = 10,
  folderFilter?: string,
  alpha = 0.5
): Promise<HybridSearchResult[]> {
  const db = openDatabase(vaultPath);
  migrate(db);

  try {
    const escaped = escapeFts5(query);
    if (!escaped) return [];

    const terms = escaped.split(/\s+/).filter(Boolean).join(" AND ");
    const ftsQuery = `"${terms}"`;

    let sql = `
      SELECT
        d.id,
        d.path,
        d.title,
        d.folder,
        snippet(documents_fts, 2, '▶', '◀', '...', 25) as snippet_raw,
        rank,
        e.vector as embedding_blob,
        e.model as embedding_model
      FROM documents_fts f
      JOIN documents d ON d.id = f.rowid
      LEFT JOIN embeddings e ON e.doc_id = d.id
      WHERE documents_fts MATCH ?
    `;

    const params: unknown[] = [ftsQuery];

    if (folderFilter) {
      sql += ` AND d.folder = ?`;
      params.push(folderFilter);
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit * 2);

    const rows = db.prepare(sql).all(...params) as Array<{
      id: number;
      path: string;
      title: string;
      folder: string;
      snippet_raw: string;
      rank: number;
      embedding_blob: Buffer | null;
      embedding_model: string | null;
    }>;

    if (rows.length === 0) return [];

    // Si no hay embeddings disponibles o ningun doc tiene embedding, devolver FTS5 puro
    const hasEmbeddings = rows.some((r) => r.embedding_blob !== null);
    if (!hasEmbeddings) {
      return rows.slice(0, limit).map((r) => ({
        path: r.path,
        title: r.title,
        folder: r.folder,
        snippet: r.snippet_raw,
        relevance: Math.round((1 / (r.rank + 1)) * 1000) / 10,
        ftsScore: 1 / (r.rank + 1),
        semanticScore: 0,
        combinedScore: 1 / (r.rank + 1),
      }));
    }

    // Embed the query
    const queryEmbedding = await embedText(query);
    if (!queryEmbedding) {
      // Fallback a FTS5
      return rows.slice(0, limit).map((r) => ({
        path: r.path,
        title: r.title,
        folder: r.folder,
        snippet: r.snippet_raw,
        relevance: Math.round((1 / (r.rank + 1)) * 1000) / 10,
        ftsScore: 1 / (r.rank + 1),
        semanticScore: 0,
        combinedScore: 1 / (r.rank + 1),
      }));
    }

    const queryVec = queryEmbedding.vector;

    // Build results with combined scores
    const results: HybridSearchResult[] = [];

    for (const r of rows) {
      const ftsScore = 1 / (r.rank + 1);

      let semanticScore = 0;
      if (r.embedding_blob) {
        const docVec = deserializeVector(r.embedding_blob);
        semanticScore = cosineSimilarity(queryVec, docVec);
      }

      const combinedScore = alpha * ftsScore + (1 - alpha) * semanticScore;

      results.push({
        path: r.path,
        title: r.title,
        folder: r.folder,
        snippet: r.snippet_raw,
        relevance: Math.round(combinedScore * 1000) / 10,
        ftsScore: Math.round(ftsScore * 1000) / 10,
        semanticScore: Math.round(semanticScore * 1000) / 10,
        combinedScore: Math.round(combinedScore * 1000) / 10,
      });
    }

    results.sort((a, b) => b.combinedScore - a.combinedScore);
    return results.slice(0, limit);
  } finally {
    db.close();
  }
}

export async function searchAndCollectHybrid(
  vaultPath: string,
  query: string,
  limit = 10,
  folderFilter?: string,
  alpha = 0.5
): Promise<string> {
  const results = await hybridSearch(vaultPath, query, limit, folderFilter, alpha);

  if (results.length === 0) return "";

  const parts = results.map((r, i) => {
    const scores = `(fts:${r.ftsScore}% sem:${r.semanticScore}%)`;
    return `[Resultado ${i + 1}] ${r.title} (${r.path})\nRelevancia: ${r.relevance}% ${scores}\n\n${r.snippet}`;
  });

  return `Resultados de búsqueda híbrida para "${query}":\n\n${parts.join("\n\n---\n\n")}`;
}

export function searchAndCollect(
  vaultPath: string,
  query: string,
  limit = 10,
  folderFilter?: string
): string {
  const results = search(vaultPath, query, limit, folderFilter);

  if (results.length === 0) return "";

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
