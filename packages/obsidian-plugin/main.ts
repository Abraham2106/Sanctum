import { App, Modal, Notice, Plugin, Setting, TFile } from 'obsidian';
import * as path from 'path';
import * as http from 'http';
import { AddressInfo } from 'net';
import { AgentListView, VIEW_TYPE_AGENT_LIST } from './src/AgentListView';
import { AgentSettingsView, VIEW_TYPE_AGENT_SETTINGS } from './src/AgentSettingsView';
import { ChatView, VIEW_TYPE_CHAT } from './src/ChatView';
import { SanctumSettingsTab, SanctumSettings, DEFAULT_SETTINGS } from './src/SanctumSettings';
import { createAgentServer } from '../agent-runtime/src/server.js';

export default class SanctumPlugin extends Plugin {
  settings: SanctumSettings = DEFAULT_SETTINGS;
  server: http.Server | null = null;
  serverPort = 0;

  async onload() {
    await this.loadSettings();

    // Cargar .env desde la raíz del vault
    try {
      const fs = require('fs');
      const dotenv = require('dotenv');
      const vaultBase: string = (this.app.vault.adapter as any).getBasePath();
      const envPath = path.resolve(vaultBase, '..', '.env');
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
      }
    } catch {}

    // Iniciar server embebido
    this.startServer();

    // Registrar vistas
    this.registerView(VIEW_TYPE_AGENT_LIST, (leaf) => new AgentListView(leaf, this));
    this.registerView(VIEW_TYPE_AGENT_SETTINGS, (leaf) => new AgentSettingsView(leaf, this));
    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

    this.addSettingTab(new SanctumSettingsTab(this.app, this));

    this.addRibbonIcon('bot', 'Sanctum Agents', () => {
      this.activateView(VIEW_TYPE_AGENT_LIST, 'left');
    });

    this.addRibbonIcon('message-circle', 'Sanctum Chat', () => {
      this.activateView(VIEW_TYPE_CHAT, 'right');
    });

    this.addCommand({
      id: 'run-sanctum-agent',
      name: 'Run Sanctum Agent',
      callback: () => new SanctumAgentModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'open-sanctum-agents-list',
      name: 'Open Sanctum Agents List',
      callback: () => this.activateView(VIEW_TYPE_AGENT_LIST, 'left'),
    });

    this.addCommand({
      id: 'open-sanctum-chat',
      name: 'Open Sanctum Chat',
      callback: () => this.activateView(VIEW_TYPE_CHAT, 'right'),
    });
  }

  async onunload() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  startServer() {
    const vaultBase: string = (this.app.vault.adapter as any).getBasePath();
    const rootDir = path.resolve(vaultBase, '..');
    const vaultPath = path.resolve(rootDir, 'vault');

    try {
      this.server = createAgentServer({ vaultPath, port: 0 });
      if (!this.server) return;
      this.server.on('listening', () => {
        const addr = this.server!.address() as AddressInfo;
        this.serverPort = addr.port;
        console.log(`Sanctum server embebido en puerto ${this.serverPort}`);
      });
    } catch (err) {
      console.error('Error iniciando Sanctum server:', err);
      new Notice('Error iniciando Sanctum server. Revisa la consola.');
    }
  }

  getServerUrl(): string {
    return `http://localhost:${this.serverPort}`;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView(viewType: string, side: 'left' | 'right') {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(viewType)[0];
    if (!leaf) {
      const newLeaf = side === 'left' ? workspace.getLeftLeaf(false) : workspace.getRightLeaf(false);
      if (newLeaf) {
        await newLeaf.setViewState({ type: viewType, active: true });
        leaf = newLeaf;
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  getRuntimePath(): string {
    if (this.settings.runtimePath) return this.settings.runtimePath;
    const vaultBase: string = (this.app.vault.adapter as any).getBasePath();
    return path.resolve(vaultBase, '..', 'packages', 'agent-runtime');
  }

  getSanctumVaultPath(): string {
    if (this.settings.vaultPath) return this.settings.vaultPath;
    const vaultBase: string = (this.app.vault.adapter as any).getBasePath();
    return vaultBase;
  }
}

class SanctumAgentModal extends Modal {
  agentPath = '';
  plugin: SanctumPlugin;

  constructor(app: App, plugin: SanctumPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Select Sanctum Agent' });

    const agentsFolder = 'Agents';
    const files = this.app.vault.getFiles().filter(file =>
      file.path.startsWith(agentsFolder) &&
      file.extension === 'md' &&
      !file.path.startsWith(`${agentsFolder}/_logs/`)
    );

    if (files.length === 0) {
      contentEl.createEl('p', { text: 'No agents found in Agents/ folder.' });
      return;
    }

    const dropdown = contentEl.createEl('select');
    files.forEach(file => {
      const option = dropdown.createEl('option');
      option.value = file.path;
      option.text = file.basename;
    });

    this.agentPath = files[0].path;
    dropdown.onchange = () => { this.agentPath = dropdown.value; };

    new Setting(contentEl).addButton(btn => btn
      .setButtonText('Run Agent')
      .setCta()
      .onClick(() => {
        this.close();
        this.runAgent(this.agentPath);
      }));
  }

  async runAgent(agentVaultPath: string) {
    new Notice(`Iniciando agente: ${agentVaultPath}`);

    try {
      const vaultBase = this.plugin.getSanctumVaultPath();
      const absoluteAgentPath = path.resolve(vaultBase, agentVaultPath);
      const serverUrl = this.plugin.getServerUrl();

      const res = await fetch(`${serverUrl}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentPath: absoluteAgentPath, parameters: {} }),
      });
      const data = await res.json();

      if (data.success) {
        new Notice('Agent completed successfully.');
      } else {
        new Notice(`Error: ${data.error}`);
      }
    } catch (err) {
      new Notice(`Error al ejecutar agente: ${err}`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
