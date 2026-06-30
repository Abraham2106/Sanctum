import { Notice } from 'obsidian';
import type SanctumAgentsPlugin from '../../main';
import { AgentConfig, AgentResult } from '../types';

const MAX_CHAIN_DEPTH = 10;

export interface ChainStepResult {
  agent: AgentConfig;
  result: AgentResult;
  depth: number;
}

export class WorkflowRunner {
  private plugin: SanctumAgentsPlugin;

  constructor(plugin: SanctumAgentsPlugin) {
    this.plugin = plugin;
  }

  /**
   * Runs an agent chain starting from the given agent.
   * Follows chain_next links until the chain ends or MAX_CHAIN_DEPTH is reached.
   */
  async runChain(startAgent: AgentConfig, userInput?: string): Promise<ChainStepResult[]> {
    const steps: ChainStepResult[] = [];
    const visited = new Set<string>();
    let current: AgentConfig | null = startAgent;
    let depth = 0;
    let prevActions = '';

    while (current && depth < MAX_CHAIN_DEPTH) {
      if (visited.has(current.id)) {
        new Notice(`Cycle detected at "${current.name}". Chain stopped.`);
        break;
      }
      visited.add(current.id);

      const chainContext = prevActions
        ? `Previous agent: "${steps[steps.length - 1].agent.name}" executed:\n${prevActions}`
        : undefined;

      const result = await this.plugin.runner.run(current, depth === 0 ? userInput : undefined, chainContext);

      steps.push({ agent: current, result, depth });

      prevActions = result.actions
        .map(a => `- ${a.tool}/${a.op} ${JSON.stringify(a.args)}`)
        .join('\n');

      if (!current.chain_next) break;

      const next = await this.plugin.store.get(current.chain_next);
      if (!next) {
        new Notice(`Chain: agent "${current.chain_next}" not found. Stopping at "${current.name}".`);
        break;
      }
      current = next;
      depth++;
    }

    if (depth >= MAX_CHAIN_DEPTH) {
      new Notice(`Chain reached max depth (${MAX_CHAIN_DEPTH}). Stopping.`);
    }

    return steps;
  }
}
