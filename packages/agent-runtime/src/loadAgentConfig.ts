import * as fs from "fs/promises";
import matter from "gray-matter";
import { AgentConfig } from "./types.js";

/**
 * Carga y valida la configuración de un agente desde un archivo markdown con frontmatter.
 */
export async function loadAgentConfig(filePath: string): Promise<AgentConfig> {
  const content = await fs.readFile(filePath, "utf-8");
  const parsed = matter(content);
  const data = parsed.data;

  // Coerce name/description/model a string (YAML puede parsear '0' como number)
  if (data.name === undefined || data.name === null) {
    throw new Error(`Configuración inválida: falta el campo 'name' en ${filePath}`);
  }
  const name = String(data.name);

  if (data.description === undefined || data.description === null) {
    throw new Error(`Configuración inválida: falta el campo 'description' en ${filePath}`);
  }
  const description = String(data.description);

  if (!Array.isArray(data.allowed_folders) || !data.allowed_folders.every((f: unknown) => typeof f === "string")) {
    throw new Error(`Configuración inválida: 'allowed_folders' debe ser un array de strings en ${filePath}`);
  }
  if (!Array.isArray(data.allowed_tags) || !data.allowed_tags.every((t: unknown) => typeof t === "string")) {
    throw new Error(`Configuración inválida: 'allowed_tags' debe ser un array de strings en ${filePath}`);
  }
  if (data.model === undefined || data.model === null) {
    throw new Error(`Configuración inválida: falta el campo 'model' en ${filePath}`);
  }
  const model = String(data.model);

  if (!Array.isArray(data.tools) || !data.tools.every((t: unknown) => typeof t === "string")) {
    throw new Error(`Configuración inválida: 'tools' debe ser un array de strings en ${filePath}`);
  }

  let maxActions: number | undefined = undefined;
  if (data.max_actions !== undefined) {
    if (typeof data.max_actions !== "number" || isNaN(data.max_actions)) {
      throw new Error(`Configuración inválida: 'max_actions' debe ser un número en ${filePath}`);
    }
    maxActions = data.max_actions;
  }

  const config: AgentConfig = {
    name,
    description,
    allowed_folders: data.allowed_folders,
    allowed_tags: data.allowed_tags,
    model,
    tools: data.tools,
    // Leer instrucciones del frontmatter (string o undefined)
    instructions: data.instructions !== undefined && data.instructions !== null
      ? String(data.instructions)
      : undefined,
  };

  if (maxActions !== undefined) {
    config.max_actions = maxActions;
  }

  return config;
}
