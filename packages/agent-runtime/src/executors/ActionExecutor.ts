import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AgentAction, AgentDefinition, IssuesTracker } from "../types.js";
import { sendMessage } from "./sendMessage.js";
import * as fs from "fs/promises";
import * as path from "path";

export interface ActionExecutorContext {
  vaultPath: string;
  definition: AgentDefinition;
}

export interface ActionExecutor {
  execute(action: AgentAction, context: ActionExecutorContext): Promise<void>;
}

// ─── GITHUB EXECUTOR ──────────────────────────────────────────────────────────
export class GithubActionExecutor implements ActionExecutor {
  private client: Client | null = null;

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN no está definido en las variables de entorno.");
    }

    console.log(`Iniciando conexión con GitHub MCP para ejecutar acciones de GitHub...`);
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

    this.client = new Client(
      { name: "agent-runtime-executor", version: "1.0.0" },
      { capabilities: {} }
    );

    await this.client.connect(transport);
    console.log("Conectado con éxito a GitHub MCP.");
    return this.client;
  }

  public async closeClient(): Promise<void> {
    if (this.client) {
      console.log("Cerrando cliente GitHub MCP...");
      await this.client.close();
      this.client = null;
    }
  }

  public async execute(action: AgentAction, context: ActionExecutorContext): Promise<void> {
    if (action.type !== "github_issue_create" && action.type !== "github_issue_close") {
      return;
    }

    const client = await this.getClient();
    const owner = process.env.GITHUB_OWNER ?? "Abraham2106";
    const repo = process.env.GITHUB_REPO ?? "Sanctum";

    if (action.type === "github_issue_create") {
      console.log(`Creando issue: "${action.title}" en ${owner}/${repo}...`);
      const result = (await client.callTool({
        name: "create_issue",
        arguments: {
          owner,
          repo,
          title: action.title,
          body: action.body,
          labels: action.labels,
        },
      })) as { content: Array<{ type: string; text: string }> };

      let createdIssueNumber: number | null = null;
      if (result.content && result.content[0] && result.content[0].type === "text") {
        try {
          const issueData = JSON.parse(result.content[0].text);
          if (issueData && typeof issueData.number === "number") {
            createdIssueNumber = issueData.number;
          }
        } catch (e) {
          console.error("Error al parsear el issue creado del MCP:", e);
        }
      }

      if (createdIssueNumber !== null) {
        await this.updateLocalTracker(
          context.vaultPath,
          `${owner}/${repo}`,
          action.title,
          createdIssueNumber,
          "open",
          action.parent_issue
        );
      } else {
        console.warn("No se pudo obtener el número de issue creado del resultado de GitHub MCP.");
      }
    } else if (action.type === "github_issue_close") {
      console.log(`Cerrando issue #${action.issue_number} en ${owner}/${repo}...`);
      await client.callTool({
        name: "update_issue",
        arguments: {
          owner,
          repo,
          issue_number: action.issue_number,
          state: "closed",
        },
      });

      await this.updateLocalTracker(
        context.vaultPath,
        `${owner}/${repo}`,
        "",
        action.issue_number,
        "closed"
      );
    }
  }

  private async updateLocalTracker(
    vaultPath: string,
    repoKey: string,
    title: string,
    githubNumber: number,
    status: "open" | "closed",
    parentIssue?: number | null
  ): Promise<void> {
    const trackerFilePath = path.join(vaultPath, "GitHub/issues-tracker.json");
    try {
      const raw = await fs.readFile(trackerFilePath, "utf-8");
      const tracker = JSON.parse(raw) as IssuesTracker;

      if (!tracker.repos) tracker.repos = {};
      if (!tracker.repos[repoKey]) {
        tracker.repos[repoKey] = { issues: [] };
      }

      const repoTracker = tracker.repos[repoKey];

      let issue = repoTracker.issues.find(
        (i) =>
          i.github_number === githubNumber ||
          (i.github_number === null && i.title.toLowerCase().trim() === title.toLowerCase().trim())
      );

      if (!issue) {
        issue = {
          github_number: githubNumber,
          title,
          status,
          labels: [],
          created_at: new Date().toISOString().split("T")[0],
          parent_issue: parentIssue ?? null,
          children: [],
        };
        repoTracker.issues.push(issue);
      } else {
        issue.github_number = githubNumber;
        issue.status = status;
        if (parentIssue !== undefined) {
          issue.parent_issue = parentIssue;
        }
      }

      if (issue.parent_issue !== null) {
        const parentId = issue.parent_issue;
        const parent = repoTracker.issues.find((i) => i.github_number === parentId);
        if (parent) {
          if (!parent.children) parent.children = [];
          if (!parent.children.includes(githubNumber)) {
            parent.children.push(githubNumber);
          }
        }
      }

      await fs.writeFile(trackerFilePath, JSON.stringify(tracker, null, 2), "utf-8");
      console.log(`[Tracker] Se actualizó localmente el issue #${githubNumber} a estado '${status}' en el JSON.`);
    } catch (err) {
      console.error(`[Tracker Error] No se pudo actualizar el tracker JSON en ${trackerFilePath}:`, err);
    }
  }
}

// ─── DISCORD EXECUTOR ────────────────────────────────────────────────────────
export class DiscordActionExecutor implements ActionExecutor {
  private discordSendsExecuted = 0;

  public async execute(action: AgentAction, context: ActionExecutorContext): Promise<void> {
    if (action.type !== "discord_send") return;

    const maxDiscordSends = context.definition.max_actions ?? 1;
    if (this.discordSendsExecuted >= maxDiscordSends) {
      console.warn(`Advertencia: Se descartó una acción 'discord_send' adicional por exceder el límite de ${maxDiscordSends} por ejecución.`);
      return;
    }

    let contentToSend = action.content;
    if (contentToSend.length > 1900) {
      console.warn("Advertencia: El contenido de discord_send excede los 1900 caracteres. Será truncado.");
      contentToSend = contentToSend.substring(0, 1900) + "... (truncado)";
    }

    const discordToken = process.env.DISCORD_TOKEN;
    if (!discordToken) {
      throw new Error("DISCORD_TOKEN no está definido para ejecutar discord_send.");
    }

    console.log(`Enviando mensaje de Discord al canal ${action.channel_id}...`);
    await sendMessage(discordToken, action.channel_id, contentToSend);

    this.discordSendsExecuted++;

    // Log the execution
    const logDate = new Date().toISOString().split("T")[0];
    const logDir = path.join(context.vaultPath, "Agents", "_logs");
    await fs.mkdir(logDir, { recursive: true });
    const logFile = path.join(logDir, `${logDate}.md`);

    const timestamp = new Date().toISOString();
    const logEntry = `\n## [${timestamp}] discord_send\n**Canal:** ${action.channel_id}\n\n${contentToSend}\n\n---\n`;
    await fs.appendFile(logFile, logEntry, "utf-8");
    console.log(`Mensaje enviado a Discord exitosamente. Logueado en ${logFile}`);
  }
}

// ─── VAULT EXECUTOR ──────────────────────────────────────────────────────────
export class VaultActionExecutor implements ActionExecutor {
  public async execute(action: AgentAction, context: ActionExecutorContext): Promise<void> {
    if (action.type !== "vault_write") return;

    console.log(`Escribiendo archivo en vault: ${action.path}...`);
    const targetPath = path.resolve(context.vaultPath, action.path);
    if (!targetPath.startsWith(path.resolve(context.vaultPath))) {
      console.error(`Acceso denegado: ${action.path} está fuera del vault.`);
      return;
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, action.content, "utf-8");
    console.log(`Archivo escrito exitosamente: ${action.path}`);

    if (context.definition.tools.includes("rag")) {
      try {
        console.log(`Auto-indexando ${action.path}...`);
        const { indexFile } = await import("rag-engine");
        await indexFile(context.vaultPath, action.path, action.content);
        console.log(`Indexado exitosamente: ${action.path}`);
      } catch (e) {
        console.warn(`No se pudo indexar automáticamente: ${e}`);
      }
    }
  }
}

// ─── RAG EXECUTOR ────────────────────────────────────────────────────────────
export class RAGActionExecutor implements ActionExecutor {
  public async execute(action: AgentAction, context: ActionExecutorContext): Promise<void> {
    if (action.type === "rag_index_folder") {
      try {
        const folder = action.folder || ".";
        console.log(`Indexando carpeta: ${folder}...`);
        const { indexFolder } = await import("rag-engine");
        const stats = await indexFolder(context.vaultPath, folder === "." ? undefined : folder);
        console.log(`Indexación completada: ${stats.documentsIndexed} documentos, ${stats.termsIndexed} términos (${stats.elapsedMs}ms)`);
      } catch (e) {
        console.error(`Error indexando carpeta: ${e}`);
      }
    }

    if (action.type === "rag_search") {
      console.log(`Búsqueda RAG registrada: "${action.query}"`);
    }
  }
}

// ─── EXECUTOR REGISTRY ───────────────────────────────────────────────────────
export class ExecutorRegistry {
  private executors: Record<string, ActionExecutor> = {};
  private githubExecutor = new GithubActionExecutor();
  private ragExecutor = new RAGActionExecutor();

  constructor() {
    this.executors["discord_send"] = new DiscordActionExecutor();
    this.executors["github_issue_create"] = this.githubExecutor;
    this.executors["github_issue_close"] = this.githubExecutor;
    this.executors["vault_write"] = new VaultActionExecutor();
    this.executors["rag_index_folder"] = this.ragExecutor;
    this.executors["rag_search"] = this.ragExecutor;
  }

  public async executeAll(actions: AgentAction[], context: ActionExecutorContext): Promise<void> {
    const activeActions = actions.filter((action) => action.type !== "none");
    const limit = context.definition.max_actions ?? activeActions.length;
    const actionsToExecute = activeActions.slice(0, limit);

    if (activeActions.length > limit) {
      console.warn(`Advertencia: Se propusieron ${activeActions.length} acciones, pero se limitó a las primeras ${limit}.`);
    }

    try {
      for (const action of actionsToExecute) {
        const executor = this.executors[action.type];
        if (executor) {
          await executor.execute(action, context);
        } else if ((action.type as string) !== "none") {
          console.warn(`Advertencia: Tipo de acción desconocido: ${action.type}`);
        }
      }
    } finally {
      await this.githubExecutor.closeClient();
    }
  }
}
