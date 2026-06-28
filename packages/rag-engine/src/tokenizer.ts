const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "by", "with", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need",
  "dare", "ought", "used", "this", "that", "these", "those", "i", "me",
  "my", "myself", "we", "our", "ours", "ourselves", "you", "your",
  "yours", "yourself", "yourselves", "he", "him", "his", "himself",
  "she", "her", "hers", "herself", "it", "its", "itself", "they",
  "them", "their", "theirs", "themselves", "what", "which", "who",
  "whom", "when", "where", "why", "how", "all", "each", "every",
  "both", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "about", "above", "after", "again", "against", "below", "between",
  "into", "through", "during", "before", "after", "up", "down", "out",
  "off", "over", "under", "then", "once", "here", "there", "also",
  "well", "any", "because", "if", "like", "make", "much", "new",
  "one", "two", "three", "first", "last", "long", "still", "now",
  "que", "de", "en", "la", "el", "es", "un", "una", "los", "las",
  "del", "para", "por", "con", "sin", "su", "sus", "se", "no", "lo",
  "como", "más", "pero", "sus", "le", "ya", "este", "esta", "entre",
  "todo", "también", "fue", "era", "sido", "está", "estar"
]);

const SUFFIXES = [
  "ción", "sión", "miento", "mientos", "mente", "dor", "dora",
  "dad", "tad", "anza", "azgo", "aje", "eza", "era", "ero",
  "ista", "ismo", "ante", "ente", "iente",
  "ing", "ed", "ly", "s", "es", "ies", "ves", "ment",
  "tion", "sion", "ful", "ness", "able", "ible", "al", "ial",
  "er", "or", "ist", "ism", "ive", "ative"
];

function stem(word: string): string {
  let w = word.toLowerCase();
  for (const suffix of SUFFIXES) {
    if (w.endsWith(suffix) && w.length - suffix.length > 2) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

export interface Token {
  term: string;
  position: number;
}

export function tokenize(text: string): Token[] {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*`~\[\](){}<>|\\\/@$%^&=+'"„“”«»]/g, " ")
    .replace(/[0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens: Token[] = [];
  let position = 0;

  for (const raw of cleaned.split(/\s+/)) {
    const word = raw.replace(/^[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+|[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+$/g, "").toLowerCase();
    if (!word || word.length < 2) continue;
    if (STOP_WORDS.has(word)) continue;

    const stemmed = stem(word);
    if (stemmed.length < 2) continue;

    tokens.push({ term: stemmed, position });
    position++;
  }

  return tokens;
}

export interface TermFrequency {
  term: string;
  frequency: number;
  positions: number[];
}

export function computeFrequencies(tokens: Token[]): TermFrequency[] {
  const map = new Map<string, { frequency: number; positions: number[] }>();

  for (const token of tokens) {
    const entry = map.get(token.term);
    if (entry) {
      entry.frequency++;
      entry.positions.push(token.position);
    } else {
      map.set(token.term, { frequency: 1, positions: [token.position] });
    }
  }

  return Array.from(map.entries()).map(([term, data]) => ({
    term,
    frequency: data.frequency,
    positions: data.positions,
  }));
}
