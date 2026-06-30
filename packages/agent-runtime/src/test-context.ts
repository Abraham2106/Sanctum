import { loadAgentConfig } from "./loadAgentConfig.js";
import { collectContext } from "./collectContext.js";
import * as path from "path";

const vaultPath = process.env.VAULT_PATH
  ? path.resolve(process.env.VAULT_PATH)
  : path.resolve(process.cwd(), "../../vault");
const agentArg = process.argv[2] || "Agents/github-manager.md";
const agentConfigPath = path.resolve(vaultPath, agentArg);

console.log("Cargando config del agente desde:", agentConfigPath);
const config = await loadAgentConfig(agentConfigPath);
console.log("Config del agente cargado con éxito:");
console.log(JSON.stringify(config, null, 2));

console.log("\nRecolectando contexto desde el vault:", vaultPath);
const { fragments, contextString } = await collectContext(config, vaultPath);
console.log(`Fragmentos encontrados: ${fragments.length}`);
console.log("\n--- Contexto recolectado ---");
console.log(contextString);
console.log("----------------------------");
