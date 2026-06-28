import { ItemView, WorkspaceLeaf, TFile, Notice, Setting } from 'obsidian';
import matter from 'gray-matter';
import * as path from 'path';
import type SanctumPlugin from '../main';

export const VIEW_TYPE_AGENT_SETTINGS = 'sanctum-agent-settings';

interface RunResult {
  success: boolean;
  error?: string;
  logs?: string[];
  actions?: Array<{ type: string; [key: string]: any }>;
}

export class AgentSettingsView extends ItemView {
  private file: TFile | null = null;
  private isRunning = false;
  private runResult: RunResult | null = null;
  private useContext = true;
  plugin: SanctumPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: SanctumPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_AGENT_SETTINGS;
  }

  getDisplayText() {
    return this.file ? `Settings: ${this.file.basename}` : 'Agent Settings';
  }

  async setAgentFile(file: TFile) {
    this.file = file;
    this.runResult = null;
    this.isRunning = false;
    if ((this.leaf as any)?.updateHeader) {
      (this.leaf as any).updateHeader();
    }
    await this.render();
  }

  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('sanctum-settings-container');

    if (!this.file) {
      const emptyState = container.createEl('p', { text: 'Seleccione un agente de la lista para ver su configuración.' });
      emptyState.addClass('sanctum-empty-state');
      return;
    }

    const content = await this.app.vault.read(this.file);
    let parsed;
    try {
      parsed = matter(content);
    } catch (err) {
      const errBox = container.createEl('div', { text: `Error al parsear YAML: ${err}` });
      errBox.addClass('sanctum-error-box');
      return;
    }

    const data = parsed.data || {};
    const body = parsed.content || '';

    // Título y Nombre
    const header = container.createEl('div');
    header.addClass('sanctum-settings-header');
    const settingsTitle = header.createEl('h3', { text: `Configurar: ${data.name || this.file.basename}` });
    settingsTitle.addClass('sanctum-settings-title');

    // --- TRIGGERS SECTION ---
    const triggersSection = container.createEl('div');
    triggersSection.addClass('sanctum-section');
    triggersSection.createEl('h4', { text: 'Triggers' });

    new Setting(triggersSection)
      .setName('When mentioned')
      .setDesc('Ejecutar automáticamente cuando se menciona el agente (Sprint 5 placeholder)')
      .addToggle(toggle => toggle
        .setValue(!!data.trigger_on_mention)
        .onChange(async (val) => { data.trigger_on_mention = val; })
      );

    // --- INSTRUCTIONS ---
    const instSection = container.createEl('div');
    instSection.addClass('sanctum-section');
    instSection.createEl('h4', { text: 'Instructions' });

    const instTextarea = instSection.createEl('textarea', { placeholder: 'Escribe las instrucciones del agente aquí...' });
    instTextarea.addClass('sanctum-instructions-textarea');
    instTextarea.value = data.instructions || '';
    instTextarea.addEventListener('change', () => { data.instructions = instTextarea.value; });

    // --- TOOLS AND ACCESS ---
    const toolsSection = container.createEl('div');
    toolsSection.addClass('sanctum-section');
    toolsSection.createEl('h4', { text: 'Tools and Access' });

    const knownTools = ['vault', 'github', 'discord', 'web'];
    const currentTools = new Set<string>(data.tools || []);

    knownTools.forEach(tool => {
      const isWeb = tool === 'web';
      new Setting(toolsSection)
        .setName(tool.toUpperCase())
        .setDesc(isWeb ? 'Búsqueda web en tiempo real (No implementado)' : `Acceso a la herramienta de ${tool}`)
        .addToggle(toggle => {
          toggle
            .setValue(isWeb ? false : currentTools.has(tool))
            .setDisabled(isWeb)
            .onChange(val => {
              if (val) currentTools.add(tool);
              else currentTools.delete(tool);
              data.tools = Array.from(currentTools);
            });
        });
    });

    const folderLabel = toolsSection.createEl('div', { text: 'Allowed Folders' });
    folderLabel.addClass('sanctum-settings-label');

    const allowedFolders = ['Agents', 'GitHub', 'Discord-logs'];
    const currentFolders = new Set<string>(data.allowed_folders || []);

    const folderCheckboxContainer = toolsSection.createEl('div');
    folderCheckboxContainer.addClass('sanctum-checkbox-group');

    allowedFolders.forEach(folder => {
      const label = folderCheckboxContainer.createEl('label');
      label.addClass('sanctum-checkbox-label');
      const cb = label.createEl('input', { type: 'checkbox' });
      cb.checked = currentFolders.has(folder);
      label.appendText(` ${folder}`);
      cb.addEventListener('change', () => {
        if (cb.checked) currentFolders.add(folder);
        else currentFolders.delete(folder);
        data.allowed_folders = Array.from(currentFolders);
      });
    });

    new Setting(toolsSection)
      .setName('Allowed Tags')
      .setDesc('Etiquetas permitidas para acceso a notas (separadas por comas)')
      .addText(text => text
        .setValue((data.allowed_tags || []).join(', '))
        .setPlaceholder('agent-access, internal')
        .onChange(val => {
          data.allowed_tags = val.split(',').map(t => t.trim()).filter(Boolean);
        })
      );

    // --- ADVANCED / MODEL ---
    const advSection = container.createEl('div');
    advSection.addClass('sanctum-section');
    advSection.createEl('h4', { text: 'Advanced & Model' });

    new Setting(advSection)
      .setName('Model')
      .setDesc('Modelo de lenguaje a utilizar')
      .addDropdown(dd => dd
        .addOption('gemini-2.0-flash', 'Gemini 2.0 Flash (Recomendado)')
        .addOption('gemini-2.5-flash', 'Gemini 2.5 Flash')
        .addOption('gemini-2.5-pro', 'Gemini 2.5 Pro')
        .addOption('gemini-2.0-flash-lite', 'Gemini 2.0 Flash Lite')
        .addOption('gemini-1.5-flash', 'Gemini 1.5 Flash')
        .addOption('gemini-1.5-pro', 'Gemini 1.5 Pro')
        .setValue((!data.model || data.model === 'auto') ? 'gemini-2.0-flash' : data.model)
        .onChange(val => { data.model = val; })
      );

    // --- GUARDAR Y ELIMINAR ---
    const saveSection = container.createEl('div');
    saveSection.addClass('sanctum-save-section');
    saveSection.style.display = 'flex';
    saveSection.style.gap = '10px';

    const saveBtn = saveSection.createEl('button', { text: 'Save Changes' });
    saveBtn.addClass('mod-cta');
    saveBtn.addClass('sanctum-save-btn');
    saveBtn.style.flex = '1';
    saveBtn.addEventListener('click', async () => {
      try {
        const updatedContent = matter.stringify(body, data);
        await this.app.vault.modify(this.file!, updatedContent);
        new Notice('Configuración guardada exitosamente.');
        await this.render();
      } catch (err) {
        new Notice(`Error al guardar: ${err}`);
      }
    });

    const deleteBtn = saveSection.createEl('button', { text: 'Delete Agent' });
    deleteBtn.addClass('mod-warning');
    deleteBtn.style.backgroundColor = 'var(--text-error)';
    deleteBtn.style.color = 'white';
    deleteBtn.addEventListener('click', async () => {
      const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar al agente "${data.name}"?`);
      if (confirmDelete && this.file) {
        try {
          await this.app.vault.delete(this.file);
          new Notice(`Agente "${data.name}" eliminado.`);
          this.leaf.detach();
        } catch (err) {
          new Notice(`Error al eliminar: ${err}`);
        }
      }
    });

    // --- RUN SECTION ---
    const runSection = container.createEl('div');
    runSection.addClass('sanctum-run-section');

    const ctxRow = runSection.createEl('div');
    ctxRow.addClass('sanctum-context-toggle-row');

    const ctxLabel = ctxRow.createEl('label');
    ctxLabel.addClass('sanctum-context-toggle-label');

    const ctxCheck = ctxLabel.createEl('input');
    ctxCheck.type = 'checkbox';
    ctxCheck.checked = this.useContext;
    ctxCheck.addClass('sanctum-context-checkbox');
    ctxCheck.addEventListener('change', () => { this.useContext = ctxCheck.checked; });

    const ctxSpan = ctxLabel.createEl('span');
    ctxSpan.setText('Use Context (incluir notas del vault)');
    ctxSpan.addClass('sanctum-context-toggle-text');

    const runBtn = runSection.createEl('button', { text: '▶ Run Agent Now' });
    runBtn.addClass('sanctum-run-btn');
    runBtn.addEventListener('click', () => { if (!this.isRunning) this.runAgent(); });

    const resultSection = container.createEl('div');
    resultSection.addClass('sanctum-result-section');

    if (this.isRunning) {
      resultSection.createEl('div', { text: 'Running agent...' }).addClass('sanctum-status-running');
    } else if (this.runResult) {
      this.renderResult(resultSection);
    }
  }

  renderResult(resultSection: HTMLElement) {
    const r = this.runResult!;
    const titleRes = resultSection.createEl('h4', { text: r.success ? '✅ Ejecución exitosa' : '❌ Error en ejecución' });
    titleRes.addClass(r.success ? 'sanctum-run-success' : 'sanctum-run-failed');

    const resBox = resultSection.createEl('div');
    resBox.addClass('sanctum-result-box');

    if (r.success && r.actions) {
      resBox.createEl('h5', { text: 'Acciones ejecutadas' });
      if (r.actions.length === 0) {
        resBox.createEl('p', { text: 'Ninguna acción (none)' }).addClass('sanctum-no-actions');
      } else {
        const actList = resBox.createEl('div');
        actList.addClass('sanctum-actions-list');
        r.actions.forEach((act: any) => {
          let desc = '';
          if (act.type === 'github_issue_create') desc = `Crear issue: "${act.title}"`;
          else if (act.type === 'github_issue_close') desc = `Cerrar issue #${act.issue_number}`;
          else if (act.type === 'vault_write') desc = `Escribir a: ${act.path}`;
          else if (act.type === 'discord_send') desc = `Enviar mensaje a canal: ${act.channel_id}`;
          else if (act.type === 'none') desc = `Ninguna acción: ${act.reason}`;

          const actDiv = actList.createEl('div');
          actDiv.addClass('sanctum-action-item');
          const typeBadge = actDiv.createEl('span', { text: act.type });
          typeBadge.addClass('sanctum-action-type-badge');
          actDiv.createEl('span', { text: ` ${desc}` }).addClass('sanctum-action-desc');
        });
      }
    }

    if (!r.success && r.error) {
      const errorBox = resBox.createEl('div');
      errorBox.addClass('sanctum-error-box');
      errorBox.createEl('h5', { text: 'Error' });
      errorBox.createEl('pre').setText(r.error);
    }

    if (r.logs && r.logs.length > 0) {
      const consoleTitle = resultSection.createEl('h4', { text: 'Logs de ejecución' });
      consoleTitle.addClass('sanctum-settings-label');
      const consolePre = resultSection.createEl('pre');
      consolePre.addClass('sanctum-raw-output');
      consolePre.setText(r.logs.join('\n'));
    }
  }

  async runAgent() {
    if (!this.file) return;
    this.isRunning = true;
    this.runResult = null;
    this.render();

    const vaultBase: string = (this.app.vault.adapter as any).getBasePath();
    const absoluteAgentPath = path.join(vaultBase, this.file.path);
    const serverUrl = this.plugin.getServerUrl();

    try {
      const res = await fetch(`${serverUrl}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentPath: absoluteAgentPath,
          noContext: !this.useContext,
          parameters: {},
        }),
      });
      const data = await res.json();
      this.runResult = {
        success: data.success,
        error: data.error,
        logs: data.logs,
        actions: data.actions,
      };
    } catch (err) {
      this.runResult = { success: false, error: String(err), logs: [] };
    }

    this.isRunning = false;
    this.render();
  }

  async onClose() {}
}
