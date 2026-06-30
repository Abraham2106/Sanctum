# Plugin de Obsidian "Sanctum Agents" — Plan de diseño

> Clon gratuito y autocontenido de los *Agents* de Notion, ejecutándose 100%
> dentro de Obsidian (sin proceso `agent-runtime` externo).

---

## 1. Objetivo y alcance

Simular las cuatro superficies de Notion Agents dentro de Obsidian:

1. **UI de configuración de agentes (Notion-style)** — panel lateral con
   Triggers, Instructions, Tools & access, Model selector y botón Save que
   escribe/actualiza la nota YAML del agente en `Agents/`.
2. **Chat con agente dentro de una nota** — conversación embebida en la nota
   activa, disparada con `@agente`, estilo *Notion AI in-page*.
3. **Lista de agentes + ejecución** — vista lateral con cada agente y botones
   Run / Chat / Logs.
4. **Triggers automáticos (event-driven)** — ejecutar agentes al crear/editar
   notas que matcheen `allowed_folders` / `allowed_tags`, no solo a mano.

El plugin es **autocontenido**: recolecta contexto del vault, arma el prompt,
hace **una única** llamada al modelo y ejecuta acciones. No depende de
`packages/agent-runtime`.

---

## 2. Decisiones de arquitectura

| Decisión | Valor | Justificación |
|---|---|---|
| Runtime externo | **No** | El plugin vive dentro de Obsidian y ya tiene acceso directo al vault (`app.vault`); no hay valor en un proceso Node aparte. |
| Recolección de contexto | Determinista, dentro del plugin | Lee `allowed_folders` + `allowed_tags` vía `app.vault.getMarkdownFiles()`. Cumple el principio rector *"recolección barata y determinista"*. |
| Proveedor de IA | `GEMINI_PROXY_URL` (endpoint OpenAI-compatible) | Igual que Sanctum.md §2.3: el plugin Nunca maneja keys de Gemini; habla con el Proxy Balancer. |
| Llamadas al modelo | **Exactamente 1 por ejecución** | AGENTS.md §4. Sin bucles de feedback. |
| MCP (GitHub) | Cliente MCP embebido (`@modelcontextprotocol/sdk`) vía stdio/HTTP | Para que las acciones `github` funcionen sin runtime externo. |
| Configuración de agentes | Notas YAML en `Agents/*.md` (frontmatter) | Fuente de verdad única, editable a mano o por la UI. |
| Almacenamiento de settings del plugin | `loadData()` / `saveData()` de Obsidian | `GEMINI_PROXY_URL`, token MCP, estado de triggers. |

> **Nota de desviación**: Sanctum.md §2 prevé el `agent-runtime` como proceso
> aparte. Mover esa lógica al plugin es válido **solo** si se mantiene
> (a) recolección determinista, (b) una sola llamada al modelo y
> (c) sin exploración autónoma de APIs. Este plan las mantiene todas.

---

## 3. Estructura de archivos propuesta

```
packages/obsidian-plugin/
├── manifest.json              # id, name, minAppVersion (Obsidian)
├── package.json               # deps: obsidian, @modelcontextprotocol/sdk
├── tsconfig.json              # strict: true, noImplicitAny: true
├── styles.css                 # estilos Notion-style (triggers toggles, chat bubbles)
├── main.ts                    # lifecycle del Plugin (onload/onunload, registros)
└── src/
    ├── types.ts               # Interfaces TS explícitas (AgentConfig, RunContext, ...)
    ├── config/
    │   └── AgentConfigStore.ts   # leer/escribir YAML en Agents/*.md (frontmatter)
    │   └── schema.ts             # validación de la config (zod o guards manuales)
    ├── context/
    │   └── ContextCollector.ts  # recopila notas de allowed_folders + allowed_tags
    │   └── FrontmatterParser.ts # YAML → objeto tipado
    ├── prompt/
    │   └── PromptBuilder.ts     # arma el prompt chain-of-thought de 4 pasos
    ├── llm/
    │   └── LLMClient.ts         # POST {GEMINI_PROXY_URL}/v1/chat/completions
    ├── mcp/
    │   └── MCPClient.ts         # cliente GitHub MCP (stdio o http)
    │   └── tools.ts             # registro tool-name → handler
    ├── actions/
    │   └── ActionExecutor.ts   # ejecuta acciones devueltas por el modelo
    ├── runtime/
    │   └── AgentRunner.ts       # orquestador: config → ctx → prompt → LLM → actions
    ├── triggers/
    │   └── TriggerManager.ts    # suscribe a events del vault (create/modify)
    ├── views/
    │   └── AgentConfigView.ts   # panel Notion-style (Triggers/Instructions/Tools/Model)
    │   └── AgentListView.ts     # lista de agentes + Run/Chat/Logs
    │   └── NoteChatView.ts      # chat inline en la nota activa (@agente)
    │   └── SanitySettingsTab.ts  # settings del plugin (proxy URL, token MCP)
    └── ui/
        └── components.ts        # toggles, dropdowns reutilizables
```

---

## 4. Modelo de datos (`src/types.ts`)

```ts
export interface AgentConfig {
  id: string;                  // = nombre de archivo sin extensión
  name: string;
  instructions: string;        // cuerpo del prompt del agente
  triggers: AgentTriggers;
  allowed_folders: string[];
  allowed_tags: string[];
  tools: AgentTool[];           // 'web' | 'github' | 'discord' | 'vault'
  model: string;                // 'auto' | id explícito
  max_actions: number;
}

export interface AgentTriggers {
  run_manual: boolean;
  on_new_chat: boolean;
  on_mentioned: boolean;
  on_vault_event?: {
    folders: string[];
    tags: string[];
    event: 'create' | 'modify' | 'both';
  };
}

export interface RunContext {
  agent: AgentConfig;
  note?: { path: string; content: string };   // nota disparadora (si hay)
  history?: ChatMessage[];                      // para chat inline
}

export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string; }

export interface AgentAction {
  tool: 'github' | 'vault' | 'none';
  op: string;                  // p.ej. 'create_issue', 'write_note'
  args: Record<string, unknown>;
}

export interface AgentResult {
  reasoning: string;           // chain-of-thought del modelo
  actions: AgentAction[];
  tokens: number;
}
```

---

## 5. Componentes clave (responsabilidad única)

- **`AgentConfigStore`** — `list()`, `get(id)`, `save(config)`; lee/escribe el
  frontmatter YAML de `Agents/*.md` (excluye `Agents/_logs/`).
- **`ContextCollector`** — dado `AgentConfig`, devuelve `RunContext` con las
  notas de `allowed_folders` cuyo frontmatter contenga algún `allowed_tag`.
  Determinista, sin IA ni exploración abierta.
- **`PromptBuilder`** — ensambla el system prompt obligando al modelo a los
  4 pasos (Leer → Identificar → Decidir → Ejecutar) y a devolver JSON
  `{ reasoning, actions[] }` respetando `max_actions`.
- **`LLMClient`** — una función `complete(messages): Promise<AgentResult>`.
  POST a `{GEMINI_PROXY_URL}/v1/chat/completions`, parsea el JSON delcontenido.
  Nunca reintenta con feedback del agente (sin bucles).
- **`MCPClient`** — arranca/llama al GitHub MCP server solo si alguna acción lo
  requiere; cachea la conexión por sesión del plugin.
- **`ActionExecutor`** — despacha `AgentAction[]`: `github` → MCPClient,
  `vault` → `app.vault.modify()`, `none` → no-op. Graba `_logs/<id>-<ts>.md`.
- **`AgentRunner`** — orquesta: `load config → collect context → build prompt
  → LLM (1 llamada) → execute actions → log`. Devuelve `AgentResult`.
- **`TriggerManager`** — suscribe a `vault.on('create'|'modify')`; si la nota
  matchea el `on_vault_event` de algún agente, invoca `AgentRunner`
  (con throttle/debounce para no disparar en cada keystroke).
- **Views** — `AgentConfigView` (Notion-style), `AgentListView`, `NoteChatView`
  (chat inline), `SanctumSettingsTab`.

---

## 6. Flujo de datos

```
[Trigger: manual / @agente / evento de vault]
   │
   ▼
AgentConfigStore.get(id) ──► AgentConfig
   │
   ▼
ContextCollector ──► RunContext  (notas de allowed_folders + allowed_tags)
   │
   ▼
PromptBuilder ──► messages[] (chain-of-thought obligatorio)
   │
   ▼
LLMClient ──POST──► {GEMINI_PROXY_URL}/v1/chat/completions   (1 sola llamada)
   │  ◄── JSON { reasoning, actions[] }
   ▼
ActionExecutor ──► GitHub MCP / vault.write
   │
   ▼
Agents/_logs/<id>-<ts>.md   +  respuesta en la UI/Nota
```

---

## 7. Mapeo UI ↔ Notion Agents

| Notion Agents | Implementación Obsidian |
|---|---|
| Sidebar de agentes | `AgentListView` (panel lateral izquierdo) |
| "Edit agent" panel (Triggers/Instructions/Tools/Model) | `AgentConfigView` con toggles y dropdown que escribe YAML al Save |
| `@agent` dentro de una página | `NoteChatView`: detecta `@agente` en la nota activa y renderiza burbujas de chat bajo el cursor |
| "New chat" trigger | Al abrir `NoteChatView` por primera vez en una nota |
| "Mentioned" trigger | Regex `@<agent-id>` en el contenido de la nota |
| Tools toggles (Web/GitHub/Discord/Vault folders) | Sección *Tools & access* en `AgentConfigView` → escribe `tools` y `allowed_folders` |
| Model selector | Dropdown (auto / ids soportados por el Proxy Balancer) |
| Run manual | Botón Run en `AgentListView` y comando *Run Sanctum Agent* |
| Agent logs/historial | `Agents/_logs/<id>-<ts>.md` mostrado en pestaña Logs |

---

## 8. Triggers automáticos (event-driven)

1. En `onload`, `TriggerManager` suscribe:
   - `app.vault.on('create', cb)`
   - `app.vault.on('modify', cb)`
2. Para cada agente cuyo `on_vault_event` esté activo, comprueba si la nota
   dispara:
   - ruta bajo `on_vault_event.folders` **y** frontmatter con algún
     `on_vault_event.tags` (si se definen), o sin filtro de tags si vacío.
3. Si matchea, lanza `AgentRunner` (async, no bloqueante; con debounce de
   **3 s** tras el último `modify` para evitar disparos por escritura continua).
4. Resultado se guarda en `Agents/_logs/` y, si el trigger es `on_mentioned`,
   se inserta respuesta inline bajo la mención.

---

## 9. Plan de implementación por fases

- **Fase A — Cimientos (strict TS)**: `manifest.json`, `package.json`,
  `tsconfig.json` strict, `types.ts`, `AgentConfigStore`, `FrontmatterParser`.
  *DoD: leer/escribir un agente YAML desde el vault.*
- **Fase B — Runtime interno**: `ContextCollector`, `PromptBuilder`,
  `LLMClient`, `ActionExecutor`, `AgentRunner`.
  *DoD: ejecutar un agente manualmente y ver `reasoning` + `actions` en consola.*
- **Fase C — MCP**: `MCPClient` + `tools.ts` (GitHub).
  *DoD: agente crea un issue vía acción `github`.*
- **Fase D — UI Notion-style**: `AgentConfigView`, `AgentListView`,
  `SanctumSettingsTab`, `styles.css`.
  *DoD: crear/editar un agente con toggles y dropdowns; Save escribe YAML.*
- **Fase E — Chat inline**: `NoteChatView`, detección de `@agente`.
  *DoD: chatear con un agente dentro de la nota activa.*
- **Fase F — Triggers automáticos**: `TriggerManager` con debounce.
  *DoD: crear nota en carpeta watched dispara el agente automáticamente.*

---

## 10. Cumplimiento de AGENTS.md

- **§1 Recolección determinista**: `ContextCollector` solo lee
  `allowed_folders`+`allowed_tags`, no explora el vault entero ni llama APIs
  abiertas. Si falta contexto, el agente devuelve `none` y lo reporta.
- **§2 TS estricto**: `strict: true`, cero `any` (usar `unknown`), interfaces
  exportadas en `types.ts`, un archivo una responsabilidad.
- **§3 Chain-of-thought**: `PromptBuilder` obliga los 4 pasos y salida JSON
  estructurada.
- **§4 Una sola llamada**: `AgentRunner` invoca `LLMClient.complete()` una
  vez; no hay bucle agente ↦ modelo ↦ agente.
- **§5 Control de acceso**: todo acceso a notas pasa por el filtro
  `allowed_folders` / `allowed_tags` de la config del agente; fuera → `none`.