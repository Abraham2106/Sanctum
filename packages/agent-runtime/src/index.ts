import * as fs from "fs";
import * as path from "path";
import { AddressInfo } from "net";
import * as dotenv from "dotenv";
import { AgentRunner } from "./AgentRunner.js";
import { AgentWorkflow } from "./workflow.js";
import { createAgentServer } from "./server.js";

function findEnvPath(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

function findMonorepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  while (true) {
    const packageJson = path.join(dir, "package.json");
    if (fs.existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJson, "utf-8")) as { workspaces?: string[] };
        if (Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) {
          return dir;
        }
      } catch {
        // ignorar JSON corrupto
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return process.cwd();
}

// Configurar dotenv apuntando al .env más cercano en ancestros
const envPath = findEnvPath(process.cwd());
if (envPath) {
  dotenv.config({ path: envPath });
}

async function main() {
  const args = process.argv.slice(2);
  const serverFlag = args.includes("--server");
  const agentIndex = args.indexOf("--agent");
  const workflowIndex = args.indexOf("--workflow");
  const noContext  = args.includes("--no-context");
  const dryRun  = args.includes("--dry-run");
  const schedulerFlag = args.includes("--scheduler");
  const watchFlag = args.includes("--watch");
  const mentionFlag = args.includes("--mention");

  const rootDir = findMonorepoRoot(process.cwd());
  const vaultPath = process.env.VAULT_PATH
    ? path.resolve(rootDir, process.env.VAULT_PATH)
    : path.resolve(rootDir, "vault");

  if (serverFlag) {
    const portIndex = args.indexOf("--port");
    const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : parseInt(process.env.UI_PORT ?? "3456", 10);
    const server = createAgentServer({ vaultPath, port });
    server.on("listening", () => {
      const addr = server.address() as AddressInfo;
      console.log(`Sanctum server on http://localhost:${addr.port} | vault: ${vaultPath}`);
    });
    return;
  }

  if (schedulerFlag) {
    const { Scheduler } = await import("./Scheduler.js");
    const scheduler = new Scheduler(vaultPath);
    await scheduler.loadJobs();
    scheduler.start();
    console.log("[CLI] Scheduler mode — running scheduled jobs");
    return;
  }

  if (mentionFlag) {
    const { MentionWatcher } = await import("./MentionWatcher.js");
    const { loadAgentConfig } = await import("./loadAgentConfig.js");
    const watcher = new MentionWatcher(vaultPath, async (event) => {
      console.log(`[MentionWatcher] Triggered: @${event.agentId} in ${event.filePath}`);
    });
    // Load known agent IDs
    const fs = await import("fs/promises");
    const agentsDir = path.join(vaultPath, "Agents");
    try {
      const entries = await fs.readdir(agentsDir);
      const agentIds: string[] = [];
      for (const entry of entries) {
        if (!entry.endsWith(".md") || entry.startsWith("_")) continue;
        try {
          const config = await loadAgentConfig(path.join(agentsDir, entry));
          agentIds.push(config.name.toLowerCase().replace(/\s+/g, "-"));
        } catch { continue; }
      }
      watcher.setAgents(agentIds);
    } catch { /* ignore */ }
    watcher.start();
    console.log("[CLI] Mention watcher mode — watching for @agent mentions");
    return;
  }

  if (agentIndex === -1 && workflowIndex === -1) {
    console.error("ERROR: Modo de uso:");
    console.error("  npx tsx src/index.ts --agent <path>          Ejecutar un agente");
    console.error("  npx tsx src/index.ts --agent <path> --dry-run Vista previa sin ejecutar");
    console.error("  npx tsx src/index.ts --workflow \"prompt\"    Workflow multi-agente");
    console.error("  npx tsx src/index.ts --server                 Servidor HTTP");
    console.error("  npx tsx src/index.ts --scheduler              Jobs programados");
    console.error("  npx tsx src/index.ts --mention                Vigilar @menciones");
    process.exit(1);
  }

  const agentPath = agentIndex !== -1 ? path.resolve(args[agentIndex + 1]) : "";

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
  if (dryRun) console.log("DRY RUN: Las acciones NO se ejecutarán");
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
        dryRun,
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
