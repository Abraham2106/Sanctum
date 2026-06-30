# Roadmap de Sprints — Sanctum

Cada sprint asume que el anterior cerró con checkpoint OK. Si algo de un sprint
quedó incompleto, se mueve como primera tarea del siguiente.

---

## Sprint 1 — Fundación (COMPLETED ✅)

- [x] Agent Runtime base (loadAgentConfig, collectContext, PromptBuilder, callModel)
- [x] Action Executors (github, vault, discord, rag)
- [x] MCP client for GitHub integration
- [x] RAG Engine (SQLite FTS5 + embeddings)
- [x] Multi-agent workflow (Generator → Reflector → Curator)
- [x] Tests para loadAgentConfig, PromptBuilder, ExecutorRegistry

---

## Sprint 2 — Bot de Discord + Discord Summarizer (COMPLETED ✅)

**Objetivo**: recolección de Discord funcionando y el segundo agente del MVP.

### Entregables
- [x] `packages/bot/`: bot discord.js con permisos de solo lectura
- [x] Comando `!sync` que vuelca mensajes a `vault/Discord-logs/[channel].json`
- [x] Comando `!resumen` que invoca agent-runtime programáticamente
- [x] Nota YAML `vault/Agents/discord-summarizer.md`
- [x] Reuso de `agent-runtime` para el Agente B (mismo runtime, distinto prompt)
- [x] Output: resumen via `discord_send` al canal
- [x] Sync periódico automático cada 1 hora
- [x] Tests unitarios (sync helpers, schema validation, meta management)

### Notas
- El bot NO usa IA directamente — es discord.js + escritura de archivos
- `agent-runtime` es genérico: ambos agentes comparten interfaz limpia
- Módulo CommonJS → ESM pendiente para consistencia total del monorepo

---

## Sprint 3 — Robustez del Agent Runtime (COMPLETED ✅)

**Objetivo**: el runtime maneja casos reales con logging y modo seguro.

### Entregables
- [x] Manejo de errores: MCP no responde, JSON inválido, etc.
- [x] Logging estructurado (`Logger.ts`) con timestamp, agente, tokens, acciones
- [x] Logs persistidos en `vault/Agents/_logs/[fecha].md`
- [x] Límite configurable de acciones por ejecución (`max_actions`)
- [x] Modo `--dry-run`: el agente razona y propone acciones pero NO las ejecuta
- [x] Captura de uso de tokens desde el proxy (`ModelResponse.usage`)
- [x] Tests para loadAgentConfig, PromptBuilder, ExecutorRegistry

### Notas
- El Logger reemplaza los console.log crudos con entradas estructuradas
- Dry-run modo CLI (`--dry-run`) y API (`{ dryRun: true }`)

---

## Sprint 4 — Obsidian Plugin (UI de Agentes) (COMPLETED ✅)

**Objetivo**: panel visual dentro de Obsidian para gestionar agentes.

### Entregables
- [x] Scaffold del plugin (`packages/obsidian-plugin/`)
- [x] Vista lateral con: agente list, config editor, chat, historial
- [x] Al guardar, escribe/actualiza el YAML en `vault/Agents/`
- [x] Botón "Run agent" ejecuta `agent-runtime` via API local
- [x] Selector visual de `allowed_folders` / `allowed_tags`
- [x] Chat inline con detección de `@agente` mentions
- [x] Persistencia de sesiones de chat (`.sanctum_chats.json`)
- [x] Vista de historial de chats con Load/Delete
- [x] Dark theme Obsidian-integrado (sin colores hardcodeados)
- [x] Custom dropdown (reemplaza `<select>` nativo que mostraba blanco en Electron)
- [x] Tests para FrontmatterParser, schema validation, ChatStorage

---

## Sprint 5 — Triggers automáticos + pulido (COMPLETED ✅)

**Objetivo**: los agentes corren solos bajo condiciones, no solo manual.

### Entregables
- [x] **Trigger "scheduled"** — `Scheduler.ts` con formato cron simplificado
  - `*/N * * * *` → cada N minutos
  - `HH:MM` → hora fija diaria
  - Jobs persistidos en `vault/Agents/_schedule.json`
  - CLI: `npx tsx src/index.ts --scheduler`
- [x] **Trigger "mentioned"** — `MentionWatcher.ts` con fs.watch recursivo
  - Detecta `@agentId` en archivos .md del vault
  - Debounce de 500ms para evitar falsos positivos
  - CLI: `npx tsx src/index.ts --mention`
- [x] **Notificaciones** — `Notifier.ts` envía resultados a Discord
  - Mensaje formateado con título, cuerpo, color
  - Reusa `sendMessage` del DiscordActionExecutor
- [x] **Health dashboard** — endpoint `/api/health`
  - Checks de: vault, proxy, discord token, github token
  - Status: healthy / degraded con detalle por check
- [x] **Scheduled triggers** via `TriggerManager` en Obsidian
  - Eventos `create` / `modify` en carpetas vigiladas
  - Filtro por tags en frontmatter
  - Debounce configurable (settings → triggerDebounceMs)
- [x] **Cost review** documentado en Sprints.md

### Cost Review — Estimación vs Baseline

| Métrica | Baseline Notion (400 créditos / 50s) | Sanctum actual |
|---------|--------------------------------------|----------------|
| Modelo | Gemini 2.0 Flash (gratuito o ~$0.15/1M tokens) | Gemini 2.0 Flash vía proxy |
| Costo por ejecución típica | ~$0.01-0.05 (créditos Notion) | ~$0.0003-0.001 (Gemini) |
| Tokens por ejecución | ~2,000-10,000 | ~1,500-5,000 (prompts optimizados CoT) |
| Almacenamiento | Notion cloud (gratuito hasta cierto límite) | Vault local (sin costo) |
| Hosting bot | Notion servers | Propio (VPS o local) |
| API externas | limitadas por plan Notion | GitHub MCP (gratuito), Discord (gratuito) |

**Ahorro estimado**: 10x-50x vs Notion Agents, dependiendo del volumen de uso.
El proxy balancer permite rotar entre múltiples keys de Gemini para maximizar el
free tier. Sin costos ocultos de suscripción.

### Pendientes (low priority)
- [ ] Módulo CommonJS → ESM en `packages/bot/`
- [ ] Más tests de integración para triggers

---

## Backlog / Fase 2 (sin sprint asignado todavía)
- RAG con embeddings si el vault supera ~200 notas
- Tercer agente (a definir según necesidad real)
- Permisos extendidos del bot de Discord
- Ampliar pool de keys del Proxy Balancer
- Dashboard web embebido en Obsidian
