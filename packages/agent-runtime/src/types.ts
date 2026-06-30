export interface AgentConfig {
  name: string;
  description: string;
  allowed_folders: string[];
  allowed_tags: string[];
  model: string;
  tools: string[];
  max_actions?: number;
  instructions?: string | undefined; // Instrucciones específicas del agente (frontmatter)
}

export type AgentDefinition = AgentConfig;

export interface AgentInvocation {
  definition: AgentDefinition;
  vaultPath: string;
  noContext: boolean;
  parameters: {
    channel_id?: string;
    triggered_by?: string;
    server_channels?: Array<{ id: string; name: string }>;
    [key: string]: any;
  };
  contextFragments: ContextFragment[];
  contextString: string;
}


export interface ContextFragment {
  source: string;   // Relpath to vault, e.g. "GitHub/Issues tracker.md"
  content: string;  // Content of the note
}

export type AgentAction =
  | { type: "github_issue_create"; title: string; body: string; labels?: string[]; parent_issue?: number | null }
  | { type: "github_issue_close"; issue_number: number }
  | { type: "vault_write"; path: string; content: string }
  | { type: "discord_send"; channel_id: string; content: string }
  | { type: "rag_index_folder"; folder?: string }
  | { type: "rag_search"; query: string; limit?: number; folder?: string }
  | { type: "none"; reason: string };

export interface ModelResponse {
  reasoning: {
    step1_read: string;
    step2_identify: string;
    step3_decide: string;
    step4_execute: string;
  };
  actions: AgentAction[];
  usage?: {
    totalTokens: number;
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface TrackerIssue {
  github_number: number | null;
  title: string;
  status: "open" | "closed" | "pending";
  labels: string[];
  created_at: string;
  parent_issue: number | null;
  children: number[];
}

export interface RepoTracker {
  issues: TrackerIssue[];
}

export interface IssuesTracker {
  $schema: string;
  tags?: string[];
  repos: Record<string, RepoTracker>;
}


