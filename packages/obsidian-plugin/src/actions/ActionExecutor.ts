import { App, TFile } from 'obsidian';
import { AgentAction } from '../types';
import { MCPClient } from '../mcp/MCPClient';
import { TopicExtractor } from '../context/TopicExtractor';
import { parseFrontmatter, stringifyFrontmatter } from '../context/FrontmatterParser';

export class ActionExecutor {
  constructor(
    private app: App,
    private mcp: MCPClient,
    private topicExtractor: TopicExtractor,
    private autoTag: boolean,
    private maxTopicsPerNote: number,
  ) {}

  async execute(actions: AgentAction[]): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.tool) {
          case 'vault':
            await this.executeVaultOp(action);
            break;
          case 'github':
            await this.executeGitHubOp(action);
            break;
          case 'none':
            break;
        }
      } catch (err) {
        console.error(`[Sanctum] Failed to execute ${action.tool}/${action.op}:`, err);
      }
    }
  }

  private async executeGitHubOp(action: AgentAction): Promise<void> {
    if (!this.mcp.connected) {
      console.warn('[Sanctum] MCP not connected. Skipping GitHub action.');
      return;
    }
    const result = await this.mcp.callTool(action.op, action.args);
    console.log(`[Sanctum] GitHub MCP result:`, result);
  }

  private async executeVaultOp(action: AgentAction): Promise<void> {
    switch (action.op) {
      case 'write_note':
        await this.writeNote(action.args.path as string, action.args.content as string);
        break;
      case 'create_folder':
        await this.ensureFolder(action.args.path as string);
        break;
      case 'tag_note':
        await this.tagNote(action.args.path as string, action.args.tags as string[]);
        break;
    }
  }

  private async ensureFolder(path: string) {
    if (!path) return;
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const exists = this.app.vault.getAbstractFileByPath(current);
      if (!exists) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private async writeNote(path: string, content: string) {
    if (!path || content === undefined) return;

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      if (dir) {
        await this.ensureFolder(dir);
      }
      await this.app.vault.create(path, content);
    }

    // Auto-tagging post-creación
    if (this.autoTag && !existing) {
      try {
        const tags = await this.topicExtractor.extractTopics(content, this.maxTopicsPerNote);
        if (tags.length > 0) {
          await this.tagNote(path, tags);
        }
      } catch (err) {
        console.error('[Sanctum] Auto-tagging error:', err);
      }
    }
  }

  private async tagNote(path: string, newTags: string[]) {
    if (!path || !newTags || newTags.length === 0) return;

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;

    const text = await this.app.vault.read(file);
    const fm = parseFrontmatter<Record<string, unknown>>(text);

    // Combinar tags nuevos con existentes
    const existingTags: string[] = fm
      ? (Array.isArray(fm.data.tags) ? fm.data.tags.map(String) : [])
      : [];
    const merged = [...new Set([
      ...existingTags.map(t => t.toLowerCase()),
      ...newTags.map(t => t.toLowerCase()),
    ])];

    if (fm) {
      // Actualizar frontmatter existente
      fm.data.tags = merged;
      fm.data.sanctum_auto_tagged = true;
      fm.data.sanctum_tag_date = new Date().toISOString();
      const updated = stringifyFrontmatter(fm.data as Record<string, unknown>, fm.body);
      await this.app.vault.modify(file, updated);
    } else {
      // Crear frontmatter desde cero
      const data: Record<string, unknown> = {
        tags: merged,
        sanctum_auto_tagged: true,
        sanctum_tag_date: new Date().toISOString(),
      };
      const updated = stringifyFrontmatter(data, text);
      await this.app.vault.modify(file, updated);
    }

    console.log(`[Sanctum] Tagged "${path}" with:`, merged);
  }
}
