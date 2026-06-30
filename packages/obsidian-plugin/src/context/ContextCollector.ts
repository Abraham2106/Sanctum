import { App, TFile } from 'obsidian';
import { AgentConfig, AgentNote } from '../types';
import { parseFrontmatter } from './FrontmatterParser';

/** Limpia contenido que el modelo podría malinterpretar como imagen */
function sanitizeContent(content: string): string {
  return content
    // Eliminar embeds de Obsidian: ![[image.png]]
    .replace(/!\[\[.*?\]\]/g, '[imagen omitida]')
    // Eliminar markdown images: ![alt](path)
    .replace(/!\[.*?\]\(.*?\)/g, '[imagen omitida]')
    // Eliminar data URIs
    .replace(/data:image\/[^;]+;base64,[^\s]+/g, '[imagen omitida]');
}

export class ContextCollector {
  constructor(private app: App) {}

  async collect(agent: AgentConfig): Promise<AgentNote[]> {
    const files = this.app.vault.getMarkdownFiles();
    const matching: AgentNote[] = [];

    for (const file of files) {
      if (!this.matchesFolders(file, agent.allowed_folders)) continue;
      const content = await this.app.vault.read(file);
      if (!this.matchesTags(content, agent.allowed_tags)) continue;
      matching.push({ path: file.path, content: sanitizeContent(content) });
    }

    return matching;
  }

  private matchesFolders(file: TFile, allowed: string[]): boolean {
    if (allowed.length === 0) return true;
    return allowed.some(f => file.path.startsWith(f + '/') || file.path === f + '.md');
  }

  private matchesTags(content: string, allowed: string[]): boolean {
    if (allowed.length === 0) return true;
    const parsed = parseFrontmatter<Record<string, unknown>>(content);
    if (!parsed) return false;
    const rawTags = parsed.data.tags;
    if (!rawTags) return false;
    const fileTags = Array.isArray(rawTags) ? rawTags : [rawTags];
    const normalized = allowed.map(t => t.startsWith('#') ? t.slice(1) : t);
    const fileNormalized = fileTags.map((t: unknown) => {
      const s = String(t);
      return s.startsWith('#') ? s.slice(1) : s;
    });
    return normalized.some(t => fileNormalized.includes(t));
  }
}
