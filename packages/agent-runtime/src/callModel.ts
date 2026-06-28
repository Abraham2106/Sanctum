import { ModelResponse } from "./types.js";

/**
 * Realiza exactamente una llamada al modelo a través del proxy y devuelve la respuesta parseada.
 */
export async function callModel(
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<ModelResponse> {
  const proxyUrl = process.env.GEMINI_PROXY_URL;
  if (!proxyUrl) {
    throw new Error("GEMINI_PROXY_URL no está definido en las variables de entorno (.env)");
  }

  // Normalizar el nombre del modelo: 'auto' o vacío → gemini-2.0-flash
  const VALID_MODEL_PREFIXES = ['gemini-', 'models/'];
  const resolvedModel =
    !model ||
    model === 'auto' ||
    !VALID_MODEL_PREFIXES.some(p => model.startsWith(p))
      ? 'gemini-2.0-flash'
      : model;

  console.log(`Llamando al modelo '${resolvedModel}' vía proxy...`);
  const response = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1, // Baja temperatura para asegurar formato estructurado determinista
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en la llamada al proxy (HTTP ${response.status}): ${errorText}`);
  }

  const responseData = (await response.json()) as {
    choices: Array<{
      message: {
        content: string;
      };
    }>;
  };

  const rawContent = responseData.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("La respuesta del modelo no contiene ningún contenido.");
  }

  // Limpiar posibles bloques de código markdown si el modelo los incluyó
  let cleanedContent = rawContent.trim();
  if (cleanedContent.startsWith("```")) {
    // Quitar bloque de código inicial e.g., ```json o ```
    cleanedContent = cleanedContent.replace(/^```[a-zA-Z]*\n/, "");
    // Quitar bloque de código final
    cleanedContent = cleanedContent.replace(/\n```$/, "");
    cleanedContent = cleanedContent.trim();
  }

  try {
    const parsed = JSON.parse(cleanedContent) as ModelResponse;

    // Validación básica de estructura
    if (!parsed.reasoning || typeof parsed.reasoning !== "object") {
      throw new Error("El JSON de respuesta no contiene un objeto 'reasoning'.");
    }
    if (!parsed.actions || !Array.isArray(parsed.actions)) {
      throw new Error("El JSON de respuesta no contiene un array 'actions'.");
    }

    return parsed;
  } catch (err) {
    console.error("Error al parsear el JSON retornado por el modelo. Contenido crudo:");
    console.error(rawContent);
    throw new Error(`La respuesta del modelo no es un JSON válido: ${(err as Error).message}`);
  }
}
