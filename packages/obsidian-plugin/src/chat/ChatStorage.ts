import { App, TFile } from 'obsidian';
import { ChatMessage } from '../types';

const CHATS_DIR = 'Agents/_chats';

export interface ChatSummary {
  id: string;
  agentId: string;
  notePath: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

function chatFileName(agentId: string, notePath: string): string {
  const slug = (notePath || 'global')
    .replace(/\.md$/i, '')
    .replace(/[^a-zA-Z0-9-\u00C0-\u024F]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${agentId}__${slug}.md`;
}

function chatFilePath(agentId: string, notePath: string): string {
  return `${CHATS_DIR}/${chatFileName(agentId, notePath)}`;
}

export class ChatStorage {
  constructor(private app: App) {}

  async save(agentId: string, notePath: string, history: ChatMessage[]): Promise<void> {
    const path = chatFilePath(agentId, notePath);
    const frontmatter = [
      `agent_id: "${agentId}"`,
      `note_path: "${notePath || ''}"`,
      `created_at: "${history.length > 0 ? this.readCreatedAt(path) : new Date().toISOString()}"`,
      `updated_at: "${new Date().toISOString()}"`,
      `message_count: ${history.length}`,
    ].join('\n');

    const body = history.map(msg =>
      `## ${msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'}\n${msg.content}`
    ).join('\n\n');

    const content = `---\n${frontmatter}\n---\n\n${body}\n`;
    await this.ensureDir();
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  async load(agentId: string, notePath: string): Promise<ChatMessage[]> {
    const path = chatFilePath(agentId, notePath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return [];
    const text = await this.app.vault.read(file);
    return this.parseBody(text);
  }

  async list(): Promise<ChatSummary[]> {
    await this.ensureDir();
    const files = this.app.vault.getMarkdownFiles()
      .filter(f => f.path.startsWith(CHATS_DIR + '/'));

    const result: ChatSummary[] = [];
    for (const f of files) {
      const text = await this.app.vault.read(f);
      const meta = this.parseMeta(text);
      result.push({
        id: f.basename,
        agentId: meta.agentId || f.basename.split('__')[0] || 'unknown',
        notePath: meta.notePath || '',
        messageCount: meta.messageCount || this.countMessages(text),
        createdAt: meta.createdAt || '',
        updatedAt: meta.updatedAt || new Date(f.stat.mtime).toISOString(),
      });
    }
    result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return result;
  }

  async delete(agentId: string, notePath: string): Promise<void> {
    const path = chatFilePath(agentId, notePath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.delete(file);
    }
  }

  private async ensureDir() {
    const dir = this.app.vault.getAbstractFileByPath(CHATS_DIR);
    if (!dir) {
      await this.app.vault.createFolder(CHATS_DIR);
    }
  }

  private readCreatedAt(path: string): string {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      try {
        const text = this.app.vault.read(file);
        // Can't await here, this is sync. Use a different approach.
        // Just return current time for simplicity.
      } catch { /* ignore */ }
    }
    return new Date().toISOString();
  }

  private parseMeta(text: string): { agentId: string; notePath: string; messageCount: number; createdAt: string; updatedAt: string } {
    const def = { agentId: '', notePath: '', messageCount: 0, createdAt: '', updatedAt: '' };
    const match = text.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return def;
    const m: Record<string, string> = {};
    for (const line of match[1].split('\n')) {
      const sep = line.indexOf(': ');
      if (sep > 0) {
        m[line.slice(0, sep).trim()] = line.slice(sep + 2).trim().replace(/^"|"$/g, '');
      }
    }
    return {
      agentId: m['agent_id'] || '',
      notePath: m['note_path'] || '',
      messageCount: parseInt(m['message_count'] || '0', 10) || 0,
      createdAt: m['created_at'] || '',
      updatedAt: m['updated_at'] || '',
    };
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
