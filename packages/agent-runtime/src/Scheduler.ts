import * as fs from "fs/promises";
import * as path from "path";
import { loadAgentConfig } from "./loadAgentConfig.js";
import { AgentRunner } from "./AgentRunner.js";
import { Logger } from "./Logger.js";

export interface ScheduledJob {
  agentId: string;
  agentPath: string;
  cronExpression: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/**
 * Simple scheduler that runs agents on a cron-like interval.
 * Parses simplified cron: minutes-based or daily fixed time.
 */
export class Scheduler {
  private jobs: ScheduledJob[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  async loadJobs(): Promise<void> {
    const schedulePath = path.join(this.vaultPath, "Agents", "_schedule.json");
    try {
      const raw = await fs.readFile(schedulePath, "utf-8");
      const parsed = JSON.parse(raw) as { jobs: ScheduledJob[] };
      this.jobs = parsed.jobs || [];
      console.log(`[Scheduler] ${this.jobs.length} jobs cargados`);
    } catch {
      console.log("[Scheduler] No schedule file found, creating default");
      this.jobs = [];
      await this.saveJobs();
    }
  }

  async addJob(job: ScheduledJob): Promise<void> {
    this.jobs.push(job);
    await this.saveJobs();
    this.scheduleJob(job);
  }

  async removeJob(agentId: string): Promise<void> {
    this.jobs = this.jobs.filter((j) => j.agentId !== agentId);
    await this.saveJobs();
  }

  start(): void {
    this.jobs.forEach((job) => this.scheduleJob(job));
    console.log(`[Scheduler] Iniciado con ${this.jobs.length} jobs`);
  }

  stop(): void {
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    console.log("[Scheduler] Detenido");
  }

  private scheduleJob(job: ScheduledJob): void {
    const ms = this.parseInterval(job.cronExpression);
    if (ms <= 0) {
      console.warn(`[Scheduler] Invalid cron for ${job.agentId}: ${job.cronExpression}`);
      return;
    }

    console.log(`[Scheduler] Job '${job.agentId}' cada ${ms / 60000}min`);
    const timer = setInterval(async () => {
      await this.runJob(job);
    }, ms);
    this.timers.push(timer);
  }

  private async runJob(job: ScheduledJob): Promise<void> {
    const start = Date.now();
    console.log(`[Scheduler] Running ${job.agentId}...`);
    try {
      const runner = new AgentRunner();
      await runner.run({
        agentPath: job.agentPath,
        vaultPath: this.vaultPath,
        parameters: job.parameters ?? {},
      });
      const elapsed = Date.now() - start;
      console.log(`[Scheduler] ${job.agentId} completado (${elapsed}ms)`);
    } catch (err) {
      console.error(`[Scheduler] ${job.agentId} falló:`, err);
    }
  }

  private parseInterval(cron: string): number {
    // Support "*/N * * * *" for every N minutes
    const everyN = cron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
    if (everyN) {
      return parseInt(everyN[1], 10) * 60 * 1000;
    }
    // Support "HH:MM" for daily at fixed time
    const fixed = cron.match(/^(\d{1,2}):(\d{2})$/);
    if (fixed) {
      const now = new Date();
      const target = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        parseInt(fixed[1], 10),
        parseInt(fixed[2], 10)
      );
      let ms = target.getTime() - now.getTime();
      if (ms < 0) ms += 24 * 60 * 60 * 1000; // Tomorrow
      // Return a 24h interval after first run
      return ms > 0 ? ms : 24 * 60 * 60 * 1000;
    }
    return -1;
  }

  private async saveJobs(): Promise<void> {
    const dir = path.join(this.vaultPath, "Agents");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "_schedule.json"),
      JSON.stringify({ jobs: this.jobs }, null, 2),
      "utf-8"
    );
  }
}
