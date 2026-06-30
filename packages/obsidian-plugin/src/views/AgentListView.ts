import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type SanctumAgentsPlugin from '../../main';
import { AgentConfig } from '../types';
import { AgentConfigView, VIEW_TYPE_AGENT_CONFIG } from './AgentConfigView';

export const VIEW_TYPE_AGENT_LIST = 'sanctum-agent-list';

export class AgentListView extends ItemView {
  private plugin: SanctumAgentsPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: SanctumAgentsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_AGENT_LIST; }
  getDisplayText(): string { return 'Sanctum Agents'; }
  getIcon(): string { return 'bot'; }

  async onOpen() { await this.render(); }

  async render() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('sanctum-agent-list');

    const header = containerEl.createEl('div', { cls: 'sanctum-header' });
    header.createEl('h3', { text: 'Sanctum Agents' });
    const newBtn = header.createEl('button', { text: '+ New Agent' });
    newBtn.addClass('sanctum-btn', 'sanctum-btn-primary');
    newBtn.onclick = () => this.openNewAgent();

    const agents = await this.plugin.store.list();
    if (agents.length === 0) {
      containerEl.createEl('p', { text: 'No agents yet.', cls: 'sanctum-empty' });
      return;
    }

    for (const agent of agents) {
      const card = containerEl.createEl('div', { cls: 'sanctum-agent-card' });
      const nameRow = card.createEl('div', { cls: 'sanctum-agent-name' });
      nameRow.textContent = agent.name;
      if (agent.schedule?.enabled) {
        nameRow.createEl('span', { text: ' ⏱', title: agent.schedule.intervalMinutes ? `Every ${agent.schedule.intervalMinutes}min` : `Daily at ${agent.schedule.dailyAt}` });
      }
      card.createEl('div', { text: `${agent.tools.join(', ')} · ${agent.model}`, cls: 'sanctum-agent-meta' });

      const btns = card.createEl('div', { cls: 'sanctum-card-actions' });

      if (agent.chain_next) {
        const chainBtn = btns.createEl('button', { text: 'Run Chain' });
        chainBtn.addClass('sanctum-btn', 'sanctum-btn-primary');
        chainBtn.onclick = () => this.runChain(agent);
      } else {
        const runBtn = btns.createEl('button', { text: 'Run' });
        runBtn.addClass('sanctum-btn', 'sanctum-btn-primary');
        runBtn.onclick = () => this.runAgent(agent);
      }

      const editBtn = btns.createEl('button', { text: 'Edit' });
      editBtn.addClass('sanctum-btn');
      editBtn.onclick = () => this.openConfig(agent);

      const delBtn = btns.createEl('button', { text: 'Delete' });
      delBtn.addClass('sanctum-btn', 'sanctum-btn-danger');
      delBtn.onclick = () => this.deleteAgent(agent);
    }
  }

  private async openNewAgent() {
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_AGENT_CONFIG, active: true });
    (leaf.view as unknown as AgentConfigView).loadNew();
  }

  private async openConfig(agent: AgentConfig) {
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_AGENT_CONFIG, active: true });
    await (leaf.view as unknown as AgentConfigView).loadAgent(agent.id);
  }

  private async runAgent(agent: AgentConfig) {
    new Notice(`Running: ${agent.name}...`);
    try {
      const result = await this.plugin.runner.run(agent);
      new Notice(`Done (${result.tokens}t, ${result.actions.length} actions)`);
    } catch (err) {
      new Notice(`Failed: ${err}`);
    }
  }

  private async runChain(agent: AgentConfig) {
    new Notice(`Running chain from: ${agent.name}...`);
    try {
      const steps = await this.plugin.workflow.runChain(agent);
      const summary = steps.map(s => `${s.agent.name} (${s.result.tokens}t, ${s.result.actions.length}a)`).join(' → ');
      new Notice(`Chain done: ${summary}`);
    } catch (err) {
      new Notice(`Chain failed: ${err}`);
    }
  }

  private async deleteAgent(agent: AgentConfig) {
    await this.plugin.store.delete(agent.id);
    await this.plugin.scheduler.refresh();
    new Notice(`Deleted ${agent.name}`);
    this.render();
  }
}
