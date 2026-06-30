import * as fs from "fs";
import * as path from "path";

export interface MentionEvent {
  agentId: string;
  filePath: string;
  mentionText: string;
  timestamp: string;
}

export type MentionCallback = (event: MentionEvent) => Promise<void>;

/**
 * Watches the vault for @mentions of agents in markdown files.
 * Uses Node's built-in fs.watch for file change detection.
 */
export class MentionWatcher {
  private watcher: fs.FSWatcher | null = null;
  private vaultPath: string;
  private callback: MentionCallback;
  private knownAgents: string[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(vaultPath: string, callback: MentionCallback) {
    this.vaultPath = vaultPath;
    this.callback = callback;
  }

  setAgents(agentIds: string[]): void {
    this.knownAgents = agentIds;
  }

  start(): void {
    try {
      this.watcher = fs.watch(this.vaultPath, { recursive: true }, (_eventType: string, filename: string | null) => {
        if (!filename || !filename.endsWith(".md")) return;
        const fullPath = path.resolve(this.vaultPath, filename);
        this.debouncedCheck(fullPath);
      });
      console.log(`[MentionWatcher] Observando ${this.vaultPath}`);
    } catch (err) {
      console.error("[MentionWatcher] Error starting watcher:", err);
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
  }

  private debouncedCheck(filePath: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      filePath,
      setTimeout(async () => {
        this.debounceTimers.delete(filePath);
        await this.checkFile(filePath);
      }, 500)
    );
  }

  private async checkFile(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      for (const agentId of this.knownAgents) {
        const mentionRx = new RegExp(`@${escapeRegex(agentId)}`, "i");
        if (mentionRx.test(content)) {
          const event: MentionEvent = {
            agentId,
            filePath,
            mentionText: `@${agentId}`,
            timestamp: new Date().toISOString(),
          };
          await this.callback(event);
        }
      }
    } catch {
      // Ignore file read errors
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
