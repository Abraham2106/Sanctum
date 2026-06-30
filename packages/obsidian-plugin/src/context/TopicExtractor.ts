import { LLMClient } from '../llm/LLMClient';
import { ChatMessage } from '../types';

const TAG_PROMPT = `Extract the top {max} topic tags from the following content.
Return ONLY a valid JSON array of strings. Each tag should be:
- Lowercase
- Use hyphens for multi-word tags (e.g. "machine-learning" not "Machine Learning")
- Specific and descriptive
- Cover the main themes and concepts

Content:
{content}

JSON array:`;

export class TopicExtractor {
  constructor(private llm: LLMClient) {}

  async extractTopics(content: string, maxTopics = 5): Promise<string[]> {
    const prompt = TAG_PROMPT
      .replace('{max}', String(maxTopics))
      .replace('{content}', content.slice(0, 4000)); // limitar a 4K chars

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You extract topic tags from content. Return ONLY a JSON array.' },
      { role: 'user', content: prompt },
    ];

    const raw = await this.llm.completeRaw(messages, 'gemini-2.5-flash');
    const tags = this.parseTagResponse(raw);
    console.log(`[TopicExtractor] extracted ${tags.length} tags:`, tags);
    return tags;
  }

  private parseTagResponse(raw: string): string[] {
    // Intentar parsear directo como JSON
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter(t => t.length > 0).slice(0, 10);
      }
    } catch { /* no es JSON puro */ }

    // Buscar JSON array dentro del texto
    const match = raw.match(/\[[\s\S]*?\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed.map(String).filter(t => t.length > 0).slice(0, 10);
        }
      } catch { /* ignorar */ }
    }

    // Fallback: dividir por comas o saltos de línea
    const words = raw.split(/[,\n]/).map(s => s.trim().replace(/^["'\-# ]+|["'\-# ]+$/g, '')).filter(Boolean);
    return words.slice(0, 10);
  }
}
