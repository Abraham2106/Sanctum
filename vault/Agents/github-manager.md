---
name: GitHub Manager
description: Lee tareas del vault y gestiona Issues en GitHub.
allowed_folders:
  - GitHub
  - Agents
allowed_tags:
  - agent-access
model: gemini-2.5-flash
tools:
  - github
max_actions: 1
---

# GitHub Manager

Agente encargado de sincronizar tareas del vault con Issues de GitHub.
