import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import matter from 'gray-matter';
import { AgentSettingsView } from './AgentSettingsView';
import { NewAgentModal } from './NewAgentModal';
import type SanctumPlugin from '../main';

export const VIEW_TYPE_AGENT_LIST = 'sanctum-agent-list';

export class AgentListView extends ItemView {
  plugin: SanctumPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: SanctumPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_AGENT_LIST;
  }

  getDisplayText() {
    return 'Sanctum Agents';
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('sanctum-agent-list-container');

    // Estilos CSS inline o globales (nos enfocamos en Rich Aesthetics)
    const header = container.createEl('div');
    header.addClass('sanctum-header');
    
    const titleEl = header.createEl('h2', { text: 'Sanctum Agents' });
    titleEl.addClass('sanctum-title');

    const btnNew = header.createEl('button', { 
      text: '+ New Agent'
    });
    btnNew.addClass('mod-cta');
    btnNew.addClass('sanctum-new-btn');
    btnNew.addEventListener('click', () => this.handleNewAgent());

    const listContainer = container.createEl('div');
    listContainer.addClass('sanctum-list');

    const agentsFolder = 'Agents';
    const files = this.app.vault.getFiles().filter(file => 
      file.path.startsWith(agentsFolder) && 
      file.extension === 'md' &&
      !file.path.startsWith(`${agentsFolder}/_logs/`)
    );

    if (files.length === 0) {
      const emptyState = listContainer.createEl('p', { text: 'No agents found in Agents/ folder.' });
      emptyState.addClass('sanctum-empty-state');
      return;
    }

    for (const file of files) {
      const content = await this.app.vault.read(file);
      let parsed;
      try {
        parsed = matter(content);
      } catch (err) {
        console.error(`Error frontmatter ${file.path}:`, err);
        parsed = { data: {} };
      }

      const data = parsed.data || {};
      const agentCard = listContainer.createEl('div');
      agentCard.addClass('sanctum-agent-card');
      
      const cardTitle = agentCard.createEl('div', { text: file.basename });
      cardTitle.addClass('sanctum-agent-card-title');
      
      if (data.description) {
        const cardDesc = agentCard.createEl('div', { text: data.description });
        cardDesc.addClass('sanctum-agent-card-desc');
      }

      const badgesContainer = agentCard.createEl('div');
      badgesContainer.addClass('sanctum-agent-badges');
      
      // Mostrar tools como badges
      const tools = data.tools || [];
      if (Array.isArray(tools)) {
        tools.forEach((tool: string) => {
          const badge = badgesContainer.createEl('span', { text: tool });
          badge.addClass('sanctum-badge');
          badge.addClass('sanctum-badge-tool');
        });
      }

      // Mostrar model como badge
      if (data.model) {
        const badge = badgesContainer.createEl('span', { text: data.model });
        badge.addClass('sanctum-badge');
        badge.addClass('sanctum-badge-model');
      }

      agentCard.addEventListener('click', () => {
        this.openAgentSettings(file);
      });
    }
  }

  openAgentSettings(file: TFile) {
    const settingsLeaf = this.app.workspace.getLeavesOfType('sanctum-agent-settings')[0];
    if (settingsLeaf) {
      this.app.workspace.revealLeaf(settingsLeaf);
      (settingsLeaf.view as AgentSettingsView).setAgentFile(file);
    } else {
      const rightLeaf = this.app.workspace.getRightLeaf(false);
      if (rightLeaf) {
        rightLeaf.setViewState({
          type: 'sanctum-agent-settings',
          active: true,
          state: { filePath: file.path }
        }).then(() => {
          (rightLeaf.view as AgentSettingsView).setAgentFile(file);
          this.app.workspace.revealLeaf(rightLeaf);
        });
      }
    }
  }

  getSanctumAgentsFolder(): string {
    // Intenta usar la ruta configurada del vault de Sanctum si está disponible
    const vaultPath = this.plugin.getSanctumVaultPath();
    return vaultPath;
  }

  handleNewAgent() {
    new NewAgentModal(this.app, async (name) => {
      if (!name) return;

      const sanitizedName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      if (!sanitizedName) {
        new Notice('Nombre de agente inválido.');
        return;
      }

      const filePath = `Agents/${sanitizedName}.md`;
      const exists = await this.app.vault.adapter.exists(filePath);
      if (exists) {
        new Notice(`Error: El agente "${sanitizedName}" ya existe.`);
        return;
      }

      const defaultContent = `---
name: ${name.trim()}
description: Nuevo agente creado desde la interfaz de Obsidian.
allowed_folders:
  - Agents
allowed_tags:
  - agent-access
model: auto
tools:
  - vault
---

# ${name.trim()}

Escribe las instrucciones detalladas del agente aquí.
`;

      // Asegurar que la carpeta Agents existe
      const agentsDirExists = await this.app.vault.adapter.exists('Agents');
      if (!agentsDirExists) {
        await this.app.vault.createFolder('Agents');
      }

      const newFile = await this.app.vault.create(filePath, defaultContent);
      new Notice(`Agente ${sanitizedName} creado.`);
      await this.refresh();
      this.openAgentSettings(newFile);
    }).open();
  }

  async onClose() {
    // Limpieza
  }
}
