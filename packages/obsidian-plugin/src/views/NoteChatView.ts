import { ItemView, WorkspaceLeaf } from 'obsidian';
import type SanctumAgentsPlugin from '../../main';
import { ChatMessage } from '../types';
import { ChatStorage } from '../chat/ChatStorage';

export const VIEW_TYPE_CHAT = 'sanctum-note-chat';

function makeSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export class NoteChatView extends ItemView {
  private plugin: SanctumAgentsPlugin;
  private currentAgentId = '';
  private currentSessionId = makeSessionId();
  private sessions = new Map<string, { history: ChatMessage[] }>();
  private chatStorage: ChatStorage;
  private lastPath = '';
  private currentNotePath = '';

  private agentSelectContainer!: HTMLElement;
  private agentSelectTrigger!: HTMLElement;
  private agentSelectMenu!: HTMLElement;
  private agentNames = new Map<string, string>();
  private agentIds: string[] = [];
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

  async loadChatSession(agentId: string, notePath: string, sessionId: string) {
    this.currentAgentId = agentId;
    this.currentNotePath = notePath;
    this.currentSessionId = sessionId;
    this.setAgentValue(agentId);
    this.lastPath = '';
    const history = await this.chatStorage.load(agentId, notePath, sessionId);
    const key = this.sessionKey();
    this.sessions.set(key, { history });
    this.renderMessages();
    this.statusEl.textContent = notePath || 'Chat global';
    console.log('[Chat] loaded session:', sessionId, history.length, 'msgs');
  }

  async newSession() {
    this.currentSessionId = makeSessionId();
    const key = this.sessionKey();
    this.sessions.set(key, { history: [] });
    this.renderMessages();
    console.log('[Chat] new session:', this.currentSessionId);
  }

  private buildUI() {
    const el = this.containerEl;
    el.empty();
    el.addClass('sanctum-chat-view');

    const topBar = el.createEl('div');
    topBar.addClass('sanctum-chat-header');

    this.agentSelectContainer = topBar.createEl('div', { cls: 'sanctum-chat-agent-select' });

    this.agentSelectTrigger = this.agentSelectContainer.createEl('div', { cls: 'sanctum-chat-agent-select-trigger' });
    this.agentSelectTrigger.textContent = '—';

    this.agentSelectMenu = this.agentSelectContainer.createEl('div', { cls: 'sanctum-chat-agent-select-menu' });

    this.agentSelectTrigger.onclick = (e) => {
      e.stopPropagation();
      this.agentSelectContainer.toggleClass('is-open', !this.agentSelectContainer.hasClass('is-open'));
    };

    this.agentSelectMenu.onclick = (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest('.sanctum-chat-agent-select-item') as HTMLElement | null;
      if (!item || !item.dataset.value) return;
      this.selectAgent(item.dataset.value);
    };

    this.registerDomEvent(document, 'click', (e) => {
      if (!this.agentSelectContainer.contains(e.target as Node)) {
        this.agentSelectContainer.removeClass('is-open');
      }
    });

    this.registerDomEvent(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        this.agentSelectContainer.removeClass('is-open');
      }
    });

    const newBtn = topBar.createEl('button', { text: '✚' });
    newBtn.addClass('sanctum-btn');
    newBtn.title = 'New Chat';
    newBtn.onclick = () => this.newSession();

    const historyBtn = topBar.createEl('button', { text: '📜' });
    historyBtn.addClass('sanctum-btn');
    historyBtn.title = 'Chat History';
    historyBtn.onclick = () => this.plugin.activateView('sanctum-chat-history');

    this.statusEl = el.createEl('div');
    this.statusEl.addClass('sanctum-chat-status');

    this.messagesEl = el.createEl('div');
    this.messagesEl.addClass('sanctum-chat-messages');

    const inputBar = el.createEl('div');
    inputBar.addClass('sanctum-chat-input-bar');

    this.inputEl = inputBar.createEl('input', { type: 'text', placeholder: 'Escribe @agente tu mensaje...' });
    this.inputEl.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    };

    const sendBtn = inputBar.createEl('button', { text: 'Send' });
    sendBtn.addClass('sanctum-btn', 'sanctum-btn-primary');
    sendBtn.onclick = () => this.sendMessage();
  }

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
        const allAgents = await this.plugin.store.list();
        const found = allAgents.find(a => a.id === lastMention || a.name.toLowerCase() === lastMention.toLowerCase());
        if (found) {
          this.setAgentValue(found.id);
          this.currentAgentId = found.id;
        }
      }
    } catch (err) { /* ignore */ }

    await this.loadCurrentChat();
  }

  private async loadCurrentChat() {
    if (!this.currentAgentId || !this.currentNotePath) return;
    const latest = await this.chatStorage.findLatestSession(this.currentAgentId, this.currentNotePath);
    if (latest) {
      this.currentSessionId = latest.sessionId;
      const key = this.sessionKey();
      this.sessions.set(key, { history: latest.history });
    } else {
      this.currentSessionId = makeSessionId();
      const key = this.sessionKey();
      this.sessions.set(key, { history: [] });
    }
    this.renderMessages();
  }

  private async loadAgentList() {
    const agents = await this.plugin.store.list();
    const prevValue = this.currentAgentId;
    this.agentSelectMenu.empty();
    this.agentNames.clear();
    this.agentIds = [];

    if (agents.length === 0) {
      this.agentSelectTrigger.textContent = '-- Sin agentes --';
      this.currentAgentId = '';
      return;
    }

    for (const a of agents) {
      const label = `${a.name} (${a.tools.join(',')})`;
      this.agentNames.set(a.id, label);
      this.agentIds.push(a.id);

      const item = this.agentSelectMenu.createEl('div', { cls: 'sanctum-chat-agent-select-item' });
      item.textContent = label;
      item.dataset.value = a.id;
    }

    const target = prevValue && agents.some(a => a.id === prevValue) ? prevValue : agents[0].id;
    this.selectAgent(target);
  }

  private selectAgent(id: string) {
    if (id === this.currentAgentId && this.currentAgentId !== '') {
      this.agentSelectContainer.removeClass('is-open');
      return;
    }

    this.currentAgentId = id;
    this.setAgentValue(id);
    this.agentSelectContainer.removeClass('is-open');

    this.currentSessionId = makeSessionId();
    this.loadCurrentChat();
  }

  private setAgentValue(id: string) {
    this.agentSelectTrigger.textContent = this.agentNames.get(id) || id;
    const items = this.agentSelectMenu.querySelectorAll('.sanctum-chat-agent-select-item');
    items.forEach(el => {
      el.removeClass('is-selected');
      if ((el as HTMLElement).dataset.value === id) {
        el.addClass('is-selected');
      }
    });
  }

  private sessionKey(): string {
    return `${this.currentNotePath || '?'}::${this.currentAgentId}::${this.currentSessionId}`;
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
      bubble.addClass('sanctum-chat-bubble', msg.role);
      const text = bubble.createEl('span');
      text.addClass('sanctum-chat-text');
      text.textContent = msg.content;
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
        this.setAgentValue(found.id);
        this.currentAgentId = found.id;
        this.currentSessionId = makeSessionId();
      } else {
        this.addMessage('assistant', `No existe "@${mentionRx[1]}".`);
        return;
      }
    }

    if (!this.currentAgentId) {
      this.addMessage('assistant', 'Seleccioná un agente del dropdown o escribí @agente.');
      return;
    }

    if (!text) return;

    this.inputEl.disabled = true;
    this.addMessage('user', text);
    this.inputEl.value = '';
    this.addMessage('assistant', '⏳ Pensando...');
    const notePath = this.currentNotePath || (this.app.workspace.getActiveFile()?.path ?? '');

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
      try {
        await this.chatStorage.save(this.currentAgentId, notePath, this.currentSessionId, session.history);
      } catch (saveErr) {
        console.error('[Chat] save error:', saveErr);
      }
    } catch (err) {
      this.replaceLast(`Error: ${err}`);
      console.error('[Chat] error:', err);
    }

    this.inputEl.disabled = false;
    this.inputEl.focus();
  }
}
