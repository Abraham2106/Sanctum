# Proyecto: Sanctum (clon gratuito de Notion Agents sobre Obsidian)

## 1. Objetivo
Reemplazar los "Agents" de Notion (que consumieron 400 créditos en 50s) por un
sistema propio donde:
- La recolección de datos la hace el usuario o procesos deterministas (MCPs).
- La IA solo PROCESA contexto ya empaquetado (nunca explora APIs por su cuenta).
- Todo corre gratis: Obsidian + MCPs open source + Antigravity (Gemini Flash free tier).

## 2. Arquitectura formal

### 2.1 Componentes

| Componente | Rol | Tecnología |
|---|---|---|
| Obsidian Vault | Centro de datos / fuente de verdad | Markdown + YAML frontmatter |
| Obsidian MCP Plugin | Expone el vault como contexto consultable | `mcp-obsidian` (community plugin) |
| GitHub MCP | CRUD de Issues/Milestones | `@modelcontextprotocol/server-github`, token `repo:full` |
| Discord Bot (read-only) | Lee canales y entrega contenido al vault | discord.js, permisos: View Channels, Read Messages, Read Message History |
| Agent UI Plugin | Clon visual de Notion Agents (Triggers, Instructions, Tools, Model) | Plugin TypeScript de Obsidian |
| Agent Runtime | Ejecuta el chain-of-thought y llama a los MCPs | TypeScript, definido en notas YAML del vault |
| **Gemini Proxy Balancer** | **Proveedor de IA — gateway con rotación de keys, cooldowns y fallback de modelo** | **Python/FastAPI, servicio externo (Docker/Railway), API OpenAI-compatible** |

### 2.2 Principio de diseño rector
> "Recolección barata y determinista. Procesamiento caro y puntual."

- Recolección (gratis, sin IA): bot Discord, GitHub MCP queries, lectura de vault.
- Procesamiento (con IA, costo controlado): solo cuando el usuario dispara el agente,
  con el contexto ya armado y acotado por `allowed_folders` / tags.

### 2.3 Flujo de datos

```
[Usuario] --dispara agente-->
[Agent UI Plugin] --lee config YAML-->
[Agent Runtime] --recolecta contexto de--> [Vault: allowed_folders + tag agent-access]
[Agent Runtime] --construye prompt con chain-of-thought-->
[Agent Runtime] --POST /v1/chat/completions-->
[Gemini Proxy Balancer] --rota key, fallback de modelo si 429-->
[Gemini API] --responde-->
[Gemini Proxy Balancer] --200 OK-->
[Agent Runtime] --ejecuta acción via--> [GitHub MCP] / [Vault write]
```

> El Agent Runtime nunca llama a Gemini directamente ni gestiona API keys —
> siempre habla con el Proxy Balancer vía endpoint OpenAI-compatible
> (`GEMINI_PROXY_URL`). Esto aísla las keys del resto del sistema y permite
> agregar/quitar keys sin tocar `agent-runtime`.

### 2.4 Control de acceso a contexto
Cada agente (nota YAML) define:
```yaml
allowed_folders: [GitHub, Agents]
allowed_tags: [agent-access]
model: auto
tools: [github, vault]   # discord NO está aquí por defecto
```

### 2.5 Capas de implementación (orden de dependencia)
1. Vault + estructura de carpetas (GitHub/, Agents/, Discord-logs/)
2. GitHub MCP conectado y probado de forma aislada
3. Bot de Discord (solo lectura) escribiendo logs al vault
4. Agent Runtime (lógica de chain-of-thought + lectura YAML)
5. Agent UI Plugin (capa visual, al final)

---

## 3. Timeline de primeros prompts en Antigravity

### Sesión 1 (1–1.5h) — Fundación
**Prompt 1:**
> "Crea un AGENTS.md en la raíz del proyecto con estas reglas: [pegar principio
> de diseño rector + reglas de chain-of-thought]. También crea la estructura de
> carpetas del vault: GitHub/, Agents/, Discord-logs/, README.md"

**Prompt 2:**
> "Conecta el GitHub MCP server (@modelcontextprotocol/server-github) con mi
> token. Crea un script de prueba que liste los issues abiertos del repo X
> usando solo el MCP, sin generar texto adicional con IA — solo output crudo."

*Objetivo de la sesión: validar que el MCP de GitHub responde y que Antigravity
puede llamarlo sin gastar de más.*

### Sesión 2 (1–1.5h) — Recolección
**Prompt 3:**
> "Crea el scaffold de un bot de Discord en discord.py con permisos de solo
> lectura (View Channels, Read Messages, Read Message History). Su única función:
> al recibir un comando, vuelca los últimos N mensajes de un canal a un archivo
> markdown en Discord-logs/[canal].md"

**Prompt 4:**
> "Crea una nota YAML de ejemplo en Agents/ siguiendo este esquema: [pegar
> sección 2.4]. No implementes lógica todavía, solo el formato de configuración."

*Objetivo: tener datos reales fluyendo al vault sin tocar IA todavía.*

### Sesión 3 (1.5–2h) — Agent Runtime
**Prompt 5:**
> "Implementa un script (Python o TS) que: 1) lea una nota YAML de Agents/,
> 2) recolecte el contexto de las carpetas/tags permitidos, 3) construya un
> prompt con el formato chain-of-thought definido en AGENTS.md, 4) llame al
> modelo solo UNA vez con ese contexto, 5) si la respuesta incluye una acción
> de GitHub, ejecútala via MCP. Agrega logging de tokens usados por ejecución."

*Objetivo: el corazón del sistema funcionando end-to-end con un agente de prueba.*

### Sesión 4 (2h, puede ir en Manager View / background) — UI Plugin
**Prompt 6 (lanzar en background mientras se hace otra cosa):**
> "Crea el scaffold de un plugin de Obsidian en TypeScript que muestre un panel
> lateral con la UI de configuración de agentes: Triggers (run manual, new chat,
> mentioned + toggle), Instructions (textarea), Tools & access (toggles para
> Web, GitHub, Discord, Vault folders), Model selector, botón Save. Al guardar,
> escribe/actualiza la nota YAML correspondiente en Agents/."

*Objetivo: capa visual conectada al runtime ya probado.*

---

## 4. Checkpoints de control de costo
Después de cada sesión, revisar:
- ¿Cuántas llamadas al modelo se hicieron? (debería ser 1 por ejecución de agente)
- ¿El agente intentó "explorar" algo no provisto en el contexto? Si sí, ajustar
  AGENTS.md / prompt antes de seguir.
- ¿El MCP de GitHub/Discord funcionó sin pasar por la IA para la recolección?

## 5. Pendiente fase 2
- Proxy balancer multi-modelo
- RAG con embeddings (solo si el vault supera ~200 notas)
- Discord bot con más permisos (si se decide más adelante)