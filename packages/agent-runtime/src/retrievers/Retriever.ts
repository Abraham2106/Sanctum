import { AgentDefinition, ContextFragment } from "../types.js";

export interface RetrieverContext {
  vaultPath: string;
  definition: AgentDefinition;
  invocationParameters?: Record<string, any>;
}

export interface Retriever {
  /**
   * Determina si este retriever debe procesar un archivo basado en su ruta o contenido parseado.
   */
  canHandle(filePath: string, parsedJsonContent: any | null): boolean;

  /**
   * Procesa el archivo y devuelve su fragmento formateado.
   */
  retrieve(filePath: string, relativeSource: string, fileContent: string, parsedJsonContent: any | null, context: RetrieverContext): Promise<ContextFragment>;
}
