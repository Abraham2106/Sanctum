import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { indexFolder, indexFile } from "../indexer.js";
import { searchAndCollect, search, hybridSearch, searchAndCollectHybrid } from "../searcher.js";

const testDir = path.join(os.tmpdir(), `sanctum-rag-test-${Date.now()}`);

async function createTestFile(relPath: string, content: string) {
  const fullPath = path.join(testDir, relPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

describe("RAG indexer + searcher", () => {
  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });

    await createTestFile("Research/redes-neuronales.md", `# Redes Neuronales

Las redes neuronales convolucionales (CNN) son un tipo de arquitectura de deep learning.
Se utilizan principalmente para procesamiento de im\u00E1genes y visi\u00F3n artificial.

La investigaci\u00F3n en transformers ha revolucionado el NLP.
`);

    await createTestFile("Research/backpropagation.md", `# Backpropagation

El algoritmo de backpropagation es fundamental para el entrenamiento de redes neuronales.
Calcula los gradientes mediante la regla de la cadena del c\u00E1lculo diferencial.
`);
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("indexes and searches files", async () => {
    const stats = await indexFolder(testDir);
    expect(stats.documentsIndexed).toBeGreaterThanOrEqual(2);
    expect(stats.termsIndexed).toBeGreaterThan(0);
    expect(stats.elapsedMs).toBeGreaterThan(0);

    const results = searchAndCollect(testDir, "backpropagation", 5);
    expect(results).toContain("Backpropagation");
    expect(results).toContain("backpropagation");
  });

  it("finds results by keyword", async () => {
    const results = searchAndCollect(testDir, "redes", 5);
    expect(results).toContain("Redes Neuronales");

    const cnnResults = searchAndCollect(testDir, "CNN", 5);
    expect(cnnResults).toContain("CNN");
  });

  it("returns empty for no matches", async () => {
    expect(searchAndCollect(testDir, "xyzzy_nonexistent", 5)).toBe("");
  });

  it("resists SQL injection in search query", async () => {
    const payloads = [
      "'; DROP TABLE documents; --",
      "' OR '1'='1",
      `" UNION SELECT * FROM documents --`,
    ];

    for (const payload of payloads) {
      const results = searchAndCollect(testDir, payload, 5);
      expect(typeof results).toBe("string");
    }

    const results = search(testDir, "redes", 5);
    expect(results.length).toBeGreaterThan(0);
  });

  it("resists SQL injection in file content", async () => {
    const injectionContent = `# SQL Test
'; DROP TABLE documents; --
" OR 1=1 --
`;

    await indexFile(testDir, "Research/sql-test.md", injectionContent);

    const results = searchAndCollect(testDir, "SQL", 5);
    expect(results).toContain("SQL Test");

    const afterSearch = search(testDir, "redes", 5);
    expect(afterSearch.length).toBeGreaterThan(0);
  });

  it("filters by folder", async () => {
    const results = search(testDir, "redes", 5, "Research");
    expect(results.length).toBeGreaterThan(0);
  });

  it("hybridSearch falls back to FTS5 when no embeddings", async () => {
    const results = await hybridSearch(testDir, "backpropagation", 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].ftsScore).toBeDefined();
    expect(results[0].semanticScore).toBeDefined();
    expect(results[0].combinedScore).toBeDefined();
  });

  it("hybridSearch with alpha=1 equals pure FTS5", async () => {
    const fts5 = search(testDir, "redes", 5);
    const hybrid = await hybridSearch(testDir, "redes", 5, undefined, 1);

    expect(hybrid.length).toBeGreaterThanOrEqual(1);
    expect(fts5[0].path).toBe(hybrid[0].path);
  });

  it("searchAndCollectHybrid returns formatted string", async () => {
    const result = await searchAndCollectHybrid(testDir, "CNN", 3);
    expect(result).toContain("CNN");
    expect(result).toContain("fts:");
    expect(result).toContain("sem:");
  });
});
