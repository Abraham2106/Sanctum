export type AgentTool = 'web' | 'github' | 'discord' | 'vault';

export type VaultEventType = 'create' | 'modify' | 'both';

export interface AgentSchedule {
  enabled: boolean;
  intervalMinutes?: number;
  dailyAt?: string;
}

export interface AgentTriggers {
  run_manual: boolean;
  on_new_chat: boolean;
  on_mentioned: boolean;
  on_vault_event?: {
    folders: string[];
    tags: string[];
    event: VaultEventType;
  };
}

export interface AgentConfig {
  id: string;
  name: string;
  instructions: string;
  triggers: AgentTriggers;
  schedule?: AgentSchedule;
  allowed_folders: string[];
  allowed_tags: string[];
  tools: AgentTool[];
  model: string;
  max_actions: number;
}

export interface AgentNote {
  path: string;
  content: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface RunContext {
  agent: AgentConfig;
  note?: AgentNote;
  history?: ChatMessage[];
  user_input?: string;
}

export interface AgentAction {
  tool: 'github' | 'vault' | 'none';
  op: string;
  args: Record<string, unknown>;
}

export interface AgentResult {
  reasoning: string;
  actions: AgentAction[];
  tokens: number;
}
