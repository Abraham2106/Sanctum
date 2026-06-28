import { ContextFragment, IssuesTracker, TrackerIssue } from "../types.js";
import { Retriever, RetrieverContext } from "./Retriever.js";
import matter from "gray-matter";
import * as path from "path";

// ─── GITHUB TRACKER RETRIEVER ────────────────────────────────────────────────
export class GithubTrackerRetriever implements Retriever {
  public canHandle(filePath: string, parsedJsonContent: any | null): boolean {
    return filePath.endsWith(".json") && 
           parsedJsonContent && 
           parsedJsonContent.$schema === "sanctum-issues-tracker/v1";
  }

  public async retrieve(
    _filePath: string,
    relativeSource: string,
    _fileContent: string,
    parsedJsonContent: any | null,
    _context: RetrieverContext
  ): Promise<ContextFragment> {
    const tracker = parsedJsonContent as IssuesTracker;
    const repos = tracker.repos || {};
    let output = "";

    for (const [repoName, repoData] of Object.entries(repos)) {
      output += `Repo: ${repoName}\n`;
      const issues = repoData.issues || [];

      const findIssue = (num: number) => issues.find((i: TrackerIssue) => i.github_number === num);
      const roots = issues.filter((i: TrackerIssue) => i.parent_issue === null);

      if (issues.length === 0) {
        output += `  No se encontraron issues o tareas.\n\n`;
        continue;
      }

      output += `Issues y tareas:\n`;

      const rendered = new Set<TrackerIssue>();
      const renderIssue = (issue: TrackerIssue, depth: number) => {
        if (rendered.has(issue)) return;
        rendered.add(issue);

        const indent = "  ".repeat(depth);
        const idStr = issue.github_number !== null ? `#${issue.github_number}` : "[Pendiente]";
        const labelsStr = issue.labels && issue.labels.length > 0 ? ` [${issue.labels.join(", ")}]` : "";
        
        output += `${indent}- ${idStr} [${issue.status}] "${issue.title}"${labelsStr}\n`;
        
        if (issue.children && issue.children.length > 0) {
          for (const childNum of issue.children) {
            const child = findIssue(childNum);
            if (child) {
              renderIssue(child, depth + 1);
            } else {
              output += `${indent}  - #${childNum} (No encontrado en el tracker)\n`;
            }
          }
        }
      };

      for (const root of roots) {
        renderIssue(root, 1);
      }

      const unrendered = issues.filter((i: TrackerIssue) => !rendered.has(i));
      if (unrendered.length > 0) {
        output += `  Otros issues/tareas:\n`;
        for (const item of unrendered) {
          renderIssue(item, 2);
        }
      }
      output += "\n";
    }

    return {
      source: relativeSource,
      content: output.trim()
    };
  }
}

// ─── DISCORD LOG RETRIEVER ───────────────────────────────────────────────────
export class DiscordLogRetriever implements Retriever {
  private freshnessThresholdDays = 7;

  public canHandle(filePath: string, parsedJsonContent: unknown | null): boolean {
    // Acepta tanto {id}.json como {id}.temp.json
    const isJson = filePath.endsWith('.json') && !filePath.endsWith('.meta.json');
    return isJson &&
           parsedJsonContent !== null &&
           (parsedJsonContent as Record<string, unknown>).$schema === 'sanctum-discord-log/v1';
  }

  public async retrieve(
    filePath: string,
    relativeSource: string,
    _fileContent: string,
    parsedJsonContent: unknown | null,
    context: RetrieverContext
  ): Promise<ContextFragment> {
    const log = parsedJsonContent as {
      $schema: string;
      channel: string;
      channel_id?: string;
      messages: Array<{ id: string; author: string; timestamp: string; content: string }>;
    };

    // El nombre del archivo ES el channel_id (puede tener sufijo .temp)
    const fileBase = path.basename(filePath).replace(/\.temp\.json$|\.json$/, '');
    const commandChannelId = context.invocationParameters?.channel_id as string | undefined;

    // Si se pasó un channel_id, ignorar archivos que no correspondan
    if (commandChannelId && fileBase !== commandChannelId) {
      return { source: relativeSource, content: '' };
    }

    const usedTemp = context.invocationParameters?.use_temp === true;
    const isTempFile = filePath.endsWith('.temp.json');

    // Evitar leer ambos archivos para el mismo canal y duplicar contexto
    if (commandChannelId && fileBase === commandChannelId) {
      if (usedTemp && !isTempFile) {
        // Retrieval en hot: ignorar el log normal
        return { source: relativeSource, content: '' };
      }
      if (!usedTemp && isTempFile) {
        // Retrieval normal: ignorar cualquier temp residual
        return { source: relativeSource, content: '' };
      }
    }

    const channelLabel = log.channel ?? fileBase;
    let output = `Canal: #${channelLabel} (ID: ${fileBase})\nMensajes recientes (últimos 100):\n`;

    const messages = log.messages ?? [];
    const now = new Date();
    const thresholdMs = this.freshnessThresholdDays * 24 * 60 * 60 * 1000;

    const fresh = messages.filter((msg) => {
      const msgDate = new Date(msg.timestamp);
      return now.getTime() - msgDate.getTime() <= thresholdMs;
    });

    const last100 = fresh.slice(-100);

    if (last100.length === 0) {
      output += `  (No hay mensajes en los últimos ${this.freshnessThresholdDays} días)\n`;
    } else {
      for (const msg of last100) {
        output += `  - [${msg.timestamp}] ${msg.author}: ${msg.content}\n`;
      }
    }

    return { source: relativeSource, content: output.trim() };
  }
}


// ─── VAULT FILE RETRIEVER (Md y Json genérico) ───────────────────────────────
export class VaultFileRetriever implements Retriever {
  public canHandle(filePath: string, _parsedJsonContent: any | null): boolean {
    return filePath.endsWith(".md") || filePath.endsWith(".json");
  }

  public async retrieve(
    filePath: string,
    relativeSource: string,
    fileContent: string,
    parsedJsonContent: any | null,
    _context: RetrieverContext
  ): Promise<ContextFragment> {
    let content = "";

    if (filePath.endsWith(".md")) {
      const parsed = matter(fileContent);
      content = parsed.content.trim();
    } else {
      content = JSON.stringify(parsedJsonContent, null, 2);
    }

    return {
      source: relativeSource,
      content
    };
  }
}
