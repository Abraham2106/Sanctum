import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type SanctumAgentsPlugin from '../../main';
import { NoteChatView, VIEW_TYPE_CHAT } from './NoteChatView';
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
    containerEl.style.cssText = 'padding:8px;font-family:sans-serif;';

    containerEl.createEl('h3', { text: 'Chat History' });
    containerEl.createEl('div', { text: 'Conversaciones guardadas automáticamente.', cls: 'sanctum-empty' });

    const chats = await this.plugin.chatStorage.list();
    if (chats.length === 0) {
      containerEl.createEl('p', { text: 'No hay chats guardados aún.', cls: 'sanctum-empty' });
      return;
    }

    for (const chat of chats) {
      const card = containerEl.createEl('div');
      card.style.cssText = 'background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:8px;margin:6px 0;font-size:13px;';

      card.createEl('div', { text: this.agentName(chat.agentId), style: 'font-weight:600;' });

      if (chat.notePath) {
        card.createEl('div', { text: chat.notePath, style: 'font-size:11px;color:#666;' });
      }

      const meta = card.createEl('div', { style: 'font-size:11px;color:#999;margin:2px 0 6px;' });
      meta.textContent = `${chat.messageCount} mensajes · ${this.formatDate(chat.updatedAt)}`;

      const btnRow = card.createEl('div', { style: 'display:flex;gap:4px;' });

      const loadBtn = btnRow.createEl('button', { text: 'Load' });
      loadBtn.style.cssText = 'padding:3px 8px;font-size:11px;background:#0066cc;color:#fff;border:none;border-radius:3px;cursor:pointer;';
      loadBtn.onclick = () => this.loadChat(chat);

      const delBtn = btnRow.createEl('button', { text: 'Delete' });
      delBtn.style.cssText = 'padding:3px 8px;font-size:11px;background:#ccc;color:#000;border:none;border-radius:3px;cursor:pointer;';
      delBtn.onclick = async () => {
        await this.plugin.chatStorage.delete(chat.agentId, chat.notePath);
        new Notice('Chat deleted');
        this.render();
      };
    }
  }

  private async loadChat(chat: ChatSummary) {
    await this.plugin.loadChatSession(chat.agentId, chat.notePath);
  }

  private agentName(id: string): string {
    return id || 'unknown';
  }

  private formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `hace ${days}d`;
  }
}
