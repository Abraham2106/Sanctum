# Roadmap de Sprints — Sanctum

Cada sprint asume que el anterior cerró con checkpoint OK. Si algo de un sprint
quedó incompleto, se mueve como primera tarea del siguiente.

---

## Sprint 2 — Bot de Discord + Agente B (Discord Summarizer)

**Objetivo**: tener recolección de Discord funcionando (sin IA) y el segundo
agente del MVP corriendo.

### Entregables
- [ ] `packages/bot/`: bot discord.js con permisos de solo lectura
- [ ] Comando que vuelca mensajes de un canal a `vault/Discord-logs/[canal].md`
- [ ] Nota YAML `vault/Agents/discord-summarizer.md`
- [ ] Reuso de `agent-runtime` para correr el Agente B (mismo `loadAgentConfig`,
      `collectContext`; nuevo `buildPrompt` específico para resumir)
- [ ] Output: `vault/Discord-logs/[canal]-summary.md`

### Notas
- El bot NO usa IA en ningún punto — es puro discord.js + escritura de archivos.
- Validar que `agent-runtime` es genérico: si Agente B requiere cambios en
  `collectContext` o `executeAction` que rompen al Agente A, refactorizar para
  que ambos compartan interfaz limpia.

---

## Sprint 3 — Robustez del Agent Runtime

**Objetivo**: el runtime deja de ser "feliz camino" y maneja casos reales.

### Entregables
- [ ] Manejo de errores: MCP no responde, modelo devuelve JSON inválido, etc.
- [ ] Logging estructurado de cada ejecución (timestamp, agente, tokens usados,
      acciones ejecutadas) → `vault/Agents/_logs/[fecha].md` o similar
- [ ] Límite configurable de acciones por ejecución (evitar que un agente cree
      20 issues de una)
- [ ] Modo "dry-run": el agente razona y propone acciones pero NO las ejecuta,
      las escribe en el vault para revisión manual
- [ ] Tests básicos para `loadAgentConfig`, `collectContext`, `buildPrompt`

### Notas
- Este sprint es el que da confianza para automatizar (triggers programados)
  en el sprint siguiente. No saltarlo.

---

## Sprint 4 — Obsidian Plugin (UI de Agentes)

**Objetivo**: panel visual dentro de Obsidian para gestionar agentes, similar
al mockup de Notion Agents ya diseñado.

### Entregables
- [ ] Scaffold del plugin (`packages/obsidian-plugin/`)
- [ ] Vista lateral con: Triggers, Instructions, Tools & access, Model selector, Save
- [ ] Al guardar, escribe/actualiza el YAML correspondiente en `vault/Agents/`
- [ ] Botón "Run agent" ejecuta `agent-runtime` (via child_process o API local)
- [ ] Selector visual de `allowed_folders` / `allowed_tags` (picker tipo el
      mockup ya generado)

### Notas
- Candidato ideal para Manager View / background de Antigravity, ya que es
  desacoplable del runtime (que ya está probado en Sprints 1-3).
- Si el scaffold tarda, se puede seguir operando los agentes por CLI mientras
  este sprint avanza en paralelo.

---

## Sprint 5 — Triggers automáticos + pulido

**Objetivo**: los agentes corren solos bajo condiciones, no solo manual.

### Entregables
- [ ] Trigger "scheduled" (ej. cron diario) para Discord Summarizer
- [ ] Trigger "mentioned" — detectar mención del agente en una nota y disparar
- [ ] Notificaciones de resultado (ej. mensaje al propio Discord cuando termina
      un agente)
- [ ] Dashboard/check de `/health` del Gemini Proxy Balancer — alertar si todas
      las keys entran en cooldown simultáneamente
- [ ] Revisión de costos acumulados (tokens totales / sprint) vs. baseline de
      Notion (400 créditos / 50s) — documentar el ahorro real

---

## Backlog / Fase 2 (sin sprint asignado todavía)
- RAG con embeddings si el vault supera ~200 notas
- Tercer agente (a definir según necesidad real, no especulativo)
- Permisos extendidos del bot de Discord (si se justifica)
- Ampliar pool de keys del Proxy Balancer / agregar más modelos a
  `GEMINI_MODELS` para fallback