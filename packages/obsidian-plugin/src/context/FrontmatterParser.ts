import * as yaml from 'js-yaml';

const FM_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

export interface ParsedFrontmatter<T> {
  data: T;
  body: string;
}

export function parseFrontmatter<T>(content: string): ParsedFrontmatter<T> | null {
  const match = content.match(FM_RE);
  if (!match) return null;
  try {
    const raw = yaml.load(match[1]);
    if (!raw || typeof raw !== 'object') {
      console.log('[Sanctum FM] yaml.load returned non-object:', typeof raw);
      return null;
    }
    const data = raw as T;
    const body = content.slice(match[0].length);
    return { data, body };
  } catch (err) {
    console.log('[Sanctum FM] yaml.load error:', err);
    return null;
  }
}

export function stringifyFrontmatter(data: Record<string, unknown>, body: string = ''): string {
  const fm = yaml.dump(data, { lineWidth: 120, noRefs: true, sortKeys: false, forceQuotes: false });
  return `---\n${fm}---\n${body}`;
}
