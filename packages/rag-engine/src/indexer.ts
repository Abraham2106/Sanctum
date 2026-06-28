import * as fs from "node:fs/promises";
import * as path from "node:path";
import type Database from "better-sqlite3";
import { openDatabase, migrate } from "./database.js";
import { tokenize, computeFrequencies } from "./tokenizer.js";

export interface IndexableFile {
  vaultPath: string;
  relativePath: string;
  content: string;
}

export interface IndexStats {
  documentsIndexed: number;
  termsIndexed: number;
  elapsedMs: number;
}

function extractTitle(content: string): string {
  const firstLine = content.split("\n")[0] || "";
  return firstLine.replace(/^#\s*/, "").trim();
}

function extractTags(content: string): string[] {
  const tags: string[] = [];
  const tagRegex = /#([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9_-]+)/g;
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

async function walkVault(
  vaultPath: string,
  folders?: string[]
): Promise<IndexableFile[]> {
  const files: IndexableFile[] = [];
  const dirs = folders
    ? folders.map((f) => path.resolve(vaultPath, f))
    : [vaultPath];

  for (const dir of dirs) {
    try {
      await fs.stat(dir);
    } catch {
      continue;
    }
    await walkDir(dir, vaultPath, files);
  }

  return files;
}

async function walkDir(
  dir: string,
  vaultPath: string,
  acc: IndexableFile[]
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(vaultPath, fullPath).replace(/\\/g, "/");

    if (entry.name.startsWith(".") || entry.name === "_logs") continue;

    if (entry.isDirectory()) {
      await walkDir(fullPath, vaultPath, acc);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".md") || entry.name.endsWith(".json"))
    ) {
      try {
        const content = await fs.readFile(fullPath, "utf-8");
        acc.push({ vaultPath, relativePath, content });
      } catch {
        continue;
      }
    }
  }
}

export async function indexFile(
  vaultPath: string,
  relativePath: string,
  content: string
): Promise<void> {
  const db = openDatabase(vaultPath);
  migrate(db);

  try {
    const tokens = tokenize(content);
    const frequencies = computeFrequencies(tokens);
    const title = extractTitle(content);
    const tags = extractTags(content);
    const folder = path.dirname(relativePath).replace(/\\/g, "/");

    const upsert = db.prepare(`
      INSERT INTO documents (path, title, folder, tags, content, updated_at, indexed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(path) DO UPDATE SET
        title = excluded.title,
        content = excluded.content,
        tags = excluded.tags,
        updated_at = datetime('now'),
        indexed_at = datetime('now')
    `);

    const insertFts = db.prepare(`
      INSERT INTO documents_fts(rowid, path, title, content, tags)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertTerm = db.prepare(`
      INSERT OR REPLACE INTO term_index (term, doc_id, frequency)
      VALUES (?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      const result = upsert.run(
        relativePath,
        title,
        folder,
        JSON.stringify(tags),
        content
      );

      const docId = result.lastInsertRowid as number;

      const existing = db
        .prepare("SELECT id FROM documents WHERE path = ?")
        .get(relativePath) as { id: number } | undefined;
      const id = existing?.id ?? docId;

      db.prepare("DELETE FROM term_index WHERE doc_id = ?").run(id);

      for (const tf of frequencies) {
        insertTerm.run(tf.term, id, tf.frequency);
      }

      insertFts.run(id, relativePath, title, content, JSON.stringify(tags));
    });

    transaction();
  } finally {
    db.close();
  }
}

export async function indexFolder(
  vaultPath: string,
  folder?: string
): Promise<IndexStats> {
  const start = Date.now();
  const db = openDatabase(vaultPath);
  migrate(db);

  try {
    const files = folder
      ? await walkVault(vaultPath, [folder])
      : await walkVault(vaultPath);

    let totalTerms = 0;

    const insertDoc = db.prepare(`
      INSERT OR REPLACE INTO documents (path, title, folder, tags, content, updated_at, indexed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const insertFts = db.prepare(`
      INSERT INTO documents_fts(rowid, path, title, content, tags)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertTerm = db.prepare(`
      INSERT OR REPLACE INTO term_index (term, doc_id, frequency)
      VALUES (?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      for (const file of files) {
        const tokens = tokenize(file.content);
        const frequencies = computeFrequencies(tokens);
        const title = extractTitle(file.content);
        const tags = extractTags(file.content);
        const fileFolder = path.dirname(file.relativePath).replace(/\\/g, "/");

        const result = insertDoc.run(
          file.relativePath,
          title,
          fileFolder,
          JSON.stringify(tags),
          file.content
        );

        const docId = result.lastInsertRowid as number;

        for (const tf of frequencies) {
          insertTerm.run(tf.term, docId, tf.frequency);
        }

        totalTerms += frequencies.length;

        insertFts.run(docId, file.relativePath, title, file.content, JSON.stringify(tags));
      }
    });

    transaction();

    return {
      documentsIndexed: files.length,
      termsIndexed: totalTerms,
      elapsedMs: Date.now() - start,
    };
  } finally {
    db.close();
  }
}
