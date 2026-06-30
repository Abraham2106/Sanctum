import { requestUrl } from 'obsidian';
import { ChatMessage, AgentResult } from '../types';

const DEFAULT_MODEL = 'gemini-2.5-flash';

function resolveModel(model?: string): string {
  return model && model !== 'auto' ? model : DEFAULT_MODEL;
}

const ERROR_PATTERNS = [
  /ERROR:/i,
  /this model does not support/i,
  /cannot read/i,
];

function looksLikeError(text: string): boolean {
  return ERROR_PATTERNS.some(p => p.test(text));
}

export class LLMClient {
  constructor(private proxyUrl: string) {}

  updateConfig(proxyUrl: string): void {
    this.proxyUrl = proxyUrl;
  }

  async complete(messages: ChatMessage[], model?: string): Promise<AgentResult> {
    const url = `${this.proxyUrl.replace(/\/+$/, '')}/chat/completions`;

    let response;
    try {
      response = await requestUrl({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: resolveModel(model),
          messages,
          temperature: 0.2,
        }),
      });
    } catch (err) {
      return { reasoning: `LLM error: ${err}`, actions: [], tokens: 0 };
    }

    const data = response.json;
    const raw = data.choices?.[0]?.message?.content ?? '';
    if (!raw) return { reasoning: '', actions: [], tokens: data.usage?.total_tokens ?? 0 };

    if (looksLikeError(raw)) {
      return { reasoning: `El modelo devolvió un error: ${raw}`, actions: [], tokens: data.usage?.total_tokens ?? 0 };
    }

    try {
      const parsed = JSON.parse(raw);
      return {
        reasoning: parsed.reasoning ?? raw,
        actions: parsed.actions ?? [],
        tokens: data.usage?.total_tokens ?? 0,
      };
    } catch {
      return {
        reasoning: raw,
        actions: [],
        tokens: data.usage?.total_tokens ?? 0,
      };
    }
  }

  async completeRaw(messages: ChatMessage[], model?: string): Promise<string> {
    const url = `${this.proxyUrl.replace(/\/+$/, '')}/chat/completions`;

    try {
      const response = await requestUrl({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: resolveModel(model),
          messages,
          temperature: 0.7,
        }),
      });
      const text = response.json.choices?.[0]?.message?.content ?? '';
      if (looksLikeError(text)) {
        return `El modelo rechazó la solicitud: ${text}`;
      }
      return text;
    } catch (err) {
      return `LLM error: ${err}`;
    }
  }
}
