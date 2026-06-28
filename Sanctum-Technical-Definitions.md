# Sanctum — Definiciones técnicas (stack, casos de uso, código)

## 1. Stack tecnológico

| Capa | Tecnología | Notas |
|---|---|---|
| Lenguaje principal | TypeScript / Node.js | Unifica bot, runtime y plugin |
| Plugin Obsidian | TypeScript (Obsidian Plugin API) | UI de agentes |
| Bot Discord | TypeScript + discord.js | Solo lectura |
| Agent Runtime | TypeScript (Node script/CLI) | Chain-of-thought + llamadas MCP |
| **Proveedor de IA** | **Gemini Proxy Balancer (FastAPI/Python, externo)** | **API OpenAI-compatible `/v1/chat/completions`, rotación de keys Gemini, fallback de modelo. `agent-runtime` lo consume via `GEMINI_PROXY_URL`** |
| GitHub MCP | `@modelcontextprotocol/server-github` (oficial) | Node, vía npx |
| Obsidian MCP | `mcp-obsidian` (community) | Node |
| IDE / orquestación inicial | Antigravity (Gemini Flash, free tier) | Para scaffolding |
| Config de agentes | YAML + Markdown frontmatter | Dentro del vault |
| Package manager | npm o pnpm | A elección, recomendado pnpm para monorepo |

> **Nota sobre el Proxy**: vive como repo/servicio separado (Python, fuera del
> monorepo TS), desplegado en Railway o Docker local. `agent-runtime` solo
> necesita la variable `GEMINI_PROXY_URL` y habla `/v1/chat/completions`
> formato OpenAI — `callModel.ts` se implementa contra ese contrato, no contra
> el SDK de Gemini directamente.

## 2. Casos de uso del MVP (2 agentes)

### Agente A — "GitHub Manager"
- **Trigger**: manual (botón "Run agent") o cuando se menciona en una nota.
- **Input**: notas en `vault/GitHub/` con tag `agent-access` (ej. lista de tareas pendientes escritas por el usuario).
- **Acción**: lee las tareas, decide qué Issues crear/cerrar/asignar a Milestones, ejecuta vía GitHub MCP.
- **Output**: actualiza `vault/GitHub/Issues tracker.md` con el resultado (qué se creó/cerró).
- **Chain-of-thought esperado**: "Leo tareas pendientes → identifico cuáles ya tienen issue → decido crear/cerrar/asignar → ejecuto → resumo cambios."

### Agente B — "Discord Summarizer"
- **Trigger**: manual, o programado (ej. una vez al día).
- **Input**: archivos `vault/Discord-logs/[canal].md` generados por el bot (solo lectura, sin IA).
- **Acción**: resume los mensajes nuevos desde la última corrida, extrae action items si los hay.
- **Output**: escribe `vault/Discord-logs/[canal]-summary.md` con el resumen.
- **Chain-of-thought esperado**: "Leo mensajes nuevos → filtro ruido → identifico temas/decisiones → genero resumen corto → marco action items si existen."

### Regla común a ambos
- Una sola llamada al modelo por ejecución.
- El contexto se arma 100% antes de llamar al modelo (recolección ya hecha por bot/MCP, sin IA).
- Si el agente "necesita más info" que no está en el contexto, debe decirlo en el output, no buscarla.

## 3. Patrón de arquitectura de código

Monorepo, organizado por servicio desde el día 1 (escalable sin reestructurar después):

```
vault-agents/
├── AGENTS.md                  # reglas globales para Antigravity / agentes de código
├── package.json                # workspace root (pnpm/npm workspaces)
├── pnpm-workspace.yaml
│
├── vault/                       # el Obsidian vault en sí (datos, no código)
│   ├── Agents/
│   │   ├── github-manager.md   # config YAML del Agente A
│   │   └── discord-summarizer.md
│   ├── GitHub/
│   │   └── Issues tracker.md
│   └── Discord-logs/
│       └── general.md
│
├── packages/
│   ├── bot/                     # Bot de Discord (solo lectura)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── writeToVault.ts
│   │   └── package.json
│   │
│   ├── agent-runtime/            # Lógica compartida: lee YAML, arma contexto, llama modelo
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── loadAgentConfig.ts
│   │   │   ├── collectContext.ts   # respeta allowed_folders / allowed_tags
│   │   │   ├── buildPrompt.ts      # inyecta chain-of-thought
│   │   │   ├── callModel.ts        # POST a GEMINI_PROXY_URL, formato OpenAI
│   │   │   └── executeAction.ts    # despacha a MCP (github, vault write)
│   │   └── package.json
│   │
│   ├── mcp-configs/               # configuración/wrappers de MCP servers
│   │   ├── github.config.json
│   │   └── obsidian.config.json
│   │
│   └── obsidian-plugin/           # UI del plugin (fase final)
│       ├── src/
│       │   ├── main.ts
│       │   └── AgentSettingsView.ts
│       └── manifest.json
│
├── proxy/                          # (opcional) submódulo/symlink al repo
│   └── gemini-proxy-balancer/      # gemini-proxy-balancer — repo Python independiente
│                                    # se despliega aparte (Docker/Railway), no
│                                    # forma parte del workspace TS
│
└── docs/
    ├── arquitectura.md            # (este conjunto de .md)
    └── timeline.md
```

### Principios del patrón
- `agent-runtime` es el núcleo reusable — ambos agentes (A y B) lo usan, solo cambia
  el YAML de config y el `buildPrompt` específico.
- `bot/` y `mcp-configs/` no dependen de IA — son recolección pura.
- `obsidian-plugin/` consume `agent-runtime` como librería cuando esté listo;
  hasta entonces, los agentes se corren por CLI desde `agent-runtime`.

## 4. Patrón de codificación CON agentes (workflow Antigravity)

- **Una tarea = un prompt = un módulo.** No pedir "construye todo el runtime" de una.
  Pedir "implementa `loadAgentConfig.ts` que lea el YAML y valide el esquema."
- **AGENTS.md como contrato persistente.** Reglas que aplican a TODO lo que
  Antigravity genere: TypeScript estricto, sin `any`, un solo archivo por
  responsabilidad, comentarios solo donde la lógica no es obvia.
- **Verificación aislada por módulo.** Cada archivo de `agent-runtime/src/` se
  prueba con un script o test simple antes de pasar al siguiente.
- **Manager View (background) solo para piezas independientes**, como
  `obsidian-plugin` scaffold, mientras se itera en `agent-runtime` en el
  Editor View principal.
- **Costo del propio Antigravity**: como tiene límite diario en el free tier,
  priorizar prompts de generación de código (alto valor) y resolver bugs
  triviales manualmente para no gastar requests.