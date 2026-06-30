import * as http from "node:http";
import * as path from "node:path";
import { AgentRunner } from "./AgentRunner.js";
import { AgentWorkflow } from "./workflow.js";

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
  const vaultPath = path.resolve(options.vaultPath || process.cwd());
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

      if (method === "GET" && url === "/api/search") {
        const urlObj = new URL(url, `http://${req.headers.host || "localhost"}`);
        const query = urlObj.searchParams.get("q") || "";
        const alpha = parseFloat(urlObj.searchParams.get("alpha") ?? "0.5");
        const folder = urlObj.searchParams.get("folder") || undefined;
        const limit = parseInt(urlObj.searchParams.get("limit") ?? "10", 10);

        if (!query) {
          jsonResponse(res, 400, { success: false, error: "Falta parámetro 'q'", logs: [] });
          return;
        }

        try {
          const { hybridSearch, isEmbeddingAvailable: checkEmbed } = await import("rag-engine");
          const hasEmbed = checkEmbed();
          const results = await hybridSearch(vaultPath, query, limit, folder, alpha);
          jsonResponse(res, 200, { success: true, mode: hasEmbed ? "hybrid" : "fts5", alpha, results });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          jsonResponse(res, 200, { success: false, error: msg, results: [] });
        }
        return;
      }

      if (method === "POST" && url === "/api/run") {
        const body = await readBody(req);
        const { agentPath, noContext, dryRun, parameters } = body;

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
            dryRun: !!dryRun,
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

      if (method === "POST" && url === "/api/index") {
        const body = await readBody(req);
        const folder = body?.folder as string | undefined;

        try {
          const { indexFolder } = await import("rag-engine");
          const stats = await indexFolder(vaultPath, folder);
          jsonResponse(res, 200, { success: true, stats });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          jsonResponse(res, 200, { success: false, error: msg });
        }
        return;
      }

      if (method === "GET" && url === "/api/health") {
        const checks = {
          vault: await (async () => {
            try {
              const fs = await import("node:fs/promises");
              await fs.access(vaultPath);
              return { ok: true };
            } catch {
              return { ok: false, error: "Vault not accessible" };
            }
          })(),
          proxy: process.env.GEMINI_PROXY_URL
            ? { ok: true, url: process.env.GEMINI_PROXY_URL }
            : { ok: false, error: "GEMINI_PROXY_URL not set" },
          discord: process.env.DISCORD_TOKEN
            ? { ok: true }
            : { ok: false, error: "DISCORD_TOKEN not set" },
          github: process.env.GITHUB_TOKEN
            ? { ok: true }
            : { ok: false, error: "GITHUB_TOKEN not set" },
        };
        const allOk = Object.values(checks).every((c: any) => c.ok);
        jsonResponse(res, allOk ? 200 : 200, {
          success: true,
          status: allOk ? "healthy" : "degraded",
          checks,
          timestamp: new Date().toISOString(),
        });
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
