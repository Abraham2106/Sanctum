import { App, Modal, Notice, Plugin, Setting, TFile } from 'obsidian';
import { AgentConfigStore } from './src/config/AgentConfigStore';
import { AgentRunner } from './src/runtime/AgentRunner';
import { SanctumSettingsTab } from './src/SanctumSettingsTab';
import { AgentListView, VIEW_TYPE_AGENT_LIST } from './src/views/AgentListView';
import { AgentConfigView, VIEW_TYPE_AGENT_CONFIG } from './src/views/AgentConfigView';
import { NoteChatView, VIEW_TYPE_CHAT } from './src/views/NoteChatView';
import { ChatHistoryView, VIEW_TYPE_CHAT_HISTORY } from './src/views/ChatHistoryView';
import { TriggerManager } from './src/triggers/TriggerManager';
import { AgentConfig } from './src/types';
import { ChatStorage } from './src/chat/ChatStorage';

export interface SanctumPluginSettings {
  geminiProxyUrl: string;
  mcpCommand: string;
  mcpGithubToken: string;
  triggerDebounceMs: number;
  autoTag: boolean;
  maxTopicsPerNote: number;
}

const DEFAULT_SETTINGS: SanctumPluginSettings = {
  geminiProxyUrl: 'https://gemini-proxy-balancer-production-82b0.up.railway.app/v1',
  mcpCommand: 'npx @modelcontextprotocol/server-github',
  mcpGithubToken: '',
  triggerDebounceMs: 3000,
  autoTag: true,
  maxTopicsPerNote: 5,
};

export default class SanctumAgentsPlugin extends Plugin {
  store!: AgentConfigStore;
  runner!: AgentRunner;
  triggers!: TriggerManager;
  chatStorage!: ChatStorage;
  settings!: SanctumPluginSettings;

  async onload() {
    try {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.store = new AgentConfigStore(this.app);
    this.runner = new AgentRunner(this.app, {
      proxyUrl: this.settings.geminiProxyUrl,
      mcpCommand: this.settings.mcpCommand,
      mcpToken: this.settings.mcpGithubToken,
      autoTag: this.settings.autoTag,
      maxTopicsPerNote: this.settings.maxTopicsPerNote,
    });

    this.registerView(VIEW_TYPE_AGENT_LIST, (leaf) => new AgentListView(leaf, this));
    this.registerView(VIEW_TYPE_AGENT_CONFIG, (leaf) => new AgentConfigView(leaf, this));
    this.registerView(VIEW_TYPE_CHAT, (leaf) => new NoteChatView(leaf, this));
    this.registerView(VIEW_TYPE_CHAT_HISTORY, (leaf) => new ChatHistoryView(leaf, this));

    this.triggers = new TriggerManager(this);
    this.chatStorage = new ChatStorage(this.app);

    this.addSettingTab(new SanctumSettingsTab(this.app, this));

    this.addRibbonIcon('bot', 'Sanctum Agents', () => {
      this.activateView(VIEW_TYPE_AGENT_LIST);
    });
    this.addRibbonIcon('message-circle', 'Sanctum Chat', () => {
      this.activateView(VIEW_TYPE_CHAT);
    });
    this.addRibbonIcon('history', 'Sanctum Chat History', () => {
      this.activateView(VIEW_TYPE_CHAT_HISTORY);
    });

    this.addCommand({
      id: 'sanctum-open-agents',
      name: 'Open Sanctum Agents',
      callback: () => this.activateView(VIEW_TYPE_AGENT_LIST),
    });

    this.addCommand({
      id: 'sanctum-open-chat',
      name: 'Open Sanctum Chat',
      callback: () => this.activateView(VIEW_TYPE_CHAT),
    });

    this.addCommand({
      id: 'sanctum-open-chat-history',
      name: 'Open Sanctum Chat History',
      callback: () => this.activateView(VIEW_TYPE_CHAT_HISTORY),
    });

    this.addCommand({
      id: 'sanctum-debug-store',
      name: 'Sanctum: Debug Agent Store',
      callback: async () => {
        console.log('=== SANCTUM DEBUG ===');
        console.log('Vault path:', (this.app.vault.adapter as any).getBasePath?.());
        const agents = await this.store.list();
        console.log('Agents found:', agents.length);
        if (agents.length === 0) {
          const all = this.app.vault.getMarkdownFiles();
          console.log('All .md files in vault:', all.length, all.map(f => f.path));
          const inAgents = all.filter(f => f.path.startsWith('Agents/'));
          console.log('In Agents/ folder:', inAgents.length, inAgents.map(f => f.path));
          for (const f of inAgents) {
            try {
              const c = await this.app.vault.read(f);
              console.log(`  ${f.path}: ${c.slice(0, 200)}`);
            } catch (e) {
              console.error(`  ${f.path}: ERROR reading`, e);
            }
          }
        }
        new Notice(`Store debug: ${agents.length} agent(s). Check console (Ctrl+Shift+I)`);
      },
    });

    this.addCommand({
      id: 'sanctum-run-agent-quick',
      name: 'Run Sanctum Agent (quick)',
      callback: () => new AgentSelectModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'sanctum-connect-mcp',
      name: 'Connect GitHub MCP',
      callback: async () => {
        await this.runner.connectMCP();
      },
    });

    this.addCommand({
      id: 'sanctum-disconnect-mcp',
      name: 'Disconnect GitHub MCP',
      callback: async () => {
        await this.runner.disconnectMCP();
        new Notice('Sanctum MCP disconnected');
      },
    });

    this.addCommand({
      id: 'sanctum-create-sample-agent',
      name: 'Create Sample Sanctum Agent',
      callback: async () => {
        const sample: AgentConfig = {
          id: 'sample-agent',
          name: 'Sample Agent',
          instructions: 'You are a helpful assistant.',
          triggers: { run_manual: true, on_new_chat: false, on_mentioned: false },
          allowed_folders: ['GitHub'],
          allowed_tags: ['agent-access'],
          tools: ['vault'],
          model: 'auto',
          max_actions: 3,
        };
        await this.store.save(sample);
        new Notice('Sample agent created');
      },
    });

    this.addCommand({
      id: 'sanctum-create-triage-agent',
      name: 'Create Triage Sanctum Agent',
      callback: async () => {
        const triage: AgentConfig = {
          id: 'triage-agent',
          name: 'Triage Agent',
          instructions: 'Triage GitHub issues: read context and create a summary.',
          triggers: { run_manual: true, on_new_chat: false, on_mentioned: false },
          allowed_folders: ['GitHub'],
          allowed_tags: ['triage', 'agent-access'],
          tools: ['github', 'vault'],
          model: 'auto',
          max_actions: 5,
        };
        await this.store.save(triage);
        new Notice('Triage agent created');
      },
    });

    this.app.workspace.onLayoutReady(async () => {
      try {
        const agentsDir = this.app.vault.getAbstractFileByPath('Agents');
        if (!agentsDir) await this.app.vault.createFolder('Agents');
        const logsDir = this.app.vault.getAbstractFileByPath('Agents/_logs');
        if (!logsDir) await this.app.vault.createFolder('Agents/_logs');
        const chatsDir = this.app.vault.getAbstractFileByPath('Agents/_chats');
        if (!chatsDir) await this.app.vault.createFolder('Agents/_chats');
        this.triggers.start();
      } catch (err) {
        console.error('[Sanctum] layoutReady error:', err);
      }
    });
    } catch (err) {
      console.error('[Sanctum] onload error:', err);
    }
  }

  async onunload() {
    this.triggers?.stop();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_AGENT_LIST);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_AGENT_CONFIG);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT_HISTORY);
    await this.runner?.disconnectMCP();
  }

  async activateView(viewType: string) {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(viewType)[0];
    if (existing) {
      workspace.revealLeaf(existing);
      return;
    }
    const leaf = workspace.getLeftLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: viewType, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  async loadChatSession(agentId: string, notePath: string) {
    if (notePath) {
      const file = this.app.vault.getAbstractFileByPath(notePath);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf(true).openFile(file);
      }
    }
    await this.activateView(VIEW_TYPE_CHAT);
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
    if (leaf) {
      await (leaf.view as any).loadChatFromFiles(agentId, notePath);
    }
  }

  updateRuntime(): void {
    this.runner?.updateConfig({
      proxyUrl: this.settings.geminiProxyUrl,
      mcpCommand: this.settings.mcpCommand,
      mcpToken: this.settings.mcpGithubToken,
      autoTag: this.settings.autoTag,
      maxTopicsPerNote: this.settings.maxTopicsPerNote,
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class AgentSelectModal extends Modal {
  private selectedAgent?: AgentConfig;

  constructor(app: App, private plugin: SanctumAgentsPlugin) {
    super(app);
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Run Sanctum Agent' });
    const agents = await this.plugin.store.list();
    if (agents.length === 0) {
      contentEl.createEl('p', { text: 'No agents found.' });
      return;
    }
    this.selectedAgent = agents[0];
    const dropdown = contentEl.createEl('select');
    agents.forEach(a => dropdown.createEl('option', { value: a.id, text: a.name }));
    dropdown.onchange = () => { this.selectedAgent = agents.find(a => a.id === dropdown.value); };
    const input = contentEl.createEl('input', { type: 'text', placeholder: 'Optional input...' });
    new Setting(contentEl).addButton(btn => btn.setButtonText('Run').setCta().onClick(async () => {
      if (!this.selectedAgent) return;
      this.close();
      new Notice(`Running: ${this.selectedAgent.name}...`);
      try {
        const r = await this.plugin.runner.run(this.selectedAgent, input.value || undefined);
        new Notice(`Done (${r.tokens}t, ${r.actions.length} actions)`);
      } catch (err) { new Notice(`Failed: ${err}`); }
    }));
  }

  onClose() {
    this.contentEl.empty();
  }
}
