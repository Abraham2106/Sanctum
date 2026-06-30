import { App, Notice } from 'obsidian';
import { AgentConfig, AgentAction, AgentResult, ChatMessage } from '../types';
import { ContextCollector } from '../context/ContextCollector';
import { PromptBuilder } from '../prompt/PromptBuilder';
import { LLMClient } from '../llm/LLMClient';
import { ActionExecutor } from '../actions/ActionExecutor';
import { MCPClient } from '../mcp/MCPClient';
import { TopicExtractor } from '../context/TopicExtractor';

export interface AgentRunnerConfig {
  proxyUrl: string;
  mcpCommand: string;
  mcpToken: string;
  autoTag: boolean;
  maxTopicsPerNote: number;
}

export class AgentRunner {
  private contextCollector: ContextCollector;
  private promptBuilder: PromptBuilder;
  private llmClient: LLMClient;
  private actionExecutor: ActionExecutor;
  private mcp: MCPClient;
  private topicExtractor: TopicExtractor;
  private config: AgentRunnerConfig;

  constructor(app: App, config: AgentRunnerConfig) {
    this.config = config;
    this.mcp = new MCPClient();
    this.contextCollector = new ContextCollector(app);
    this.promptBuilder = new PromptBuilder();
    this.llmClient = new LLMClient(config.proxyUrl);
    this.topicExtractor = new TopicExtractor(this.llmClient);
    this.actionExecutor = new ActionExecutor(app, this.mcp, this.topicExtractor, config.autoTag, config.maxTopicsPerNote);
  }

  updateConfig(config: Partial<AgentRunnerConfig>): void {
    Object.assign(this.config, config);
    this.llmClient.updateConfig(this.config.proxyUrl);
    this.actionExecutor['autoTag'] = this.config.autoTag;
    this.actionExecutor['maxTopicsPerNote'] = this.config.maxTopicsPerNote;
  }

  async connectMCP(): Promise<void> {
    if (!this.config.mcpToken) {
      new Notice('Sanctum: Set GitHub token in settings to use MCP');
      return;
    }
    try {
      await this.mcp.connect(this.config.mcpCommand, this.config.mcpToken);
      new Notice('Sanctum MCP connected');
    } catch (err) {
      new Notice('Sanctum MCP connection failed');
      console.error('[Sanctum] MCP connect error:', err);
    }
  }

  async disconnectMCP(): Promise<void> {
    await this.mcp.disconnect();
  }

  get mcpConnected(): boolean {
    return this.mcp.connected;
  }

  async run(agent: AgentConfig, userInput?: string): Promise<AgentResult> {
    console.log(`[Sanctum] Running agent: ${agent.name}`);

    const notes = await this.contextCollector.collect(agent);
    console.log(`[Sanctum] Context: ${notes.length} notes`);

    const messages = this.promptBuilder.build(agent, notes, userInput);
    const result = await this.llmClient.complete(messages, agent.model);

    console.log(`[Sanctum] Result (${result.tokens} tokens):`);
    console.log(`  reasoning: ${result.reasoning}`);
    console.log(`  actions: ${result.actions.length}`);
    for (const a of result.actions) {
      console.log(`    → ${a.tool}/${a.op}`, a.args);
    }

    await this.actionExecutor.execute(result.actions);
    return result;
  }

  async runChat(agent: AgentConfig, history: ChatMessage[], userInput: string): Promise<string> {
    const notes = await this.contextCollector.collect(agent);
    const messages = this.promptBuilder.buildChatPrompt(agent, notes, history, userInput);
    const response = await this.llmClient.completeRaw(messages, agent.model);
    console.log(`[Sanctum] Chat response (${response.length} chars)`);

    // Extraer y ejecutar bloques ACTION: {json}
    const actions = extractActionsFromText(response);
    let feedback = '';
    if (actions.length > 0) {
      console.log(`[Sanctum] Executing ${actions.length} chat actions...`);
      await this.actionExecutor.execute(actions);
      feedback = actions.map(a => {
        if (a.tool === 'vault' && a.op === 'create_folder') return `✅ Carpeta creada: ${a.args.path}`;
        if (a.tool === 'vault' && a.op === 'write_note') return `📝 Nota creada: ${a.args.path}`;
        return `✅ ${a.tool}/${a.op}`;
      }).join('\n');
    }

    // Limpiar la respuesta y agregar feedback
    const clean = removeActionBlocks(response);
    return clean ? `${clean}\n\n${feedback}` : (feedback || '(acciones ejecutadas)');
  }
}

/**
 * Encuentra y extrae bloques "ACTION: {json}" del texto, manejando
 * llaves anidadas correctamente.
 */
function extractActionsFromText(text: string): AgentAction[] {
  const results: AgentAction[] = [];
  const rx = /ACTION:\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = rx.exec(text)) !== null) {
    const start = match.index + match[0].length - 1; // posición de la primera "{"
    let depth = 1;
    let i = start + 1;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) continue; // llaves sin cerrar

    const jsonStr = text.slice(start, i);
    try {
      const action = JSON.parse(jsonStr) as AgentAction;
      if (action && action.tool && action.op) {
        results.push(action);
      }
    } catch {
      // JSON inválido, ignorar
    }
  }
  return results;
}

/** Elimina los bloques ACTION del texto manejando llaves anidadas */
function removeActionBlocks(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const match = text.slice(i).match(/^ACTION:\s*\{/);
    if (match) {
      const start = i + match[0].length - 1;
      let depth = 1;
      let j = start + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      i = j; // saltar todo el bloque ACTION
    } else {
      result += text[i];
      i++;
    }
  }
  return result.trim();
}
