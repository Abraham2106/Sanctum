import { ItemView, WorkspaceLeaf } from 'obsidian';
import type SanctumAgentsPlugin from '../../main';
import { ChatMessage } from '../types';
import { ChatStorage } from '../chat/ChatStorage';

export const VIEW_TYPE_CHAT = 'sanctum-note-chat';

export class NoteChatView extends ItemView {
  private plugin: SanctumAgentsPlugin;
  private currentAgentId = '';
  private sessions = new Map<string, { history: ChatMessage[] }>();
  private chatStorage: ChatStorage;
  private lastPath = '';
  private currentNotePath = '';

  private agentSelect!: HTMLSelectElement;
  private statusEl!: HTMLElement;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLInputElement;

  constructor(leaf: WorkspaceLeaf, plugin: SanctumAgentsPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.chatStorage = new ChatStorage(this.app);
  }

  getViewType(): string { return VIEW_TYPE_CHAT; }
  getDisplayText(): string { return 'Sanctum Chat'; }
  getIcon(): string { return 'message-circle'; }

  async onOpen() {
    console.log('[Chat] onOpen');
    try {
      this.buildUI();
      this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.sync()));
      await this.sync();
      console.log('[Chat] listo');
    } catch (err) {
      console.error('[Chat] onOpen error:', err);
      this.containerEl.empty();
      this.containerEl.createEl('p', { text: `Error al abrir chat: ${err}` });
    }
  }

  async onClose(): Promise<void> {
    console.log('[Chat] onClose');
    this.containerEl.empty();
  }

  /** Carga una sesión de chat desde disco (llamado por ChatHistoryView) */
  async loadChatFromFiles(agentId: string, notePath: string) {
    this.currentAgentId = agentId;
    this.currentNotePath = notePath;
    if (this.agentSelect) {
      this.agentSelect.value = agentId;
    }
    this.lastPath = '';       // fuerza re-sync
    const history = await this.chatStorage.load(agentId, notePath);
    const key = this.sessionKeyRaw(agentId, notePath);
    this.sessions.set(key, { history });
    this.renderMessages();
    this.statusEl.textContent = notePath || 'Chat global';
    console.log('[Chat] loaded from disk:', agentId, notePath, history.length, 'messages');
  }

  // ─── Construcción del DOM ──────────────────────────

  private buildUI() {
    const el = this.containerEl;
    el.empty();
    el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;font-family:sans-serif;';

    const topBar = el.createEl('div');
    topBar.style.cssText = 'display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid #eee;';

    this.agentSelect = topBar.createEl('select');
    this.agentSelect.style.cssText = 'flex:1;padding:6px;font-size:13px;background:#f5f5f5;color:#000;border:1px solid #ccc;border-radius:4px;min-height:32px;cursor:pointer;';
    this.agentSelect.onchange = async () => {
      this.currentAgentId = this.agentSelect.value;
      await this.loadCurrentChat();
    };

    const historyBtn = topBar.createEl('button', { text: '📜' });
    historyBtn.style.cssText = 'padding:4px 8px;font-size:14px;background:#f5f5f5;color:#000;border:1px solid #ccc;border-radius:4px;cursor:pointer;';
    historyBtn.title = 'Chat History';
    historyBtn.onclick = () => this.plugin.activateView('sanctum-chat-history');

    this.statusEl = el.createEl('div');
    this.statusEl.style.cssText = 'font-size:11px;color:#666;padding:2px 8px 4px;';

    this.messagesEl = el.createEl('div');
    this.messagesEl.style.cssText = 'flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;min-height:0;';

    const inputBar = el.createEl('div');
    inputBar.style.cssText = 'display:flex;gap:6px;padding:6px 8px;border-top:1px solid #eee;';

    this.inputEl = inputBar.createEl('input', { type: 'text', placeholder: 'Escribe @agente tu mensaje...' });
    this.inputEl.style.cssText = 'flex:1;padding:8px;font-size:14px;border:1px solid #ccc;border-radius:4px;';
    this.inputEl.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    };

    const sendBtn = inputBar.createEl('button', { text: 'Send' });
    sendBtn.style.cssText = 'padding:8px 16px;font-size:14px;background:#0066cc;color:#fff;border:none;border-radius:4px;cursor:pointer;';
    sendBtn.onclick = () => this.sendMessage();

    console.log('[Chat] UI construida');
  }

  // ─── Sincronización con nota activa ────────────────

  private async sync() {
    const file = this.app.workspace.getActiveFile();
    const path = file?.path ?? '';
    if (path === this.lastPath) return;
    this.lastPath = path;

    if (!file) {
      this.statusEl.textContent = 'No hay nota activa';
      return;
    }
    this.statusEl.textContent = file.path;
    this.currentNotePath = file.path;

    await this.loadAgentList();

    try {
      const content = await this.app.vault.read(file);
      const matches = [...content.matchAll(/@([\w-]+)/g)];
      if (matches.length > 0) {
        const lastMention = matches[matches.length - 1][1];
        console.log('[Chat] @detectado en nota:', lastMention);
        const allAgents = await this.plugin.store.list();
        const found = allAgents.find(a => a.id === lastMention || a.name.toLowerCase() === lastMention.toLowerCase());
        if (found) {
          this.agentSelect.value = found.id;
          this.currentAgentId = found.id;
          console.log('[Chat] agente auto-seleccionado por @:', found.id);
        }
      }
    } catch (err) {
      console.warn('[Chat] error @detect:', err);
    }

    await this.loadCurrentChat();
  }

  private async loadCurrentChat() {
    if (!this.currentAgentId || !this.currentNotePath) return;
    const history = await this.chatStorage.load(this.currentAgentId, this.currentNotePath);
    const key = this.sessionKey();
    this.sessions.set(key, { history });
    this.renderMessages();
    console.log('[Chat] loaded chat:', this.currentAgentId, 
      this.currentNotePath, history.length, 'messages');
  }

  // ─── Agentes dropdown ──────────────────────────────

  private async loadAgentList() {
    console.log('[Chat] loadAgentList');
    const agents = await this.plugin.store.list();
    const prevValue = this.agentSelect.value || this.currentAgentId;
    this.agentSelect.empty();
    if (agents.length === 0) {
      const opt = this.agentSelect.createEl('option');
      opt.value = ''; opt.text = '-- Sin agentes --'; opt.selected = true;
      this.currentAgentId = '';
      return;
    }
    for (const a of agents) {
      const opt = this.agentSelect.createEl('option', { value: a.id, text: `${a.name} (${a.tools.join(',')})` });
      if (a.id === prevValue) opt.selected = true;
    }
    this.currentAgentId = this.agentSelect.value || agents[0]?.id || '';
  }

  // ─── Sesiones y mensajes ───────────────────────────

  private sessionKeyRaw(agentId: string, notePath: string): string {
    return `${notePath || '?'}::${agentId}`;
  }

  private sessionKey(): string {
    return this.sessionKeyRaw(this.currentAgentId, (this.currentNotePath || this.app.workspace.getActiveFile()?.path) ?? '');
  }

  private getSession() {
    const key = this.sessionKey();
    if (!this.sessions.has(key)) {
      this.sessions.set(key, { history: [] });
    }
    return this.sessions.get(key)!;
  }

  private renderMessages() {
    this.messagesEl.empty();
    const session = this.getSession();
    for (const msg of session.history) {
      const bubble = this.messagesEl.createEl('div');
      bubble.style.cssText = msg.role === 'user'
        ? 'align-self:flex-end;background:#0066cc;color:#fff;padding:6px 10px;border-radius:8px;font-size:13px;max-width:90%;white-space:pre-wrap;'
        : 'align-self:flex-start;background:#eee;color:#000;padding:6px 10px;border-radius:8px;font-size:13px;max-width:90%;white-space:pre-wrap;';
      bubble.textContent = msg.content;
    }
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private addMessage(role: 'user' | 'assistant', content: string) {
    this.getSession().history.push({ role, content });
    this.renderMessages();
  }

  private replaceLast(content: string) {
    const h = this.getSession().history;
    if (h.length > 0) h[h.length - 1].content = content;
    this.renderMessages();
  }

  private async saveToDisk() {
    const notePath = this.currentNotePath || this.app.workspace.getActiveFile()?.path ?? '';
    const session = this.sessions.get(this.sessionKey());
    if (session) {
      await this.chatStorage.save(this.currentAgentId, notePath, session.history);
      console.log('[Chat] saved to disk');
    }
  }

  // ─── Envío de mensajes ─────────────────────────────

  private async sendMessage() {
    let text = this.inputEl.value.trim();
    if (!text) return;

    const mentionRx = text.match(/^@([\w-]+)\s*(.*)/);
    if (mentionRx) {
      const name = mentionRx[1].toLowerCase();
      text = mentionRx[2] || '';
      const all = await this.plugin.store.list();
      const found = all.find(a => a.id === name || a.name.toLowerCase() === name);
      if (found) {
        this.agentSelect.value = found.id;
        this.currentAgentId = found.id;
      } else {
        this.addMessage('assistant', `No existe un agente con id "@${mentionRx[1]}".`);
        return;
      }
    }

    if (!this.currentAgentId) {
      this.addMessage('assistant', 'Seleccioná un agente del dropdown o escribí @agente en el mensaje.');
      return;
    }

    if (!text) return;

    this.inputEl.disabled = true;
    this.addMessage('user', text);
    this.inputEl.value = '';
    this.addMessage('assistant', '⏳ Pensando...');
    const notePath = this.currentNotePath || this.app.workspace.getActiveFile()?.path ?? '';

    try {
      const agent = await this.plugin.store.get(this.currentAgentId);
      if (!agent) {
        this.replaceLast(`Agente "${this.currentAgentId}" no encontrado.`);
        this.inputEl.disabled = false;
        return;
      }

      const session = this.getSession();
      const response = await this.plugin.runner.runChat(agent, session.history.slice(0, -1), text);
      this.replaceLast(response || '(respuesta vacía)');
      await this.chatStorage.save(this.currentAgentId, notePath, session.history);
    } catch (err) {
      this.replaceLast(`Error: ${err}`);
      console.error('[Chat] error:', err);
    }

    this.inputEl.disabled = false;
    this.inputEl.focus();
  }
}
