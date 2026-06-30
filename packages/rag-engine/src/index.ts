export { openDatabase, migrate, closeDatabase, getDbPath } from "./database.js";
export { indexFile, indexFolder } from "./indexer.js";
export type { IndexStats, IndexableFile } from "./indexer.js";
export {
  search,
  hybridSearch,
  searchAndCollect,
  searchAndCollectHybrid,
  getKeywordSuggestions,
} from "./searcher.js";
export type { SearchResult, HybridSearchResult } from "./searcher.js";
export {
  embedText,
  cosineSimilarity,
  serializeVector,
  deserializeVector,
  isEmbeddingAvailable,
} from "./embedder.js";
export type { EmbeddingResult } from "./embedder.js";
export { tokenize, computeFrequencies } from "./tokenizer.js";
export type { Token, TermFrequency } from "./tokenizer.js";
