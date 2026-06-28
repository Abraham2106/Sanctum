import { loadAgentConfig } from "./loadAgentConfig.js";
import { collectContext } from "./collectContext.js";
import { PromptBuilder } from "./PromptBuilder.js";
import { callModel } from "./callModel.js";
import { ExecutorRegistry } from "./executors/ActionExecutor.js";
import { AgentInvocation, ContextFragment } from "./types.js";

export interface AgentRunnerOptions {
  agentPath: string;
  vaultPath: string;
  noContext?: boolean;
  parameters?: Record<string, any>;
}

export class AgentRunner {
  public async run(options: AgentRunnerOptions): Promise<import("./types.js").AgentAction[]> {
    // 1. Cargar configuración estática (AgentDefinition es idéntico a AgentConfig)
    console.log("[Paso 1/5] Cargando configuración...");
    const definition = await loadAgentConfig(options.agentPath);
    console.log(`Configuración de '${definition.name}' cargada con éxito.\n`);

    // 2. Recolectar contexto
    console.log("[Paso 2/5] Recolectando contexto...");
    let contextFragments: ContextFragment[] = [];
    let contextString = "";

    if (options.noContext) {
      console.log("Contexto desactivado — se omite la recolección de notas.\n");
    } else {
      const contextResult = await collectContext(definition, options.vaultPath, options.parameters);
      contextFragments = contextResult.fragments;
      contextString = contextResult.contextString;
      console.log(`Se recolectaron ${contextFragments.length} notas del vault.`);
      if (contextFragments.length === 0) {
        console.warn("ADVERTENCIA: No se encontró ningún contexto elegible para este agente.");
      }
      console.log();
    }

    // 3. Crear invocación estructurada y Prompt
    console.log("[Paso 3/5] Construyendo prompt...");
    const invocation: AgentInvocation = {
      definition,
      vaultPath: options.vaultPath,
      noContext: !!options.noContext,
      parameters: options.parameters ?? {},
      contextFragments,
      contextString
    };

    const { systemPrompt, userMessage } = PromptBuilder.build(invocation);
    console.log("Prompt del sistema y mensaje del usuario preparados.\n");

    // 4. Invocación al modelo (Exactamente una sola llamada)
    console.log("[Paso 4/5] Invocando al modelo de lenguaje...");
    const response = await callModel(definition.model, systemPrompt, userMessage);

    console.log("\n--- Razonamiento del Agente ---");
    console.log(`1. Leer y Entender: ${response.reasoning.step1_read}`);
    console.log(`2. Identificar:     ${response.reasoning.step2_identify}`);
    console.log(`3. Decidir:         ${response.reasoning.step3_decide}`);
    console.log(`4. Ejecutar:        ${response.reasoning.step4_execute}`);
    console.log("-------------------------------\n");

    console.log("Acciones propuestas:");
    console.log(JSON.stringify(response.actions, null, 2));
    console.log();

    // 5. Despachar acciones al registry
    console.log("[Paso 5/5] Ejecutando acciones propuestas...");
    const registry = new ExecutorRegistry();
    await registry.executeAll(response.actions, {
      vaultPath: options.vaultPath,
      definition
    });

    return response.actions;
  }
}
