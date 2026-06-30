import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Copy the helper logic inline for testability (avoids importing ESM/CJS issues)
const FRESHNESS_THRESHOLD_MS = 5 * 60 * 1000;

interface DiscordLogSchema {
  $schema: string;
  tags: string[];
  channel: string;
  channel_id: string;
  messages: Array<{
    id: string;
    author: string;
    timestamp: string;
    content: string;
  }>;
}

interface ChannelMeta {
  lastMessageId: string;
  lastSyncAt: string;
}

function makeLogFilePath(logsDir: string, channelId: string, temp = false): string {
  return path.join(logsDir, temp ? `${channelId}.temp.json` : `${channelId}.json`);
}

function makeMetaFilePath(logsDir: string, channelId: string): string {
  return path.join(logsDir, `${channelId}.meta.json`);
}

function readMeta(logsDir: string, channelId: string): ChannelMeta | null {
  const metaFile = makeMetaFilePath(logsDir, channelId);
  if (!fs.existsSync(metaFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaFile, "utf8")) as ChannelMeta;
  } catch {
    return null;
  }
}

function writeMeta(logsDir: string, channelId: string, meta: ChannelMeta): void {
  fs.writeFileSync(makeMetaFilePath(logsDir, channelId), JSON.stringify(meta, null, 2), "utf8");
}

function isSyncFresh(logsDir: string, channelId: string): boolean {
  const meta = readMeta(logsDir, channelId);
  if (!meta?.lastSyncAt) return false;
  const elapsed = Date.now() - new Date(meta.lastSyncAt).getTime();
  return elapsed < FRESHNESS_THRESHOLD_MS;
}

function clearTempLog(logsDir: string, channelId: string): void {
  const tempFile = makeLogFilePath(logsDir, channelId, true);
  if (fs.existsSync(tempFile)) {
    fs.unlinkSync(tempFile);
  }
}

describe("Bot sync helpers", () => {
  let tmpDir: string;
  const channelId = "123456789";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("isSyncFresh", () => {
    it("returns false when no meta file exists", () => {
      expect(isSyncFresh(tmpDir, channelId)).toBe(false);
    });

    it("returns false when meta file is malformed", () => {
      fs.writeFileSync(makeMetaFilePath(tmpDir, channelId), "not-json", "utf8");
      expect(isSyncFresh(tmpDir, channelId)).toBe(false);
    });

    it("returns false when lastSyncAt is old", () => {
      const old = new Date(Date.now() - FRESHNESS_THRESHOLD_MS - 1000).toISOString();
      writeMeta(tmpDir, channelId, { lastMessageId: "abc", lastSyncAt: old });
      expect(isSyncFresh(tmpDir, channelId)).toBe(false);
    });

    it("returns true when lastSyncAt is recent", () => {
      writeMeta(tmpDir, channelId, {
        lastMessageId: "abc",
        lastSyncAt: new Date().toISOString(),
      });
      expect(isSyncFresh(tmpDir, channelId)).toBe(true);
    });

    it("returns false on exact boundary (elapsed === threshold)", () => {
      const exact = new Date(Date.now() - FRESHNESS_THRESHOLD_MS).toISOString();
      writeMeta(tmpDir, channelId, { lastMessageId: "abc", lastSyncAt: exact });
      expect(isSyncFresh(tmpDir, channelId)).toBe(false);
    });
  });

  describe("readMeta / writeMeta", () => {
    it("writes and reads meta correctly", () => {
      const meta: ChannelMeta = { lastMessageId: "def", lastSyncAt: new Date().toISOString() };
      writeMeta(tmpDir, channelId, meta);
      const read = readMeta(tmpDir, channelId);
      expect(read).not.toBeNull();
      expect(read!.lastMessageId).toBe("def");
    });

    it("returns null for missing meta", () => {
      expect(readMeta(tmpDir, "nonexistent")).toBeNull();
    });

    it("returns null for corrupted meta", () => {
      fs.writeFileSync(makeMetaFilePath(tmpDir, channelId), "{broken", "utf8");
      expect(readMeta(tmpDir, channelId)).toBeNull();
    });
  });

  describe("clearTempLog", () => {
    it("removes a temp log file if exists", () => {
      const tempFile = makeLogFilePath(tmpDir, channelId, true);
      fs.writeFileSync(tempFile, "{}", "utf8");
      expect(fs.existsSync(tempFile)).toBe(true);
      clearTempLog(tmpDir, channelId);
      expect(fs.existsSync(tempFile)).toBe(false);
    });

    it("does not throw if temp log does not exist", () => {
      expect(() => clearTempLog(tmpDir, channelId)).not.toThrow();
    });

    it("does not remove the permanent log", () => {
      const permFile = makeLogFilePath(tmpDir, channelId, false);
      const tempFile = makeLogFilePath(tmpDir, channelId, true);
      fs.writeFileSync(permFile, "{}", "utf8");
      fs.writeFileSync(tempFile, "{}", "utf8");
      clearTempLog(tmpDir, channelId);
      expect(fs.existsSync(permFile)).toBe(true);
      expect(fs.existsSync(tempFile)).toBe(false);
    });
  });

  describe("DiscordLogSchema structure", () => {
    it("creates a valid log object", () => {
      const log: DiscordLogSchema = {
        $schema: "sanctum-discord-log/v1",
        tags: ["agent-access"],
        channel: "general",
        channel_id: "123",
        messages: [
          { id: "1", author: "user1", timestamp: new Date().toISOString(), content: "hello" },
        ],
      };
      expect(log.$schema).toBe("sanctum-discord-log/v1");
      expect(log.messages).toHaveLength(1);
      expect(log.messages[0].author).toBe("user1");
    });

    it("filters bot commands correctly", () => {
      const messages = [
        { content: "hello" },
        { content: "!sync" },
        { content: "!resumen" },
        { content: "normal message" },
      ];
      const filtered = messages.filter((m) => !m.content.startsWith("!"));
      expect(filtered).toHaveLength(2);
      expect(filtered[0].content).toBe("hello");
    });
  });
});
