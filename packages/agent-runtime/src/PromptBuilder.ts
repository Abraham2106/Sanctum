import { AgentInvocation } from "./types.js";

/**
 * PromptBuilder: Construye el Prompt de Inferencia en 3 capas diferenciadas:
 * 
 * +--------------------------------------------------------------------------+
 * | CAPA 1: System Prompt (Peso Bajo, Fijo)                                  |
 * |   - Define el rol autónomo, formato JSON estricto, razonamiento en 4      |
 * |     pasos y reglas críticas de salvaguardas (seguridad).                  |
 * +--------------------------------------------------------------------------+
 * | CAPA 2: Agent Prompt (Peso Alto, Variable)                               |
 * |   - YAML instructions (instrucciones específicas del agente)             |
 * |   - Parámetros dinámicos en tiempo de ejecución (channel_id, etc.)        |
 * +--------------------------------------------------------------------------+
 * | CAPA 3: Contexto Recolectado (RAG Primitivo)                             |
 * |   - Insumos determinados por los Retrievers estructurados (Vault,        |
 * |     GitHub, Discord). El LLM no busca proactivamente, procesa lo provisto. |
 * +--------------------------------------------------------------------------+
 */
export class PromptBuilder {
  public static build(invocation: AgentInvocation): { systemPrompt: string; userMessage: string } {
    const actionSchemas: string[] = [];
    const tools = invocation.definition.tools;

    if (tools.includes("discord")) {
      actionSchemas.push(`  // Enviar un mensaje a Discord
  {
    "type": "discord_send",
    "channel_id": "<ID exacto del canal>",
    "content": "<Texto del mensaje, máx 1900 chars>"
  }`);
    }

    if (tools.includes("github")) {
      actionSchemas.push(`  // Crear un issue en GitHub
  {
    "type": "github_issue_create",
    "title": "<Título del issue>",
    "body": "<Descripción>",
    "labels": ["<label>"],
    "parent_issue": 123
  }`,
      `  // Cerrar un issue en GitHub
  {
    "type": "github_issue_close",
    "issue_number": 123
  }`);
    }

    if (tools.includes("vault")) {
      actionSchemas.push(`  // Escribir o sobrescribir un archivo en el vault
  {
    "type": "vault_write",
    "path": "<ruta/relativa.md>",
    "content": "<Contenido completo del archivo>"
  }`);
    }

    if (tools.includes("rag")) {
      actionSchemas.push(`  // Indexar una carpeta del vault en SQLite (map-reduce)
  {
    "type": "rag_index_folder",
    "folder": "<carpeta relativa opcional, default: todo el vault>"
  }`,
      `  // Buscar en la base de datos indexada (RAG local)
  {
    "type": "rag_search",
    "query": "<palabra clave>",
    "limit": 10
  }`);
    }

    // Acción "none" siempre disponible
    actionSchemas.push(`  // No ejecutar ninguna acción
  {
    "type": "none",
    "reason": "<Justificación>"
  }`);

    const systemPrompt = `Eres un agente autónomo llamado "${invocation.definition.name}" operando dentro del sistema Sanctum.

PRINCIPIO RECTOR: "Recolección barata y determinista. Procesamiento caro y puntual."
- El contexto ya fue recolectado antes de llamarte. No puedes pedir más información.
- Debes responder ÚNICAMENTE con un JSON válido. Sin texto adicional fuera del JSON.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROCESO DE RAZONAMIENTO (obligatorio, 4 pasos):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. step1_read    → ¿Qué información contiene el contexto provisto?
2. step2_identify → ¿Qué tarea o acción requieren mis instrucciones?
3. step3_decide  → ¿Qué acciones ejecutaré y por qué? (respeta max_actions: ${invocation.definition.max_actions ?? "ilimitado"})
4. step4_execute → Describe el payload exacto que vas a devolver.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO DE SALIDA (JSON estricto):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "reasoning": {
    "step1_read": "...",
    "step2_identify": "...",
    "step3_decide": "...",
    "step4_execute": "..."
  },
  "actions": [
    // Usa SOLO los tipos de acción listados abajo:
${actionSchemas.join(",\n")}
  ]
}

REGLAS CRÍTICAS DE SALVAGUARDA:
- Sigue las instrucciones específicas de abajo al pie de la letra.
- Si las instrucciones dicen un channel_id, content, o path EXACTO, úsalos sin modificar.
- No inventes información, no agregues contexto que no fue provisto.
- Si no hay nada que hacer, usa la acción "none" con una razón clara.
- Si falta información necesaria para ejecutar una tarea (e.g. no se inyectó el canal actual), reporta esto usando la acción "none" indicando qué información faltó en el reasoning.
`;

    // Resolver el nombre del canal de origen para mostrarlo explícitamente
    const originChannelId: string = invocation.parameters.channel_id ?? "";
    const originChannelName: string =
      invocation.parameters.channel_name ??
      (invocation.parameters.server_channels as Array<{ id: string; name: string }> | undefined)
        ?.find((c) => c.id === originChannelId)?.name ??
      "desconocido";

    let agentPrompt = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TUS INSTRUCCIONES ESPECÍFICAS (máxima prioridad):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${invocation.definition.instructions ?? "Sin instrucciones específicas. Usa tu criterio."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARÁMETROS DE LA INVOCACIÓN EN TIEMPO DE EJECUCIÓN:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  CANAL DE DESTINO OBLIGATORIO (usa este ID exacto en discord_send.channel_id):
    Nombre: #${originChannelName}
    ID:     ${originChannelId || "No provisto"}

- Invocado por (usuario solicitante): ${invocation.parameters.triggered_by ?? "Obsidian-Plugin/CLI"}
`;

    const userMessage = `━━━ CONTEXTO DEL VAULT (${invocation.contextString ? "disponible" : "vacío"}) ━━━
${invocation.contextString || "(Sin contexto — no se recolectaron notas para este agente)"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Límite de acciones: ${invocation.definition.max_actions ?? "Ilimitado"}

Sigue tus instrucciones específicas junto con los parámetros en tiempo de ejecución para devolver el JSON solicitado.`;

    return {
      systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
      userMessage
    };
  }
}
