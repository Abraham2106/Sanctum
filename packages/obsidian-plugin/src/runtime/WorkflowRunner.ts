import { Notice } from 'obsidian';
import type SanctumAgentsPlugin from '../../main';
import { AgentConfig, AgentResult } from '../types';

const MAX_CHAIN_DEPTH = 10;

export interface ChainStepResult {
  agent: AgentConfig;
  result: AgentResult;
  depth: number;
}

interface ChainCtx {
  topic: string;
  folderName: string;
  prevAgentName: string;
  prevActions: string;
  createdFiles: string[];
}

export class WorkflowRunner {
  private plugin: SanctumAgentsPlugin;

  constructor(plugin: SanctumAgentsPlugin) {
    this.plugin = plugin;
  }

  async runChain(startAgent: AgentConfig, userInput?: string): Promise<ChainStepResult[]> {
    const steps: ChainStepResult[] = [];
    const visited = new Set<string>();
    let current: AgentConfig | null = startAgent;
    let depth = 0;

    const topic = (userInput || '').trim();
    const folderName = this.sanitizeFolderName(topic || 'untitled-research');
    const ctx: ChainCtx = {
      topic,
      folderName,
      prevAgentName: '',
      prevActions: '',
      createdFiles: [],
    };

    while (current && depth < MAX_CHAIN_DEPTH) {
      if (visited.has(current.id)) {
        new Notice(`Cycle detected at "${current.name}". Chain stopped.`);
        break;
      }
      visited.add(current.id);

      const chainContext = this.buildChainContext(ctx, steps, current);
      const result = await this.plugin.runner.run(current, topic ? topic : undefined, chainContext);

      steps.push({ agent: current, result, depth });

      ctx.prevAgentName = current.name;
      ctx.prevActions = result.actions
        .map(a => `- ${a.tool}/${a.op} ${JSON.stringify(a.args)}`)
        .join('\n');
      // Track files created by vault_write actions
      for (const a of result.actions) {
        if (a.tool === 'vault' && a.op === 'write_note' && a.args.path) {
          ctx.createdFiles.push(String(a.args.path));
        }
      }

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

  private buildChainContext(ctx: ChainCtx, steps: ChainStepResult[], nextAgent: AgentConfig): string | undefined {
    if (steps.length === 0) return undefined;

    const lines: string[] = [];
    lines.push(`## Chain Context`);
    lines.push(`**Research Topic:** ${ctx.topic || '(not specified)'}`);
    lines.push(`**Research Folder:** Research/${ctx.folderName}/`);
    lines.push(`**Previous Agent:** ${ctx.prevAgentName}`);
    lines.push(`**Current Agent:** ${nextAgent.name}`);
    lines.push('');

    if (ctx.createdFiles.length > 0) {
      lines.push('### Files Created So Far');
      for (const f of ctx.createdFiles) {
        lines.push(`- ${f}`);
      }
      lines.push('');
    }

    if (ctx.prevActions) {
      lines.push('### Actions Executed by Previous Agent');
      lines.push(ctx.prevActions);
      lines.push('');
    }

    lines.push('**Instructions:** Review what the previous agent created. Read the files in the Research folder before taking action. Use the folder name as the topic identifier.');

    return lines.join('\n');
  }

  private sanitizeFolderName(name: string): string {
    let clean = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return clean || 'untitled-research';
  }
}
