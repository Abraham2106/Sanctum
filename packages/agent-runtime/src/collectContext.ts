import * as fs from "fs/promises";
import * as path from "path";
import matter from "gray-matter";
import { AgentDefinition, ContextFragment } from "./types.js";
import { Retriever, RetrieverContext } from "./retrievers/Retriever.js";
import { VaultFileRetriever, GithubTrackerRetriever, DiscordLogRetriever } from "./retrievers/ConcreteRetrievers.js";

export class RetrieverRegistry {
  private retrievers: Retriever[] = [];

  constructor() {
    this.retrievers.push(new GithubTrackerRetriever());
    this.retrievers.push(new DiscordLogRetriever());
    this.retrievers.push(new VaultFileRetriever());
  }

  public async retrieveFile(
    filePath: string,
    relativeSource: string,
    fileContent: string,
    context: RetrieverContext
  ): Promise<ContextFragment | null> {
    let parsedJson: any | null = null;
    if (filePath.endsWith(".json")) {
      try {
        parsedJson = JSON.parse(fileContent);
      } catch (err) {
        // Ignorar JSON corruptos
        return null;
      }
    }

    for (const retriever of this.retrievers) {
      if (retriever.canHandle(filePath, parsedJson)) {
        return await retriever.retrieve(filePath, relativeSource, fileContent, parsedJson, context);
      }
    }

    return null;
  }
}

/**
 * Escanea y recolecta el contexto del vault para las carpetas y tags permitidos usando los retrievers estructurados.
 * Si el agente tiene tool 'rag' y se pasa search_query, usa RAG en vez de escanear todo el vault.
 */
export async function collectContext(
  config: AgentDefinition,
  vaultPath: string,
  parameters?: Record<string, any>
): Promise<{ fragments: ContextFragment[]; contextString: string }> {
  const fragments: ContextFragment[] = [];
  const registry = new RetrieverRegistry();
  const context: RetrieverContext = { 
    vaultPath, 
    definition: config,
  };
  if (parameters) {
    context.invocationParameters = parameters;
  }

  // Si el agente tiene RAG y hay search_query, buscar en SQLite en vez de escanear
  const searchQuery = parameters?.search_query as string | undefined;
  const hasRag = config.tools.includes("rag");

  if (hasRag && searchQuery) {
    try {
      console.log(`Usando RAG search: "${searchQuery}"...`);
      const { searchAndCollect } = await import("rag-engine");
      const folderFilter = parameters?.search_folder as string | undefined;
      const contextContent = searchAndCollect(vaultPath, searchQuery, 10, folderFilter);

      if (contextContent) {
        fragments.push({
          source: `RAG search results for "${searchQuery}"`,
          content: contextContent,
        });
      }

      const contextString = fragments.map(f => `## [${f.source}]\n\n${f.content}\n\n`).join("").trim();
      return { fragments, contextString };
    } catch (e) {
      console.warn(`RAG search falló, usando fallback a escaneo completo: ${e}`);
    }
  }

  for (const folder of config.allowed_folders) {
    const folderPath = path.resolve(vaultPath, folder);

    try {
      const stats = await fs.stat(folderPath);
      if (!stats.isDirectory()) {
        continue;
      }

      const files = await fs.readdir(folderPath);

      for (const file of files) {
        const isMd = file.endsWith('.md');
        const isJson = file.endsWith('.json') && !file.endsWith('.meta.json');
        const isTempJson = file.endsWith('.temp.json');
        if (!isMd && !isJson && !isTempJson) continue;

        const filePath = path.join(folderPath, file);
        const relativeSource = path.join(folder, file).replace(/\\/g, "/");

        try {
          const rawContent = await fs.readFile(filePath, "utf-8");
          let tags: string[] = [];

          if (isMd) {
            const parsed = matter(rawContent);
            const data = parsed.data;
            if (data && data.tags) {
              if (Array.isArray(data.tags)) {
                tags = data.tags.map((t: unknown) => String(t));
              } else if (typeof data.tags === "string") {
                tags = [data.tags];
              }
            }
          } else if (isJson) {
            try {
              const parsedJson = JSON.parse(rawContent);
              if (parsedJson && parsedJson.tags) {
                const fileTags = parsedJson.tags;
                if (Array.isArray(fileTags)) {
                  tags = fileTags.map((t: unknown) => String(t));
                } else if (typeof fileTags === "string") {
                  tags = [fileTags];
                }
              }
            } catch (err) {
              // JSON corrupto
              continue;
            }
          }

          // Verificar si hay intersección entre los tags del archivo y los tags permitidos del agente
          const hasMatchingTag = config.allowed_tags.some((tag) => tags.includes(tag));

          if (hasMatchingTag) {
            const fragment = await registry.retrieveFile(filePath, relativeSource, rawContent, context);
            // Descartar fragments vacíos (e.g. canal ignorado por DiscordLogRetriever)
            if (fragment && fragment.content.trim().length > 0) {
              fragments.push(fragment);
            }
          }
        } catch (fileErr) {
          console.warn(`Advertencia: No se pudo procesar el archivo ${filePath}:`, fileErr);
        }
      }
    } catch (folderErr) {
      console.warn(`Advertencia: No se pudo acceder a la carpeta ${folderPath}:`, folderErr);
    }
  }

  // Generar la cadena de contexto concatenada
  let contextString = "";
  for (const fragment of fragments) {
    contextString += `## [${fragment.source}]\n\n${fragment.content}\n\n`;
  }

  return {
    fragments,
    contextString: contextString.trim(),
  };
}
