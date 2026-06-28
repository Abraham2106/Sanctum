const EMBEDDING_DIMENSIONS = 768;

export interface EmbeddingResult {
  vector: Float32Array;
  model: string;
  dimensions: number;
  tokens: number;
}

function getBaseUrl(): string | null {
  const explicit = process.env.EMBEDDING_URL;
  if (explicit) return explicit;

  const proxyUrl = process.env.GEMINI_PROXY_URL;
  if (proxyUrl) {
    return proxyUrl.replace("/chat/completions", "/embeddings");
  }

  return null;
}

export async function embedText(text: string): Promise<EmbeddingResult | null> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;

  const model = process.env.EMBEDDING_MODEL || "text-embedding-004";

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: text,
      }),
    });

    if (!response.ok) {
      console.warn(`Embedding API error (${response.status}), fallback a FTS5 puro`);
      return null;
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
      usage?: { prompt_tokens: number };
    };

    if (!data.data?.[0]?.embedding) {
      console.warn("Embedding API returned no data, fallback a FTS5 puro");
      return null;
    }

    const vector = new Float32Array(data.data[0].embedding);
    return {
      vector,
      model,
      dimensions: vector.length,
      tokens: data.usage?.prompt_tokens ?? 0,
    };
  } catch (err) {
    console.warn(`Embedding API call failed (${err}), fallback a FTS5 puro`);
    return null;
  }
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

export function serializeVector(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer);
}

export function deserializeVector(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

export function isEmbeddingAvailable(): boolean {
  return !!getBaseUrl();
}
