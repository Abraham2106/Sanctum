import { AgentRunner } from "./AgentRunner.js";
import path from "path";

export interface WorkflowOptions {
  vaultPath: string;
  prompt: string;
}

export class AgentWorkflow {
  public async runWorkflow(options: WorkflowOptions): Promise<void> {
    console.log("=================================================");
    console.log("INICIANDO WORKFLOW MULTI-AGENTE (Gen -> Ref -> Cur)");
    console.log(`Prompt: "${options.prompt}"`);
    console.log("=================================================\n");

    const runner = new AgentRunner();
    
    // Rutas a los agentes (asumiendo que están en {vaultPath}/Agents)
    const generatorPath = path.join(options.vaultPath, "Agents", "generator.md");
    const reflectorPath = path.join(options.vaultPath, "Agents", "reflector.md");
    const curatorPath = path.join(options.vaultPath, "Agents", "curator.md");

    // 1. Ejecutar Generator
    console.log("\n>>> PASO 1: Ejecutando Agente GENERATOR");
    const generatorActions = await runner.run({
      agentPath: generatorPath,
      vaultPath: options.vaultPath,
      parameters: {
        instruccion_usuario: options.prompt
      }
    });

    // 2. Ejecutar Reflector
    console.log("\n>>> PASO 2: Ejecutando Agente REFLECTOR");
    await runner.run({
      agentPath: reflectorPath,
      vaultPath: options.vaultPath,
      parameters: {
        prompt_original: options.prompt,
        acciones_ejecutadas: JSON.stringify(generatorActions, null, 2)
      }
    });

    // 3. Ejecutar Curator
    console.log("\n>>> PASO 3: Ejecutando Agente CURATOR");
    await runner.run({
      agentPath: curatorPath,
      vaultPath: options.vaultPath,
      parameters: {
        info: "Revisa las reflexiones recientes y actualiza los Playbooks."
      }
    });

    console.log("\n=================================================");
    console.log("WORKFLOW FINALIZADO CON ÉXITO");
    console.log("=================================================\n");
  }
}
