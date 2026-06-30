import { TAbstractFile, TFile } from 'obsidian';
import type SanctumAgentsPlugin from '../../main';
import { AgentConfig, AgentResult, VaultEventType } from '../types';
import { parseFrontmatter } from '../context/FrontmatterParser';

export class TriggerManager {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private logsDirEnsured = false;

  constructor(private plugin: SanctumAgentsPlugin) {}

  start(): void {
    const vault = this.plugin.app.vault;
    this.plugin.registerEvent(vault.on('create', (f) => this.onEvent(f, 'create')));
    this.plugin.registerEvent(vault.on('modify', (f) => this.onEvent(f, 'modify')));
  }

  stop(): void {
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
  }

  private async onEvent(file: TAbstractFile, eventType: VaultEventType) {
    if (!(file instanceof TFile) || file.extension !== 'md') return;

    const agents = await this.plugin.store.list();
    for (const agent of agents) {
      const trigger = agent.triggers.on_vault_event;
      if (!trigger) continue;
      if (trigger.event !== 'both' && trigger.event !== eventType) continue;
      if (!matchesFolder(file.path, trigger.folders)) continue;

      const content = await this.plugin.app.vault.read(file);
      if (!matchesTag(content, trigger.tags)) continue;

      this.schedule(agent, eventType, file);
    }
  }

  private schedule(agent: AgentConfig, eventType: string, file: TFile) {
    const delay = eventType === 'create' ? 500 : this.plugin.settings.triggerDebounceMs;
    const existing = this.debounceTimers.get(agent.id);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(agent.id, setTimeout(async () => {
      this.debounceTimers.delete(agent.id);
      await this.runAndLog(agent, eventType, file);
    }, delay));
  }

  private async runAndLog(agent: AgentConfig, eventType: string, file: TFile) {
    try {
      const result = await this.plugin.runner.run(agent);
      await this.ensureLogsDir();
      await this.writeLog(agent, eventType, file, result);
    } catch (err) {
      console.error(`[Sanctum Trigger] ${agent.name}:`, err);
    }
  }

  private async ensureLogsDir() {
    if (this.logsDirEnsured) return;
    const dir = this.plugin.app.vault.getAbstractFileByPath('Agents/_logs');
    if (!dir) {
      await this.plugin.app.vault.createFolder('Agents/_logs');
    }
    this.logsDirEnsured = true;
  }

  private async writeLog(agent: AgentConfig, eventType: string, file: TFile, result: AgentResult) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `Agents/_logs/${agent.id}-${ts}.md`;
    const content = `---
trigger: vault_event
event: ${eventType}
file: ${file.path}
timestamp: ${new Date().toISOString()}
---

## Result
- Tokens: ${result.tokens}
- Actions: ${result.actions.length}

### Reasoning
${result.reasoning}

### Actions
${result.actions.map(a => `- ${a.tool}/${a.op} ${JSON.stringify(a.args)}`).join('\n')}
`;
    await this.plugin.app.vault.create(path, content);
  }
}

function matchesFolder(path: string, folders: string[]): boolean {
  if (folders.length === 0) return true;
  return folders.some(f => path.startsWith(f + '/') || path === f + '.md');
}

function matchesTag(content: string, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const parsed = parseFrontmatter<Record<string, unknown>>(content);
  if (!parsed) return false;
  const rawTags = parsed.data.tags;
  if (!rawTags) return false;
  const fileTags = Array.isArray(rawTags) ? rawTags : [rawTags];
  const normalized = tags.map(t => t.replace(/^#/, ''));
  const fileNormalized = fileTags.map((t: unknown) => String(t).replace(/^#/, ''));
  return normalized.some(t => fileNormalized.includes(t));
}
