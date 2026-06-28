---
name: "Discord Summarizer"
description: "Lee logs de Discord y genera resúmenes en el vault."
allowed_folders:
  - "Discord-logs"
  - "Agents"
allowed_tags:
  - "agent-access"
model: "gemini-2.5-flash"
tools:
  - "vault"
max_actions: 1
---
