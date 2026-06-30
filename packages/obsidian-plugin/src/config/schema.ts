import { z } from 'zod';
import type { AgentConfig } from '../types';

export const agentToolSchema = z.enum(['web', 'github', 'discord', 'vault']);

export const vaultEventTypeSchema = z.enum(['create', 'modify', 'both']);

const DEFAULT_TRIGGERS = {
  run_manual: true,
  on_new_chat: false,
  on_mentioned: false,
} as const;

export const agentScheduleSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMinutes: z.number().int().min(1).optional(),
  dailyAt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
}).optional();

export const agentTriggersSchema = z.object({
  run_manual: z.boolean().default(DEFAULT_TRIGGERS.run_manual),
  on_new_chat: z.boolean().default(DEFAULT_TRIGGERS.on_new_chat),
  on_mentioned: z.boolean().default(DEFAULT_TRIGGERS.on_mentioned),
  on_vault_event: z.object({
    folders: z.array(z.string()),
    tags: z.array(z.string()),
    event: vaultEventTypeSchema,
  }).optional(),
});

export const agentConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  instructions: z.string().default(''),
  triggers: agentTriggersSchema.default(DEFAULT_TRIGGERS),
  schedule: agentScheduleSchema,
  chain_next: z.string().optional(),
  allowed_folders: z.array(z.string()).default([]),
  allowed_tags: z.array(z.string()).default([]),
  tools: z.array(agentToolSchema).default([]),
  model: z.string().default('auto'),
  max_actions: z.number().int().min(1).default(3),
});

export function parseAgentConfig(data: Record<string, unknown>, fallbackId: string): AgentConfig | null {
  const result = agentConfigSchema.safeParse(data);
  if (!result.success) {
    console.warn('[Sanctum] Invalid agent config, using defaults:', result.error.errors);
    return null;
  }
  return {
    id: result.data.id ?? fallbackId,
    name: result.data.name,
    instructions: result.data.instructions,
    triggers: result.data.triggers,
    schedule: result.data.schedule,
    chain_next: result.data.chain_next,
    allowed_folders: result.data.allowed_folders,
    allowed_tags: result.data.allowed_tags,
    tools: result.data.tools,
    model: result.data.model,
    max_actions: result.data.max_actions,
  } as AgentConfig;
}
