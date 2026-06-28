# Sanctum

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

Self-hosted AI agent platform built on Obsidian. Agents are defined as markdown files in your vault, execute actions via GitHub MCP and Discord, and index knowledge locally with SQLite FTS5 for retrieval-augmented generation (RAG).

---

## Architecture

```
Obsidian Vault (agent configs + knowledge base)
       |
       v
agent-runtime (TypeScript, single model call per execution)
       |
       +-- loadAgentConfig   reads YAML frontmatter from vault/Agents/*.md
       +-- collectContext    scans vault filtered by allowed_folders/tags
       |   +-- VaultFileRetriever
       |   +-- GithubTrackerRetriever
       |   +-- DiscordLogRetriever
       +-- PromptBuilder     builds system prompt with 4-step chain-of-thought
       +-- callModel         single call to Gemini Proxy (OpenAI-compatible)
       +-- ExecutorRegistry  dispatches actions
           +-- github_issue_create/close via MCP
           +-- discord_send via discord.js
           +-- vault_write to vault
           +-- rag_index_folder + rag_search (local FTS5)
```

### Principles

- **Deterministic collection, expensive processing** -- context is gathered by scripts and MCPs, never by the AI. The model only processes what it receives.
- **One model call per execution** -- no agent loops, no iterative exploration.
- **Access control** -- each agent defines `allowed_folders` and `allowed_tags` to scope its context.

---

## Packages

| Package | Purpose |
|---|---|
| `agent-runtime` | Core engine: config loading, context collection, prompt building, model calling, action execution |
| `obsidian-plugin` | Obsidian UI: agent list, settings editor, chat interface, embedded HTTP server |
| `bot` | Discord daemon for channel sync |
| `rag-engine` | Local RAG with SQLite FTS5: map-reduce indexing, keyword search, snippet retrieval |

---

## Agents

| Agent | Tools | Role |
|---|---|---|
| `github-manager` | github, vault | Reads issues-tracker.json, creates/closes GitHub issues |
| `discord-summarizer` | vault | Summarizes Discord log JSON files into markdown |
| `daily-digest` | vault, discord | Consolidates summaries and sends to Discord |
| `forager` | vault, rag | Explores vault, extracts findings, writes research notes |
| `synthesizer` | vault, rag | Writes structured research documents from findings |
| `librarian` | vault, rag | Indexes vault into SQLite, answers queries using FTS5 retrieval |
| `generator` | github, vault, discord | Multi-agent workflow: generates action plan |
| `reflector` | github, vault, discord | Multi-agent workflow: reviews and corrects |
| `curator` | vault | Multi-agent workflow: documents lessons learned |

---

## Quick Start

### Requirements

- Node.js >= 18
- Obsidian (for the plugin)
- Gemini Proxy (or compatible OpenAI endpoint)
- GitHub token with `repo:full` scope
- Discord bot token (optional, for sending messages)

### 1. Install

```bash
git clone https://github.com/Abraham2106/Sanctum.git
cd Sanctum
npm install
cp .env.example .env
# Edit .env with your tokens
```

### 2. Run via CLI

```bash
# Run a single agent
npx tsx packages/agent-runtime/src/index.ts \
  --agent vault/Agents/github-manager.md

# Run a workflow
npx tsx packages/agent-runtime/src/index.ts \
  --workflow "Review open issues and create a project plan"
```

### 3. Run the API server

```bash
# Start HTTP server
npx tsx packages/agent-runtime/src/server.ts
# Server at http://localhost:3456

# List agents
curl http://localhost:3456/api/agents

# Execute an agent
curl -X POST http://localhost:3456/api/run \
  -H 'Content-Type: application/json' \
  -d '{"agentPath":"/path/to/vault/Agents/librarian.md","parameters":{"search_query":"authentication"}}'
```

### 4. Install the Obsidian plugin

```bash
# Build
cd packages/obsidian-plugin && npm run build

# Copy to vault
cp main.js manifest.json styles.css \
  ~/your-vault/.obsidian/plugins/sanctum-agent/

# Enable in Obsidian: Settings -> Community Plugins -> Sanctum Agent
```

---

## Configuration

### Environment Variables

[![env](https://img.shields.io/badge/config-.env-FF6C37)](.env.example)

| Variable | Required | Description |
|---|---|---|
| `GEMINI_PROXY_URL` | Yes | OpenAI-compatible endpoint for model inference |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `repo:full` scope |
| `GITHUB_OWNER` | No | GitHub owner (default: Abraham2106) |
| `GITHUB_REPO` | No | GitHub repo name (default: Sanctum) |
| `DISCORD_TOKEN` | No | Discord bot token for sending messages |
| `DISCORD_GUILD_ID` | No | Discord guild ID for sync |

### Agent Definition Format

```yaml
---
name: My Agent
description: What this agent does
allowed_folders:
  - Research
  - Agents
allowed_tags:
  - agent-access
model: gemini-2.5-flash
tools:
  - vault
  - github
  - rag
max_actions: 2
instructions: |
  Detailed instructions for the model to follow.
---
```

---

## Development

### Scripts

| Script | Description |
|---|---|
| `npm run build` | Build all packages |
| `npm run typecheck` | TypeScript strict checks across packages |
| `npm run test` | Run vitest suites |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |

### Testing

```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch
```

### Security

All user-facing API endpoints are localhost-only. SQLite FTS5 uses parameterized queries (no SQL injection). Vault writes are bounded to the vault directory (path traversal prevention). Request bodies are limited to 100KB.

---

## License

MIT
