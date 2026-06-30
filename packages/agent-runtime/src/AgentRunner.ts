import { loadAgentConfig } from "./loadAgentConfig.js";
import { collectContext } from "./collectContext.js";
import { PromptBuilder } from "./PromptBuilder.js";
import { callModel } from "./callModel.js";
import { ExecutorRegistry } from "./executors/ActionExecutor.js";
import { AgentInvocation, ContextFragment } from "./types.js";
import { Logger } from "./Logger.js";

export interface AgentRunnerOptions {
  agentPath: string;
  vaultPath: string;
  noContext?: boolean;
  dryRun?: boolean;
  parameters?: Record<string, any>;
}

export class AgentRunner {
  public async run(options: AgentRunnerOptions): Promise<import("./types.js").AgentAction[]> {
    const logger = new Logger(
      options.vaultPath,
      "unknown",
      "unknown",
      "unknown"
    );

    const definition = await loadAgentConfig(options.agentPath);
    logger.agentName = definition.name;
    logger.agentId = definition.name.toLowerCase().replace(/\s+/g, "-");
    logger.model = definition.model;

    await logger.log("config", `Configuración de '${definition.name}' cargada`);

    let contextFragments: ContextFragment[] = [];
    let contextString = "";

    if (options.noContext) {
      await logger.log("context", "Contexto desactivado — se omite recolección");
    } else {
      const contextResult = await collectContext(definition, options.vaultPath, options.parameters);
      contextFragments = contextResult.fragments;
      contextString = contextResult.contextString;
      await logger.log("context", `Se recolectaron ${contextFragments.length} notas del vault`, {
        count: contextFragments.length,
      });
      if (contextFragments.length === 0) {
        await logger.log("context", "ADVERTENCIA: No se encontró contexto elegible");
      }
    }

    const invocation: AgentInvocation = {
      definition,
      vaultPath: options.vaultPath,
      noContext: !!options.noContext,
      parameters: options.parameters ?? {},
      contextFragments,
      contextString
    };

    const { systemPrompt, userMessage } = PromptBuilder.build(invocation);
    await logger.log("prompt", "Prompt construido", {
      systemLength: systemPrompt.length,
      userLength: userMessage.length,
    });

    const response = await callModel(definition.model, systemPrompt, userMessage);
    await logger.logTokens(response.usage?.totalTokens ?? 0);
    await logger.log("model", "Modelo respondió", {
      reasoning: response.reasoning,
      actionCount: response.actions.length,
      tokensUsed: response.usage?.totalTokens,
    });

    const activeActions = response.actions.filter((a) => a.type !== "none");
    const limit = definition.max_actions ?? activeActions.length;
    const actionsToExecute = activeActions.slice(0, limit);

    if (options.dryRun) {
      await logger.log("dry-run", "DRY RUN — acciones NO ejecutadas", {
        proposedActions: response.actions,
        wouldExecute: actionsToExecute.map((a) => ({ type: a.type, ...("title" in a ? { title: a.title } : {}) })),
      });
      await logger.finalize(true, 0, true);
      return response.actions;
    }

    const registry = new ExecutorRegistry();
    await registry.executeAll(response.actions, {
      vaultPath: options.vaultPath,
      definition,
    });

    await logger.log("execute", `${actionsToExecute.length} acciones ejecutadas`, {
      executedCount: actionsToExecute.length,
    });
    await logger.finalize(true, actionsToExecute.length);

    return response.actions;
  }
}
