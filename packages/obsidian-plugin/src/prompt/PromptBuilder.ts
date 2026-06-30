import { ChatMessage, AgentConfig, AgentNote } from '../types';

const SYSTEM_PROMPT = `You are a Sanctum Agent. Your role is to process context and execute actions.

Follow this chain-of-thought process:

1. **Leer y Entender (Read & Understand)**: Analyze the provided context data thoroughly.
2. **Identificar (Identify)**: Find what tasks require action. Discard any that are already resolved.
3. **Decidir (Decide)**: Determine exactly which actions to execute, respecting the maximum of {max_actions} actions.
4. **Ejecutar (Execute)**: Output a JSON object with your reasoning and the actions to perform.

Available tools: {tools}

Agent instructions:
{instructions}

Context ({note_count} notes):
{context}

Respond ONLY with a valid JSON object in this exact format:
{
  "reasoning": "Your chain-of-thought reasoning here",
  "actions": [
    { "tool": "github", "op": "create_issue", "args": { "title": "...", "body": "..." } },
    { "tool": "vault", "op": "write_note", "args": { "path": "...", "content": "..." } },
    { "tool": "vault", "op": "create_folder", "args": { "path": "..." } },
    { "tool": "vault", "op": "tag_note", "args": { "path": "...", "tags": ["tag1", "tag2"] } }
  ]
}

If no action is needed, return an empty actions array.`;

const CHAT_PROMPT = `You are a Sanctum Agent named "{name}".

Agent instructions:
{instructions}

Current note context:
{context}

You are chatting with the user. Be helpful and respond in natural language.

## Available tools: {tools}

To execute an action, include a JSON action block in your response on its own line starting with "ACTION:".
The system will automatically execute it and tell you the result.

Example:
I will create the folder now.
ACTION: { "tool": "vault", "op": "create_folder", "args": { "path": "Research/Topic" } }
Now I will write the first note.
ACTION: { "tool": "vault", "op": "write_note", "args": { "path": "Research/Topic/note1.md", "content": "# Note title\\n\\nContent here..." } }

Available operations:
- vault: create_folder (args: path), write_note (args: path, content), tag_note (args: path, tags)
- github: any GitHub MCP tool name (args: depends on tool)

You can include multiple ACTION blocks. They will be removed from the visible response after execution.
Conversation history will follow.`.trim();

export class PromptBuilder {
  build(agent: AgentConfig, notes: AgentNote[], userInput?: string): ChatMessage[] {
    const tools = agent.tools.length > 0 ? agent.tools.join(', ') : 'none';
    const context = notes.map(n => `--- ${n.path} ---\n${n.content}\n---`).join('\n\n');

    const system = SYSTEM_PROMPT
      .replace('{max_actions}', String(agent.max_actions))
      .replace('{tools}', tools)
      .replace('{instructions}', agent.instructions)
      .replace('{note_count}', String(notes.length))
      .replace('{context}', context || '(no context)');

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
    ];

    if (userInput) {
      messages.push({ role: 'user', content: userInput });
    } else {
      messages.push({ role: 'user', content: 'Run the agent according to its instructions.' });
    }

    return messages;
  }

  buildChatPrompt(agent: AgentConfig, notes: AgentNote[], history: ChatMessage[], userInput: string): ChatMessage[] {
    const tools = agent.tools.join(', ') || 'none';
    const context = notes.map(n => `--- ${n.path} ---\n${n.content}\n---`).join('\n\n');

    const system = CHAT_PROMPT
      .replace('{name}', agent.name)
      .replace('{instructions}', agent.instructions)
      .replace('{context}', context || '(no note context)')
      .replace('{tools}', tools);

    return [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: userInput },
    ];
  }
}
