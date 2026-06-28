import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import { AgentRunner } from "./AgentRunner.js";
import { AgentWorkflow } from "./workflow.js";

// Configurar dotenv apuntando al .env en la raíz del monorepo
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
  const args = process.argv.slice(2);
  const agentIndex = args.indexOf("--agent");
  const workflowIndex = args.indexOf("--workflow");
  const noContext  = args.includes("--no-context");
  
  if (agentIndex === -1 && workflowIndex === -1) {
    console.error("ERROR: Debes proporcionar la ruta a la nota del agente o invocar un workflow. Ejemplo:");
    console.error("  npx tsx src/index.ts --agent ../../vault/Agents/github-manager.md");
    console.error("  npx tsx src/index.ts --workflow \"Crea un proyecto X\"");
    process.exit(1);
  }

  const rootDir = path.resolve(__dirname, "../../../");
  const agentPath = agentIndex !== -1 ? path.resolve(args[agentIndex + 1]) : "";
  const vaultPath = process.env.VAULT_PATH 
    ? path.resolve(rootDir, process.env.VAULT_PATH) 
    : path.resolve(rootDir, "vault");

  // Parsea parámetros CLI adicionales opcionales (por ejemplo --channel_id XXX o --triggered_by YYY)
  const parameters: Record<string, any> = {};
  
  const channelIndex = args.indexOf("--channel_id");
  if (channelIndex !== -1 && args[channelIndex + 1]) {
    parameters.channel_id = args[channelIndex + 1];
  }

  const triggeredIndex = args.indexOf("--triggered_by");
  if (triggeredIndex !== -1 && args[triggeredIndex + 1]) {
    parameters.triggered_by = args[triggeredIndex + 1];
  }

  const serverChannelsIndex = args.indexOf("--server_channels");
  if (serverChannelsIndex !== -1 && args[serverChannelsIndex + 1]) {
    try {
      parameters.server_channels = JSON.parse(args[serverChannelsIndex + 1]);
    } catch (e) {
      console.warn("No se pudo parsear server_channels:", e);
    }
  }

  const channelNameIndex = args.indexOf("--channel_name");
  if (channelNameIndex !== -1 && args[channelNameIndex + 1]) {
    parameters.channel_name = args[channelNameIndex + 1];
  }

  console.log("=================================================");
  console.log("SANCTUM AGENT RUNTIME - INICIANDO EJECUCIÓN (OOP)");
  console.log(`Agente: ${agentPath}`);
  console.log(`Vault:  ${vaultPath}`);
  console.log(`Contexto: ${noContext ? "DESACTIVADO (--no-context)" : "ACTIVADO"}`);
  if (Object.keys(parameters).length > 0) {
    console.log(`Parámetros dinámicos:`, JSON.stringify(parameters));
  }
  console.log("=================================================\n");

  try {
    if (workflowIndex !== -1 && args[workflowIndex + 1]) {
      const prompt = args[workflowIndex + 1];
      const workflow = new AgentWorkflow();
      await workflow.runWorkflow({
        vaultPath,
        prompt
      });
    } else {
      const runner = new AgentRunner();
      await runner.run({
        agentPath,
        vaultPath,
        noContext,
        parameters
      });
    }

    console.log("\n=================================================");
    console.log("SANCTUM AGENT RUNTIME - EJECUCIÓN TERMINADA CON ÉXITO");
    console.log("=================================================");
  } catch (error) {
    console.error("\n=================================================");
    console.log("SANCTUM AGENT RUNTIME - LA EJECUCIÓN FALLÓ");
    console.error("Detalle del error:", error);
    console.log("=================================================");
    process.exit(1);
  }
}

main();
