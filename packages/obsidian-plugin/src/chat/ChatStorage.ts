import { App, TFile } from 'obsidian';
import { ChatMessage } from '../types';

const CHATS_DIR = 'Agents/_chats';

export interface ChatSummary {
  id: string;          // filename without .md
  agentId: string;
  notePath: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Genera nombre de archivo único para un chat */
function chatFileName(agentId: string, notePath: string): string {
  const slug = (notePath || 'global')
    .replace(/\.md$/i, '')
    .replace(/[^a-zA-Z0-9-\u00C0-\u024F]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${agentId}__${slug}.md`;
}

/** Path completo: Agents/_chats/<file> */
function chatFilePath(agentId: string, notePath: string): string {
  return `${CHATS_DIR}/${chatFileName(agentId, notePath)}`;
}

export class ChatStorage {
  constructor(private app: App) {}

  /** Guarda una sesión completa a disco (sobrescribe el archivo) */
  async save(agentId: string, notePath: string, history: ChatMessage[]): Promise<void> {
    const path = chatFilePath(agentId, notePath);

    const frontmatter: Record<string, unknown> = {
      agent_id: agentId,
      note_path: notePath || '',
      created_at: history.length > 0 ? this.readTimestamp(path) ?? new Date().toISOString() : new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: history.length,
    };

    const body = history.map(msg =>
      `## ${msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'}\n${msg.content}`
    ).join('\n\n');

    const content = `---\n${Object.entries(frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n\n${body}\n`;

    await this.ensureDir();
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  /** Carga un chat desde disco */
  async load(agentId: string, notePath: string): Promise<ChatMessage[]> {
    const path = chatFilePath(agentId, notePath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return [];

    const text = await this.app.vault.read(file);
    return this.parseBody(text);
  }

  /** Lista todos los chats guardados */
  async list(): Promise<ChatSummary[]> {
    await this.ensureDir();
    const files = this.app.vault.getMarkdownFiles()
      .filter(f => f.path.startsWith(CHATS_DIR + '/'));

    const result: ChatSummary[] = [];
    for (const f of files) {
      const text = await this.app.vault.read(f);
      const fm = this.parseFrontmatter(text);
      result.push({
        id: f.basename,
        agentId: fm.agent_id || f.basename.split('__')[0] || 'unknown',
        notePath: fm.note_path || '',
        messageCount: fm.message_count || this.countMessages(text),
        createdAt: fm.created_at || '',
        updatedAt: fm.updated_at || f.stat.mtime.toString(),
      });
    }
    result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return result;
  }

  /** Elimina un chat */
  async delete(agentId: string, notePath: string): Promise<void> {
    const path = chatFilePath(agentId, notePath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.delete(file);
    }
  }

  // ─── Privados ───────────────────────────

  private async ensureDir() {
    const dir = this.app.vault.getAbstractFileByPath(CHATS_DIR);
    if (!dir) {
      await this.app.vault.createFolder(CHATS_DIR);
    }
  }

  private readTimestamp(path: string): string | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const text = this.app.vault.read(file);
      // No podemos esperar aquí sincrónicamente, así que retornamos null
      // la fecha se obtiene mejor del frontmatter
    }
    return null;
  }

  private parseFrontmatter(text: string): Record<string, unknown> {
    const match = text.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    const data: Record<string, unknown> = {};
    for (const line of match[1].split('\n')) {
      const sep = line.indexOf(': ');
      if (sep > 0) {
        const key = line.slice(0, sep).trim();
        const val = line.slice(sep + 2).trim();
        try { data[key] = JSON.parse(val); } catch { data[key] = val.replace(/^"|"$/g, ''); }
      }
    }
    return data;
  }

  private parseBody(text: string): ChatMessage[] {
    const bodyMatch = text.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1] : text;
    const messages: ChatMessage[] = [];
    const blocks = body.split(/\n(?=## (?:User|Assistant|System))/);
    for (const block of blocks) {
      const header = block.match(/^## (User|Assistant|System)/);
      if (!header) continue;
      const role = header[1].toLowerCase() as ChatMessage['role'];
      const content = block.slice(header[0].length).trim();
      if (content) messages.push({ role, content });
    }
    return messages;
  }

  private countMessages(text: string): number {
    return (text.match(/^## (?:User|Assistant)/gm) || []).length;
  }
}
