import type SanctumAgentsPlugin from '../../main';
import { AgentConfig } from '../types';

interface ActiveJob {
  agentId: string;
  agent: AgentConfig;
  timer: ReturnType<typeof setInterval>;
}

export class SchedulerManager {
  private plugin: SanctumAgentsPlugin;
  private jobs: ActiveJob[] = [];

  constructor(plugin: SanctumAgentsPlugin) {
    this.plugin = plugin;
  }

  async start(): Promise<void> {
    const agents = await this.plugin.store.list();
    for (const agent of agents) {
      if (!agent.schedule?.enabled) continue;
      this.scheduleAgent(agent);
    }
    console.log(`[SchedulerManager] Started with ${this.jobs.length} scheduled agent(s)`);
  }

  stop(): void {
    for (const job of this.jobs) {
      clearInterval(job.timer);
    }
    this.jobs = [];
    console.log('[SchedulerManager] Stopped');
  }

  async refresh(): Promise<void> {
    this.stop();
    await this.start();
  }

  private scheduleAgent(agent: AgentConfig): void {
    const ms = this.parseInterval(agent);
    if (ms <= 0) {
      console.warn(`[SchedulerManager] ${agent.name}: invalid schedule`);
      return;
    }

    const timer = setInterval(async () => {
      try {
        console.log(`[SchedulerManager] Running scheduled: ${agent.name}`);
        await this.plugin.runner.run(agent);
        console.log(`[SchedulerManager] ${agent.name} completed`);
      } catch (err) {
        console.error(`[SchedulerManager] ${agent.name} failed:`, err);
      }
    }, ms);

    this.jobs.push({ agentId: agent.id, agent, timer });
    console.log(`[SchedulerManager] ${agent.name}: every ${Math.round(ms / 60000)}min`);
  }

  private parseInterval(agent: AgentConfig): number {
    const s = agent.schedule;
    if (!s?.enabled) return -1;

    if (s.intervalMinutes && s.intervalMinutes > 0) {
      return s.intervalMinutes * 60 * 1000;
    }

    if (s.dailyAt) {
      const now = new Date();
      const [h, m] = s.dailyAt.split(':').map(Number);
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
      let ms = target.getTime() - now.getTime();
      if (ms < 0) ms += 24 * 60 * 60 * 1000;
      return ms;
    }

    return -1;
  }
}
