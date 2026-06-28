---
name: "Daily Digest"
description: "Lee los trackers y resúmenes de discord para redactar y enviar un resumen diario consolidado a Discord."
model: "gemini-2.5-flash"
allowed_folders:
  - "Agents"
  - "GitHub"
  - "Discord-logs"
allowed_tags:
  - "agent-access"
tools:
  - "vault"
  - "discord"
max_actions: 1
---

Lee todo el contexto provisto y genera un reporte breve y amigable. No excedas de 1500 caracteres y asegúrate de enviar solo una acción discord_send.
