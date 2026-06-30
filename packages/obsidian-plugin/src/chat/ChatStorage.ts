import { App } from 'obsidian';
import { ChatMessage } from '../types';

const CHATS_FILE = '.sanctum_chats.json';

export interface ChatSummary {
  id: string;
  sessionId: string;
  agentId: string;
  notePath: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface StoredChat {
  sessionId: string;
  agentId: string;
  notePath: string;
  history: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

interface StoreData {
  chats: StoredChat[];
}

export class ChatStorage {
  constructor(private app: App) {}

  /** Guarda o actualiza una sesión */
  async save(agentId: string, notePath: string, sessionId: string, history: ChatMessage[]): Promise<void> {
    try {
      const data = await this.readStore();
      const chat: StoredChat = {
        sessionId,
        agentId,
        notePath: notePath || '',
        history,
        createdAt: '',
        updatedAt: new Date().toISOString(),
      };
      const idx = data.chats.findIndex(c => c.sessionId === sessionId && c.agentId === agentId && c.notePath === (notePath || ''));
      if (idx >= 0) {
        chat.createdAt = data.chats[idx].createdAt;
        data.chats[idx] = chat;
      } else {
        chat.createdAt = new Date().toISOString();
        data.chats.push(chat);
      }
      await this.writeStore(data);
      console.log('[ChatStorage] saved:', agentId, notePath, sessionId, history.length, 'msgs');
    } catch (err) {
      console.error('[ChatStorage] save error:', err);
    }
  }

  /** Carga UNA sesión específica */
  async load(agentId: string, notePath: string, sessionId: string): Promise<ChatMessage[]> {
    try {
      const data = await this.readStore();
      const found = data.chats.find(c => c.sessionId === sessionId && c.agentId === agentId && c.notePath === (notePath || ''));
      return found?.history || [];
    } catch {
      return [];
    }
  }

  /** Encuentra la sesión más reciente para un agente+nota */
  async findLatestSession(agentId: string, notePath: string): Promise<{ sessionId: string; history: ChatMessage[] } | null> {
    try {
      const data = await this.readStore();
      const sessions = data.chats
        .filter(c => c.agentId === agentId && c.notePath === (notePath || ''))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      if (sessions.length === 0) return null;
      return { sessionId: sessions[0].sessionId, history: sessions[0].history };
    } catch {
      return null;
    }
  }

  /** Lista todas las sesiones */
  async list(): Promise<ChatSummary[]> {
    try {
      const data = await this.readStore();
      return data.chats
        .map(c => ({
          id: c.sessionId,
          sessionId: c.sessionId,
          agentId: c.agentId,
          notePath: c.notePath || '',
          messageCount: c.history?.length || 0,
          createdAt: c.createdAt || '',
          updatedAt: c.updatedAt || '',
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  /** Elimina una sesión específica */
  async delete(agentId: string, notePath: string, sessionId: string): Promise<void> {
    try {
      const data = await this.readStore();
      data.chats = data.chats.filter(c => !(c.sessionId === sessionId && c.agentId === agentId && c.notePath === (notePath || '')));
      await this.writeStore(data);
    } catch (err) {
      console.error('[ChatStorage] delete error:', err);
    }
  }

  private async readStore(): Promise<StoreData> {
    const adapter = this.app.vault.adapter;
    if (!adapter) return { chats: [] };
    try {
      const exists = await adapter.exists(CHATS_FILE);
      if (!exists) return { chats: [] };
      const raw = await adapter.read(CHATS_FILE);
      const parsed = JSON.parse(raw);
      // Migrar formato viejo (objeto) a nuevo (array)
      if (parsed.chats && !Array.isArray(parsed.chats)) {
        const arr: StoredChat[] = Object.values(parsed.chats);
        const migrated: StoreData = { chats: arr };
        await adapter.write(CHATS_FILE, JSON.stringify(migrated, null, 1));
        return migrated;
      }
      return parsed as StoreData;
    } catch {
      return { chats: [] };
    }
  }

  private async writeStore(data: StoreData): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (adapter) {
      await adapter.write(CHATS_FILE, JSON.stringify(data, null, 1));
    }
  }
}
