export { openDatabase, migrate, closeDatabase, getDbPath } from "./database.js";
export { indexFile, indexFolder } from "./indexer.js";
export type { IndexStats, IndexableFile } from "./indexer.js";
export { search, searchAndCollect, getKeywordSuggestions } from "./searcher.js";
export type { SearchResult } from "./searcher.js";
export { tokenize, computeFrequencies } from "./tokenizer.js";
export type { Token, TermFrequency } from "./tokenizer.js";
