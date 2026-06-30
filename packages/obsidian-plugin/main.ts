import { App, Modal, Notice, Plugin, Setting, TFile } from 'obsidian';
import { AgentConfigStore } from './src/config/AgentConfigStore';
import { AgentRunner } from './src/runtime/AgentRunner';
import { SanctumSettingsTab } from './src/SanctumSettingsTab';
import { AgentListView, VIEW_TYPE_AGENT_LIST } from './src/views/AgentListView';
import { AgentConfigView, VIEW_TYPE_AGENT_CONFIG } from './src/views/AgentConfigView';
import { NoteChatView, VIEW_TYPE_CHAT } from './src/views/NoteChatView';
import { ChatHistoryView, VIEW_TYPE_CHAT_HISTORY } from './src/views/ChatHistoryView';
import { TriggerManager } from './src/triggers/TriggerManager';
import { SchedulerManager } from './src/triggers/SchedulerManager';
import { WorkflowRunner } from './src/runtime/WorkflowRunner';
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
  workflow!: WorkflowRunner;
  triggers!: TriggerManager;
  scheduler!: SchedulerManager;
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
    this.workflow = new WorkflowRunner(this);
    this.scheduler = new SchedulerManager(this);
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

    this.addCommand({
      id: 'sanctum-create-content-pipeline',
      name: 'Create Content Pipeline (Forager -> Synthesizer -> Reflector -> Curator)',
      callback: async () => {
        const agents: AgentConfig[] = [
          {
            id: 'forager', name: 'Forager',
            instructions: 'Eres el PRIMER AGENTE de un pipeline de contenido. Tu funcion es recolectar materia prima.\n\n## Flujo\n1. El usuario te da un tema o pregunta de investigacion.\n2. Usas rag_search para buscar en el vault informacion relacionada.\n3. Lees los archivos y extraes conceptos clave, citas y referencias.\n4. Creas una carpeta Research/<Tema>/ con un archivo findings.md.\n5. Haces rag_index_folder para indexar los nuevos archivos.\n\n## Output esperado\n- Research/<Tema>/findings.md con resumen ejecutivo, conceptos clave, referencias, preguntas abiertas.',
            triggers: { run_manual: true, on_new_chat: false, on_mentioned: false },
            schedule: { enabled: false },
            chain_next: 'synthesizer',
            allowed_folders: ['.'], allowed_tags: ['agent-access'],
            tools: ['vault'], model: 'auto', max_actions: 4,
          },
          {
            id: 'synthesizer', name: 'Synthesizer',
            instructions: 'Eres el SEGUNDO AGENTE del pipeline. Tomas los hallazgos del Forager y produces documentos pulidos.\n\n## Flujo\n1. Revisa el chain context (prev_actions del Forager) para saber que hallazgos se generaron.\n2. Lee Research/<Tema>/findings.md.\n3. Produce documentos: 01-introduction.md, 02-analysis.md, 03-conclusion.md.\n4. Cada documento con frontmatter, headings, referencias.\n5. Haces rag_index_folder.\n\n## Chain context\nSiempre revisa que hizo el agente anterior.',
            triggers: { run_manual: true, on_new_chat: false, on_mentioned: false },
            schedule: { enabled: false },
            chain_next: 'reflector',
            allowed_folders: ['Research', 'Agents'], allowed_tags: ['agent-access', 'research'],
            tools: ['vault'], model: 'auto', max_actions: 5,
          },
          {
            id: 'reflector', name: 'Reflector',
            instructions: 'Eres el TERCER AGENTE del pipeline. Revisas y mejoras la calidad del contenido.\n\n## Flujo\n1. Revisa el chain context para ver que documentos creo Synthesizer.\n2. Lee los documentos en Research/<Tema>/.\n3. Evalua: integridad, claridad, estructura, referencias.\n4. Si hay problemas, reescribe o corrige. Si no, usa accion none.\n\n## Criterios\n- Frontmatter con tags? Headings jerarquicos? Referencias? Contenido autocontenido? Errores factuales?',
            triggers: { run_manual: true, on_new_chat: false, on_mentioned: false },
            schedule: { enabled: false },
            chain_next: 'curator',
            allowed_folders: ['Research', 'Agents'], allowed_tags: ['agent-access', 'research'],
            tools: ['vault'], model: 'auto', max_actions: 3,
          },
          {
            id: 'curator', name: 'Curator',
            instructions: 'Eres el CUARTO Y ULTIMO AGENTE del pipeline. Catalogas el contenido final.\n\n## Flujo\n1. Revisa el chain context.\n2. Lee todos los documentos en Research/<Tema>/.\n3. Crea Research/<Tema>/README.md con indice, resumen, tags, estado.\n4. Agrega tags consistentes a todos los documentos.\n5. Hace rag_index_folder.\n6. Crea log en Agents/_logs/ con resumen del pipeline.\n\n## Chain context\nEste es el ultimo paso. Todo debe quedar coherente, indexado y documentado.',
            triggers: { run_manual: true, on_new_chat: false, on_mentioned: false },
            schedule: { enabled: false },
            allowed_folders: ['Research', 'Agents'], allowed_tags: ['agent-access'],
            tools: ['vault'], model: 'auto', max_actions: 3,
          },
        ];

        for (const a of agents) {
          await this.store.save(a);
        }
        new Notice('Pipeline created: Forager -> Synthesizer -> Reflector -> Curator');
      },
    });

    this.app.workspace.onLayoutReady(async () => {
      try {
        const agentsDir = this.app.vault.getAbstractFileByPath('Agents');
        if (!agentsDir) await this.app.vault.createFolder('Agents');
        const logsDir = this.app.vault.getAbstractFileByPath('Agents/_logs');
        if (!logsDir) await this.app.vault.createFolder('Agents/_logs');
        this.triggers.start();
        this.scheduler.start();
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
    this.scheduler?.stop();
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

  async loadChatSession(agentId: string, notePath: string, sessionId: string) {
    if (notePath) {
      const file = this.app.vault.getAbstractFileByPath(notePath);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf(true).openFile(file);
      }
    }
    await this.activateView(VIEW_TYPE_CHAT);
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
    if (leaf) {
      await (leaf.view as any).loadChatSession(agentId, notePath, sessionId);
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
