import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type SanctumPlugin from '../main';

export const VIEW_TYPE_CHAT = 'sanctum-chat-view';

interface ChatMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
}

export class ChatView extends ItemView {
  plugin: SanctumPlugin;
  messages: ChatMessage[] = [];
  chatContainer!: HTMLElement;
  inputBox!: HTMLTextAreaElement;
  agentSelect!: HTMLSelectElement;

  constructor(leaf: WorkspaceLeaf, plugin: SanctumPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText() {
    return 'Sanctum Chat';
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('sanctum-chat-layout');

    const header = container.createEl('div', { cls: 'sanctum-chat-header' });
    header.createEl('h3', { text: 'Sanctum Chat' });

    this.agentSelect = header.createEl('select', { cls: 'sanctum-agent-select' });
    this.agentSelect.createEl('option', { value: 'workflow', text: '⚡ Multi-Agent Workflow' });

    this.chatContainer = container.createEl('div', { cls: 'sanctum-chat-history' });
    this.renderMessages();

    const inputArea = container.createEl('div', { cls: 'sanctum-chat-input-area' });
    this.inputBox = inputArea.createEl('textarea', { cls: 'sanctum-chat-input' });
    this.inputBox.placeholder = 'Type your prompt or /slash command...';

    this.inputBox.addEventListener('input', () => {
      this.inputBox.style.height = 'auto';
      this.inputBox.style.height = (this.inputBox.scrollHeight) + 'px';
    });

    this.inputBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    const sendBtn = inputArea.createEl('button', { text: 'Send', cls: 'sanctum-chat-send-btn mod-cta' });
    sendBtn.addEventListener('click', () => this.handleSend());
  }

  addMessage(role: 'user' | 'agent' | 'system', content: string) {
    this.messages.push({ role, content });
    this.renderMessages();
  }

  renderMessages() {
    this.chatContainer.empty();

    for (const msg of this.messages) {
      const msgWrapper = this.chatContainer.createEl('div', {
        cls: `sanctum-message-wrapper sanctum-message-${msg.role}`
      });

      const msgBubble = msgWrapper.createEl('div', { cls: 'sanctum-message-bubble' });
      const paragraphs = msg.content.split('\n');
      paragraphs.forEach(p => {
        msgBubble.createEl('p', { text: p });
      });
    }

    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  async handleSend() {
    const prompt = this.inputBox.value.trim();
    if (!prompt) return;

    this.inputBox.value = '';
    this.inputBox.style.height = 'auto';
    this.addMessage('user', prompt);
    this.addMessage('system', 'Ejecutando workflow, por favor espera...');

    const serverUrl = this.plugin.getServerUrl();

    try {
      const res = await fetch(`${serverUrl}/api/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();

      this.messages = this.messages.filter(m => m.role !== 'system');

      if (data.success) {
        const logLines = (data.logs || []).slice(-10).join('\n');
        this.addMessage('agent', `✅ Workflow finalizado con éxito.\n\nÚltimos logs:\n${logLines}`);
      } else {
        this.addMessage('agent', `❌ Error en el workflow.\n\n${data.error || 'Error desconocido'}`);
      }
    } catch (err) {
      this.messages = this.messages.filter(m => m.role !== 'system');
      this.addMessage('agent', `❌ Error de conexión: ${err}`);
    }
  }

  async onClose() {}
}
