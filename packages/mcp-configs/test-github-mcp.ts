import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("ERROR: GITHUB_TOKEN no está definido en el archivo .env.");
  process.exit(1);
}

console.log("Iniciando GitHub MCP...");
const isWindows = process.platform === "win32";
const command = isWindows ? "npx.cmd" : "npx";

const transport = new StdioClientTransport({
  command,
  args: ["-y", "@modelcontextprotocol/server-github"],
  env: {
    ...process.env,
    GITHUB_PERSONAL_ACCESS_TOKEN: token,
  },
});

const client = new Client(
  {
    name: "test-github-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  }
);

try {
  console.log("Conectando al transporte MCP...");
  await client.connect(transport);
  console.log("Conectado con éxito.");

  // Listar las herramientas disponibles
  console.log("Obteniendo herramientas disponibles...");
  const tools = await client.listTools();
  console.log("Herramientas encontradas:", tools.tools.map(t => t.name));

  // Ejecutar una consulta de prueba. Usamos el repositorio Abraham2106/Sanctum
  console.log("Listando issues abiertos de Abraham2106/Sanctum...");
  const result = await client.callTool({
    name: "list_issues",
    arguments: {
      owner: "Abraham2106",
      repo: "Sanctum",
      state: "open"
    }
  });

  console.log("Resultado del MCP:");
  console.log(JSON.stringify(result, null, 2));

} catch (error) {
  console.error("Error al probar el GitHub MCP:", error);
} finally {
  console.log("Cerrando cliente MCP...");
  await client.close();
}
