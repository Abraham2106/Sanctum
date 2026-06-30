import * as fs from "fs/promises";
import * as path from "path";

export interface LogEntry {
  timestamp: string;
  agentName: string;
  agentId: string;
  model: string;
  phase: string;
  message: string;
  details?: Record<string, unknown> | undefined;
  tokensUsed?: number;
  actionsCount?: number;
  dryRun?: boolean;
  durationMs?: number;
}

export class Logger {
  vaultPath: string;
  agentName: string;
  agentId: string;
  model: string;
  private startTime: number;
  private tokenCount = 0;

  constructor(vaultPath: string, agentName: string, agentId: string, model: string) {
    this.vaultPath = vaultPath;
    this.agentName = agentName;
    this.agentId = agentId;
    this.model = model;
    this.startTime = Date.now();
  }

  async log(phase: string, message: string, details?: Record<string, unknown>): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      agentName: this.agentName,
      agentId: this.agentId,
      model: this.model,
      phase,
      message,
      details: details ?? undefined,
    };
    await this.appendToFile(entry);
  }

  async logTokens(count: number): Promise<void> {
    this.tokenCount += count;
  }

  async finalize(
    success: boolean,
    actionsCount: number,
    dryRun?: boolean,
  ): Promise<void> {
    const durationMs = Date.now() - this.startTime;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      agentName: this.agentName,
      agentId: this.agentId,
      model: this.model,
      phase: success ? "completed" : "failed",
      message: success
        ? `Ejecución ${dryRun ? "(dry-run) " : ""}completada`
        : "Ejecución fallida",
      details: {
        success,
        durationMs,
        tokensTotal: this.tokenCount,
        actionsCount,
        dryRun: !!dryRun,
      },
      durationMs,
      tokensUsed: this.tokenCount,
      actionsCount,
      dryRun: !!dryRun,
    };
    await this.appendToFile(entry);
  }

  private async appendToFile(entry: LogEntry): Promise<void> {
    const date = new Date().toISOString().split("T")[0];
    const logDir = path.join(this.vaultPath, "Agents", "_logs");
    await fs.mkdir(logDir, { recursive: true });
    const logFile = path.join(logDir, `${date}.md`);
    const line = `- \`${entry.timestamp}\` **${entry.phase}** — ${entry.message}${entry.details ? " `" + JSON.stringify(entry.details) + "`" : ""}\n`;
    await fs.appendFile(logFile, line, "utf-8");
  }
}
