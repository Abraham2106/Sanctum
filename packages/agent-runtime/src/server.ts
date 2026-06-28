import * as http from "node:http";
import * as path from "node:path";
import { AgentRunner } from "./AgentRunner.js";
import { AgentWorkflow } from "./workflow.js";

// dotenv se carga externamente (plugin o CLI). Esta función es para standalone.
try {
  const { config } = require("dotenv");
  config();
} catch {} // Ignorar si dotenv no está disponible (bundled)

function captureConsole(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.log = (...args: unknown[]) => {
    const line = args.map(a => typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)).join(" ");
    logs.push(`[log] ${line}`);
    originalLog(...args);
  };
  console.error = (...args: unknown[]) => {
    const line = args.map(a => typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)).join(" ");
    logs.push(`[err] ${line}`);
    originalError(...args);
  };
  console.warn = (...args: unknown[]) => {
    const line = args.map(a => typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)).join(" ");
    logs.push(`[warn] ${line}`);
    originalWarn(...args);
  };

  return {
    logs,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }
  };
}

function jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const MAX_BODY_SIZE = 1024 * 100;

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy(new Error("Request body too large"));
        reject(new Error("Request body exceeds 100KB limit"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

export interface AgentServerOptions {
  vaultPath: string;
  port?: number;
}

export function createAgentServer(options: AgentServerOptions): http.Server {
  const vaultPath = path.resolve(options.vaultPath);
  const agentsDir = path.join(vaultPath, "Agents");

  const server = http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";

    try {
      if (method === "GET" && url === "/api/agents") {
        const { loadAgentConfig } = await import("./loadAgentConfig.js");
        const fs = await import("node:fs/promises");
        const entries = await fs.readdir(agentsDir);
        const agents: { name: string; path: string; description: string }[] = [];

        for (const entry of entries) {
          if (!entry.endsWith(".md") || entry.startsWith("_")) continue;
          const fullPath = path.join(agentsDir, entry);
          try {
            const config = await loadAgentConfig(fullPath);
            agents.push({ name: config.name, path: fullPath, description: config.description });
          } catch {
            continue;
          }
        }

        jsonResponse(res, 200, { success: true, agents });
        return;
      }

      if (method === "POST" && url === "/api/run") {
        const body = await readBody(req);
        const { agentPath, noContext, parameters } = body;

        if (!agentPath) {
          jsonResponse(res, 400, { success: false, error: "Falta 'agentPath'", logs: [] });
          return;
        }

        const resolvedPath = path.resolve(agentPath);
        const allowedPrefix = path.resolve(agentsDir);
        if (!resolvedPath.startsWith(allowedPrefix)) {
          jsonResponse(res, 403, { success: false, error: `Acceso denegado: agentPath debe estar dentro de ${allowedPrefix}`, logs: [] });
          return;
        }

        if (!resolvedPath.endsWith(".md")) {
          jsonResponse(res, 400, { success: false, error: "agentPath debe ser un archivo .md", logs: [] });
          return;
        }

        const capture = captureConsole();
        try {
          const runner = new AgentRunner();
          const actions = await runner.run({
            agentPath: resolvedPath,
            vaultPath,
            noContext: !!noContext,
            parameters: parameters ?? {},
          });
          jsonResponse(res, 200, { success: true, actions, logs: capture.logs });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          jsonResponse(res, 200, { success: false, error: msg, logs: capture.logs });
        } finally {
          capture.restore();
        }
        return;
      }

      if (method === "POST" && url === "/api/workflow") {
        const body = await readBody(req);
        const { prompt } = body;

        if (!prompt) {
          jsonResponse(res, 400, { success: false, error: "Falta 'prompt'", logs: [] });
          return;
        }

        const capture = captureConsole();
        try {
          const workflow = new AgentWorkflow();
          await workflow.runWorkflow({ vaultPath, prompt });
          jsonResponse(res, 200, { success: true, logs: capture.logs });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          jsonResponse(res, 200, { success: false, error: msg, logs: capture.logs });
        } finally {
          capture.restore();
        }
        return;
      }

      if (method === "GET" && url === "/api/status") {
        jsonResponse(res, 200, { success: true, status: "ok", vaultPath, agentsDir });
        return;
      }

      jsonResponse(res, 404, { success: false, error: "Not Found" });
    } catch (err) {
      jsonResponse(res, 500, { success: false, error: String(err instanceof Error ? err.message : err), logs: [] });
    }
  });

  const port = options.port ?? 3456;
  server.listen(port);
  return server;
}
