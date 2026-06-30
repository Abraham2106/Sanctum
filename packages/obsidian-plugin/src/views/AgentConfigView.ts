import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type SanctumAgentsPlugin from '../../main';
import { AgentConfig, AgentSchedule, AgentTool, VaultEventType } from '../types';

export const VIEW_TYPE_AGENT_CONFIG = 'sanctum-agent-config';

export class AgentConfigView extends ItemView {
  private plugin: SanctumAgentsPlugin;
  private editingId: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: SanctumAgentsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_AGENT_CONFIG; }
  getDisplayText(): string { return this.editingId ? `Agent: ${this.editingId}` : 'New Agent'; }
  getIcon(): string { return 'settings'; }

  async onOpen() {
    if (!this.editingId) {
      this.renderNewForm();
    }
  }

  async loadAgent(id: string) {
    this.editingId = id;
    const config = await this.plugin.store.get(id);
    if (!config) {
      new Notice(`Agent "${id}" not found`);
      return;
    }
    this.renderForm(config);
  }

  loadNew() {
    this.editingId = null;
    this.renderNewForm();
  }

  private renderNewForm() {
    const defaults: AgentConfig = {
      id: '', name: '', instructions: '',
      triggers: { run_manual: true, on_new_chat: false, on_mentioned: false },
      schedule: { enabled: false },
      allowed_folders: [], allowed_tags: [], tools: ['vault'],
      model: 'auto', max_actions: 3,
    };
    this.renderForm(defaults);
  }

  private renderForm(config: AgentConfig) {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('sanctum-agent-config');
    containerEl.createEl('h3', { text: this.editingId ? `Edit: ${config.name}` : 'New Agent' });

    const form = containerEl.createEl('div', { cls: 'sanctum-form' });

    this.addSection(form, 'Agent');
    const idRow = form.createEl('div', { cls: 'sanctum-field-row' });
    idRow.createEl('label', { text: 'ID:', cls: 'sanctum-field-label' });
    const idInput = idRow.createEl('input', { type: 'text', value: config.id, cls: 'sanctum-input' });
    if (this.editingId) idInput.disabled = true;

    const nameRow = form.createEl('div', { cls: 'sanctum-field-row' });
    nameRow.createEl('label', { text: 'Name:', cls: 'sanctum-field-label' });
    const nameInput = nameRow.createEl('input', { type: 'text', value: config.name, cls: 'sanctum-input wide' });

    this.addSection(form, 'Instructions');
    const instrText = form.createEl('textarea', { text: config.instructions, cls: 'sanctum-textarea' });
    instrText.placeholder = 'What should this agent do?';

    this.addSection(form, 'Triggers');
    const runMan = this.addToggle(form, 'Run Manual', config.triggers.run_manual);
    const newChat = this.addToggle(form, 'On New Chat', config.triggers.on_new_chat);
    const mentioned = this.addToggle(form, 'On @Mentioned', config.triggers.on_mentioned);
    const vaultEv = this.addToggle(form, 'On Vault Event', !!config.triggers.on_vault_event);

    const vaultEventDetails = form.createEl('div', { cls: 'sanctum-vault-event' });
    vaultEventDetails.style.display = config.triggers.on_vault_event ? '' : 'none';
    vaultEv.onchange = () => { vaultEventDetails.style.display = vaultEv.checked ? '' : 'none'; };

    const fnRow = vaultEventDetails.createEl('div', { cls: 'sanctum-field-row' });
    fnRow.createEl('label', { text: 'Folders:', cls: 'sanctum-field-label' });
    const veFolders = fnRow.createEl('input', { type: 'text', value: config.triggers.on_vault_event?.folders?.join(', ') ?? '', placeholder: 'GitHub, Agents', cls: 'sanctum-input' });

    const tgRow = vaultEventDetails.createEl('div', { cls: 'sanctum-field-row' });
    tgRow.createEl('label', { text: 'Tags:', cls: 'sanctum-field-label' });
    const veTags = tgRow.createEl('input', { type: 'text', value: config.triggers.on_vault_event?.tags?.join(', ') ?? '', placeholder: 'agent-access', cls: 'sanctum-input' });

    const evRow = vaultEventDetails.createEl('div', { cls: 'sanctum-field-row' });
    evRow.createEl('label', { text: 'Event:', cls: 'sanctum-field-label' });
    const veEvent = evRow.createEl('select', { cls: 'sanctum-select' });
    ['both', 'create', 'modify'].forEach(e => {
      const opt = veEvent.createEl('option', { value: e, text: e });
      opt.selected = e === (config.triggers.on_vault_event?.event ?? 'both');
    });

    this.addSection(form, 'Schedule');
    const schedOn = this.addToggle(form, 'Scheduled', config.schedule?.enabled ?? false);

    const scheduleDetails = form.createEl('div', { cls: 'sanctum-vault-event' });
    scheduleDetails.style.display = config.schedule?.enabled ? '' : 'none';
    schedOn.onchange = () => { scheduleDetails.style.display = schedOn.checked ? '' : 'none'; };

    // Mode selector: every N minutes or daily at fixed time
    const schedModeRow = scheduleDetails.createEl('div', { cls: 'sanctum-field-row' });
    schedModeRow.createEl('label', { text: 'Mode:', cls: 'sanctum-field-label' });
    const schedMode = schedModeRow.createEl('select', { cls: 'sanctum-select' });
    const isInterval = config.schedule?.intervalMinutes !== undefined;
    ['interval', 'daily'].forEach(m => {
      const opt = schedMode.createEl('option', { value: m, text: m === 'interval' ? 'Every N minutes' : 'Daily at time' });
      opt.selected = m === (isInterval ? 'interval' : 'daily');
    });

    const schedIntervalRow = scheduleDetails.createEl('div', { cls: 'sanctum-field-row' });
    schedIntervalRow.createEl('label', { text: 'Every:', cls: 'sanctum-field-label' });
    const schedIntervalInput = schedIntervalRow.createEl('input', {
      type: 'number', value: String(config.schedule?.intervalMinutes ?? 60),
      cls: 'sanctum-input narrow',
    });
    schedIntervalInput.setAttribute('min', '1');
    schedIntervalRow.createEl('span', { text: 'min', cls: 'sanctum-field-label' });

    const schedDailyRow = scheduleDetails.createEl('div', { cls: 'sanctum-field-row' });
    schedDailyRow.createEl('label', { text: 'At:', cls: 'sanctum-field-label' });
    const schedDailyInput = schedDailyRow.createEl('input', {
      type: 'text', value: config.schedule?.dailyAt ?? '09:00', placeholder: '09:00',
      cls: 'sanctum-input narrow',
    });

    // Show/hide rows based on mode
    schedIntervalRow.style.display = schedMode.value === 'interval' ? '' : 'none';
    schedDailyRow.style.display = schedMode.value === 'daily' ? '' : 'none';
    schedMode.onchange = () => {
      schedIntervalRow.style.display = schedMode.value === 'interval' ? '' : 'none';
      schedDailyRow.style.display = schedMode.value === 'daily' ? '' : 'none';
    };

    this.addSection(form, 'Tools & Access');
    const toolTypes: AgentTool[] = ['vault', 'github', 'web', 'discord'];
    const toolToggles: Record<AgentTool, HTMLInputElement> = {} as Record<AgentTool, HTMLInputElement>;
    for (const t of toolTypes) {
      toolToggles[t] = this.addToggle(form, t.charAt(0).toUpperCase() + t.slice(1), config.tools.includes(t));
    }

    const afRow = form.createEl('div', { cls: 'sanctum-field-row' });
    afRow.createEl('label', { text: 'Allowed Folders:', cls: 'sanctum-field-label' });
    const afInput = afRow.createEl('input', { type: 'text', value: config.allowed_folders.join(', '), placeholder: 'GitHub, Agents', cls: 'sanctum-input wide' });

    const atRow = form.createEl('div', { cls: 'sanctum-field-row' });
    atRow.createEl('label', { text: 'Allowed Tags:', cls: 'sanctum-field-label' });
    const atInput = atRow.createEl('input', { type: 'text', value: config.allowed_tags.join(', '), placeholder: 'agent-access, triage', cls: 'sanctum-input wide' });

    this.addSection(form, 'Model');
    const modelRow = form.createEl('div', { cls: 'sanctum-field-row' });
    modelRow.createEl('label', { text: 'Model:', cls: 'sanctum-field-label' });
    const modelInput = modelRow.createEl('input', { type: 'text', value: config.model, placeholder: 'auto', cls: 'sanctum-input' });

    const maxRow = form.createEl('div', { cls: 'sanctum-field-row' });
    maxRow.createEl('label', { text: 'Max Actions:', cls: 'sanctum-field-label' });
    const maxInput = maxRow.createEl('input', { type: 'number', value: String(config.max_actions), cls: 'sanctum-input narrow' });
    maxInput.min = '1';

    const saveBtn = form.createEl('button', { text: 'Save Agent', cls: 'sanctum-btn sanctum-btn-primary save-btn' });
    saveBtn.onclick = () => this.save(
      idInput, nameInput, instrText, runMan, newChat, mentioned, vaultEv,
      veFolders, veTags, veEvent,
      schedOn, schedMode, schedIntervalInput, schedDailyInput,
      toolToggles, afInput, atInput, modelInput, maxInput,
    );
  }

  private async save(
    idInput: HTMLInputElement, nameInput: HTMLInputElement,
    instrText: HTMLTextAreaElement, runMan: HTMLInputElement, newChat: HTMLInputElement,
    mentioned: HTMLInputElement, vaultEv: HTMLInputElement, veFolders: HTMLInputElement,
    veTags: HTMLInputElement, veEvent: HTMLSelectElement,
    schedOn: HTMLInputElement, schedMode: HTMLSelectElement,
    schedIntervalInput: HTMLInputElement, schedDailyInput: HTMLInputElement,
    toolToggles: Record<AgentTool, HTMLInputElement>, afInput: HTMLInputElement,
    atInput: HTMLInputElement, modelInput: HTMLInputElement, maxInput: HTMLInputElement,
  ) {
    const id = idInput.value.trim();
    if (!id) { new Notice('Agent ID is required'); return; }

    const split = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean);

    const schedule: AgentSchedule | undefined = schedOn.checked
      ? {
          enabled: true,
          intervalMinutes: schedMode.value === 'interval' ? (parseInt(schedIntervalInput.value, 10) || 60) : undefined,
          dailyAt: schedMode.value === 'daily' ? (schedDailyInput.value.trim() || '09:00') : undefined,
        }
      : { enabled: false };

    const config: AgentConfig = {
      id,
      name: nameInput.value.trim() || id,
      instructions: instrText.value,
      triggers: {
        run_manual: runMan.checked,
        on_new_chat: newChat.checked,
        on_mentioned: mentioned.checked,
        on_vault_event: vaultEv.checked ? { folders: split(veFolders.value), tags: split(veTags.value), event: veEvent.value as VaultEventType } : undefined,
      },
      schedule,
      allowed_folders: split(afInput.value),
      allowed_tags: split(atInput.value),
      tools: (Object.entries(toolToggles) as [AgentTool, HTMLInputElement][]).filter(([, cb]) => cb.checked).map(([t]) => t),
      model: modelInput.value.trim() || 'auto',
      max_actions: parseInt(maxInput.value, 10) || 3,
    };

    await this.plugin.store.save(config);
    await this.plugin.scheduler.refresh();
    new Notice(`Agent "${config.name}" saved`);
    this.editingId = id;
  }

  private addSection(container: HTMLElement, title: string) {
    container.createEl('div', { text: title, cls: 'sanctum-section-title' });
  }

  private addToggle(container: HTMLElement, label: string, checked: boolean): HTMLInputElement {
    const labelEl = container.createEl('label', { cls: 'sanctum-toggle' });
    const cb = labelEl.createEl('input', { type: 'checkbox', cls: 'sanctum-toggle-input' });
    cb.checked = checked;
    labelEl.createEl('span', { cls: 'sanctum-toggle-slider' });
    labelEl.createEl('span', { text: label, cls: 'sanctum-toggle-label' });
    return cb;
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
    this.editingId = null;
  }
}
