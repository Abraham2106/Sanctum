import { describe, it, expect, beforeEach } from "vitest";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
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

/**
 * Retorna una implementación mock de ChatStorage que usa un objeto en memoria
 * en lugar del vault adapter de Obsidian.
 */
function createMockChatStorage() {
  let data: StoreData = { chats: [] };

  return {
    async save(
      agentId: string,
      notePath: string,
      sessionId: string,
      history: ChatMessage[]
    ): Promise<void> {
      const chat: StoredChat = {
        sessionId,
        agentId,
        notePath: notePath || "",
        history,
        createdAt: "",
        updatedAt: new Date().toISOString(),
      };
      const idx = data.chats.findIndex(
        (c) =>
          c.sessionId === sessionId &&
          c.agentId === agentId &&
          c.notePath === (notePath || "")
      );
      if (idx >= 0) {
        chat.createdAt = data.chats[idx].createdAt;
        data.chats[idx] = chat;
      } else {
        chat.createdAt = new Date().toISOString();
        data.chats.push(chat);
      }
    },

    async load(
      agentId: string,
      notePath: string,
      sessionId: string
    ): Promise<ChatMessage[]> {
      const found = data.chats.find(
        (c) =>
          c.sessionId === sessionId &&
          c.agentId === agentId &&
          c.notePath === (notePath || "")
      );
      return found?.history || [];
    },

    async findLatestSession(
      agentId: string,
      notePath: string
    ): Promise<{ sessionId: string; history: ChatMessage[] } | null> {
      const sessions = data.chats
        .filter(
          (c) =>
            c.agentId === agentId && c.notePath === (notePath || "")
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      if (sessions.length === 0) return null;
      return {
        sessionId: sessions[0].sessionId,
        history: sessions[0].history,
      };
    },

    async list(): Promise<
      Array<{
        id: string;
        sessionId: string;
        agentId: string;
        notePath: string;
        messageCount: number;
        createdAt: string;
        updatedAt: string;
      }>
    > {
      return data.chats
        .map((c) => ({
          id: c.sessionId,
          sessionId: c.sessionId,
          agentId: c.agentId,
          notePath: c.notePath || "",
          messageCount: c.history?.length || 0,
          createdAt: c.createdAt || "",
          updatedAt: c.updatedAt || "",
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async delete(
      agentId: string,
      notePath: string,
      sessionId: string
    ): Promise<void> {
      data.chats = data.chats.filter(
        (c) =>
          !(
            c.sessionId === sessionId &&
            c.agentId === agentId &&
            c.notePath === (notePath || "")
          )
      );
    },

    _getData(): StoreData {
      return data;
    },
  };
}

describe("ChatStorage", () => {
  let storage: ReturnType<typeof createMockChatStorage>;

  beforeEach(() => {
    storage = createMockChatStorage();
  });

  it("saves and loads a chat session", async () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    await storage.save("agent-1", "note.md", "session-1", messages);
    const loaded = await storage.load("agent-1", "note.md", "session-1");
    expect(loaded).toHaveLength(2);
    expect(loaded[0].content).toBe("hello");
  });

  it("returns empty array for non-existent session", async () => {
    const loaded = await storage.load("nonexistent", "", "no-session");
    expect(loaded).toEqual([]);
  });

  it("finds the latest session", async () => {
    await storage.save("agent-1", "note.md", "session-old", [
      { role: "user", content: "old" },
    ]);
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 5));
    await storage.save("agent-1", "note.md", "session-new", [
      { role: "user", content: "new" },
    ]);
    const latest = await storage.findLatestSession("agent-1", "note.md");
    expect(latest).not.toBeNull();
    expect(latest!.sessionId).toBe("session-new");
  });

  it("returns null when no sessions exist", async () => {
    const latest = await storage.findLatestSession("agent-1", "note.md");
    expect(latest).toBeNull();
  });

  it("deletes a specific session", async () => {
    await storage.save("agent-1", "note.md", "session-1", [
      { role: "user", content: "a" },
    ]);
    await storage.save("agent-1", "note.md", "session-2", [
      { role: "user", content: "b" },
    ]);
    await storage.delete("agent-1", "note.md", "session-1");
    const list = await storage.list();
    expect(list).toHaveLength(1);
    expect(list[0].sessionId).toBe("session-2");
  });

  it("lists sessions sorted by updatedAt descending", async () => {
    await storage.save("agent-1", "note.md", "session-a", [
      { role: "user", content: "a" },
    ]);
    await new Promise((r) => setTimeout(r, 5));
    await storage.save("agent-1", "note.md", "session-b", [
      { role: "user", content: "b" },
    ]);
    const list = await storage.list();
    expect(list).toHaveLength(2);
    expect(list[0].sessionId).toBe("session-b");
  });

  it("distinguishes sessions by agent and note path", async () => {
    await storage.save("agent-1", "note-a.md", "session-1", [
      { role: "user", content: "hello" },
    ]);
    await storage.save("agent-2", "note-a.md", "session-1", [
      { role: "user", content: "world" },
    ]);
    const loaded1 = await storage.load("agent-1", "note-a.md", "session-1");
    const loaded2 = await storage.load("agent-2", "note-a.md", "session-1");
    expect(loaded1[0].content).toBe("hello");
    expect(loaded2[0].content).toBe("world");
  });
});
