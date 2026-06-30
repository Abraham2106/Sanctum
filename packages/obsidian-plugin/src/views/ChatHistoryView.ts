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
    containerEl.style.cssText = 'padding:8px;font-family:sans-serif;';

    containerEl.createEl('h3', { text: 'Chat History' });
    containerEl.createEl('div', { text: 'Conversaciones guardadas automáticamente.' });

    const chats = await this.plugin.chatStorage.list();
    if (chats.length === 0) {
      containerEl.createEl('p', { text: 'No hay chats guardados aún.' });
      return;
    }

    for (const chat of chats) {
      const card = containerEl.createEl('div');
      card.style.cssText = 'background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:8px;margin:6px 0;font-size:13px;';

      const nameEl = card.createEl('div');
      nameEl.style.cssText = 'font-weight:600;';
      nameEl.textContent = chat.agentId;

      if (chat.notePath) {
        const pathEl = card.createEl('div');
        pathEl.style.cssText = 'font-size:11px;color:#666;';
        pathEl.textContent = chat.notePath;
      }

      const metaEl = card.createEl('div');
      metaEl.style.cssText = 'font-size:11px;color:#999;margin:2px 0 6px;';
      metaEl.textContent = `${chat.messageCount} mensajes · ${this.formatDate(chat.updatedAt)}`;

      const btnRow = card.createEl('div');
      btnRow.style.cssText = 'display:flex;gap:4px;';

      const loadBtn = btnRow.createEl('button', { text: 'Load' });
      loadBtn.style.cssText = 'padding:3px 8px;font-size:11px;background:#0066cc;color:#fff;border:none;border-radius:3px;cursor:pointer;';
      loadBtn.onclick = () => this.loadChat(chat);

      const delBtn = btnRow.createEl('button', { text: 'Delete' });
      delBtn.style.cssText = 'padding:3px 8px;font-size:11px;background:#ccc;color:#000;border:none;border-radius:3px;cursor:pointer;';
      delBtn.onclick = async () => {
        await this.plugin.chatStorage.delete(chat.agentId, chat.notePath);
        await this.render();
      };
    }
  }

  private async loadChat(chat: ChatSummary) {
    await this.plugin.loadChatSession(chat.agentId, chat.notePath);
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
