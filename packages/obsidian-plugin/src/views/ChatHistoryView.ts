import { ItemView, WorkspaceLeaf } from 'obsidian';
import type SanctumAgentsPlugin from '../../main';
import { ChatSummary } from '../chat/ChatStorage';

export const VIEW_TYPE_CHAT_HISTORY = 'sanctum-chat-history';

export class ChatHistoryView extends ItemView {
  private plugin: SanctumAgentsPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: SanctumAgentsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_CHAT_HISTORY; }
  getDisplayText(): string { return 'Chat History'; }
  getIcon(): string { return 'history'; }

  async onOpen() { await this.render(); }

  async render() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('sanctum-chat-history');

    containerEl.createEl('h3', { text: 'Chat History' });
    containerEl.createEl('p', { text: 'Todas las sesiones de chat guardadas.' });

    const chats = await this.plugin.chatStorage.list();
    if (chats.length === 0) {
      containerEl.createEl('p', { text: 'No hay sesiones guardadas aún.' });
      return;
    }

    // Agrupar por agente
    const grouped = new Map<string, ChatSummary[]>();
    for (const c of chats) {
      const g = grouped.get(c.agentId) || [];
      g.push(c);
      grouped.set(c.agentId, g);
    }

    for (const [agentId, sessions] of grouped) {
      const groupEl = containerEl.createEl('div');
      groupEl.addClass('sanctum-history-group');

      const groupTitle = groupEl.createEl('div', { text: agentId });
      groupTitle.addClass('sanctum-history-group-title');

      for (const s of sessions) {
        const card = containerEl.createEl('div');
        card.addClass('sanctum-history-card');

        if (s.notePath) {
          const pathEl = card.createEl('div');
          pathEl.addClass('sanctum-history-path');
          pathEl.textContent = s.notePath;
        }

        const meta = card.createEl('div');
        meta.addClass('sanctum-history-meta');
        meta.textContent = `${s.messageCount} msgs · ${this.fmtDate(s.updatedAt)} · ${this.fmtDateShort(s.createdAt)}`;

        const btnRow = card.createEl('div');
        btnRow.addClass('sanctum-history-actions');

        const loadBtn = btnRow.createEl('button', { text: 'Load' });
        loadBtn.addClass('sanctum-btn', 'sanctum-btn-primary');
        loadBtn.onclick = () => this.loadChat(s);

        const delBtn = btnRow.createEl('button', { text: 'Delete' });
        delBtn.addClass('sanctum-btn', 'sanctum-btn-danger');
        delBtn.onclick = async () => {
          await this.plugin.chatStorage.delete(s.agentId, s.notePath, s.sessionId);
          await this.render();
        };
      }
    }
  }

  private async loadChat(chat: ChatSummary) {
    await this.plugin.loadChatSession(chat.agentId, chat.notePath, chat.sessionId);
  }

  private fmtDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h}h`;
    return `hace ${Math.floor(h / 24)}d`;
  }

  private fmtDateShort(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString();
  }
}
