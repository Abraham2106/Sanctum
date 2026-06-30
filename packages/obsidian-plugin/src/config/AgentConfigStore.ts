import { App, TFile, TFolder } from 'obsidian';
import { AgentConfig } from '../types';
import { parseFrontmatter, stringifyFrontmatter } from '../context/FrontmatterParser';

const AGENTS_DIR = 'Agents';

export class AgentConfigStore {
  constructor(private app: App) {}

  async list(): Promise<AgentConfig[]> {
    const all = this.app.vault.getMarkdownFiles();
    console.log('[Store] total .md en vault:', all.length, all.map(f => f.path));
    const agentFiles = all.filter(f =>
      f.path.startsWith(AGENTS_DIR + '/') &&
      !f.path.startsWith(AGENTS_DIR + '/_logs/') &&
      !f.path.startsWith(AGENTS_DIR + '/_chats/')
    );
    console.log('[Store] archivos en Agents/:', agentFiles.length, agentFiles.map(f => f.path));

    const configs: AgentConfig[] = [];
    for (const f of agentFiles) {
      try {
        const text = await this.app.vault.read(f);
        console.log('[Store] leyendo:', f.path, '(' + text.length + ' chars)');

        const fm = parseFrontmatter<Record<string, unknown>>(text);
        if (!fm) {
          console.log('[Store]  → SIN frontmatter en', f.path);
          // Sin frontmatter = no es un agente válido
          continue;
        }
        console.log('[Store]  → frontmatter keys:', Object.keys(fm.data));

        const config = this.assembleConfig(fm.data, f.basename);
        if (config) {
          console.log('[Store]  → agente OK:', config.id);
          configs.push(config);
        } else {
          console.log('[Store]  → falló assembleConfig para', f.path);
        }
      } catch (err) {
        console.error('[Store]  → ERROR leyendo', f.path, err);
      }
    }
    console.log('[Store] total agentes válidos:', configs.length, configs.map(c => c.id));
    return configs;
  }

  async get(id: string): Promise<AgentConfig | null> {
    const path = `${AGENTS_DIR}/${id}.md`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) return null;

    const text = await this.app.vault.read(file);
    const fm = parseFrontmatter<Record<string, unknown>>(text);
    if (!fm) return null;
    return this.assembleConfig(fm.data, file.basename);
  }

  async save(config: AgentConfig): Promise<void> {
    const path = `${AGENTS_DIR}/${config.id}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    let body = '';
    if (existing instanceof TFile) {
      const content = await this.app.vault.read(existing);
      const parsed = parseFrontmatter(content);
      body = parsed?.body ?? content;
    }
    const newContent = stringifyFrontmatter(config as unknown as Record<string, unknown>, body);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, newContent);
    } else {
      await this.ensureDir();
      await this.app.vault.create(path, newContent);
    }
  }

  async delete(id: string): Promise<void> {
    const path = `${AGENTS_DIR}/${id}.md`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.vault.delete(file);
  }

  /**
   * Convierte objeto del YAML frontmatter a AgentConfig.
   * Sin Zod — defaults manuales. Maneja tanto triggers anidados como planos.
   */
  private assembleConfig(data: Record<string, unknown>, basename: string): AgentConfig | null {
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      console.log('[Store]  → falta "name" en frontmatter');
      return null;
    }

    const toStrArray = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.map(String);
      if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
      return [];
    };

    const toolsRaw = toStrArray(data.tools).filter(t =>
      ['web', 'github', 'discord', 'vault'].includes(t)
    ) as AgentConfig['tools'];

    // triggers: buscar anidado o plano
    const t = data.triggers as Record<string, unknown> | undefined;
    const runManual = t?.run_manual ?? data.run_manual ?? true;
    const onNewChat = t?.on_new_chat ?? data.on_new_chat ?? false;
    const onMentioned = t?.on_mentioned ?? data.on_mentioned ?? false;
    const vaultEventData = t?.on_vault_event ?? data.on_vault_event ?? undefined;

    return {
      id: (typeof data.id === 'string' && data.id) ? data.id : basename,
      name: String(data.name).trim(),
      instructions: typeof data.instructions === 'string' ? data.instructions : '',
      triggers: {
        run_manual: runManual === true,
        on_new_chat: onNewChat === true,
        on_mentioned: onMentioned === true,
        on_vault_event: vaultEventData
          ? {
              folders: toStrArray((vaultEventData as any).folders),
              tags: toStrArray((vaultEventData as any).tags),
              event: ((vaultEventData as any).event === 'create' || (vaultEventData as any).event === 'modify')
                ? (vaultEventData as any).event
                : 'both',
            }
          : undefined,
      },
      allowed_folders: toStrArray(data.allowed_folders),
      allowed_tags: toStrArray(data.allowed_tags),
      tools: toolsRaw,
      model: typeof data.model === 'string' ? data.model : 'auto',
      max_actions: typeof data.max_actions === 'number' && data.max_actions > 0 ? data.max_actions : 3,
    };
  }

  private async ensureDir(): Promise<void> {
    const dir = this.app.vault.getAbstractFileByPath(AGENTS_DIR);
    if (!dir || !(dir instanceof TFolder)) {
      await this.app.vault.createFolder(AGENTS_DIR);
    }
  }
}
