import { describe, it, expect } from "vitest";
import { PromptBuilder } from "../PromptBuilder.js";

function makeInvocation(overrides: Record<string, any> = {}) {
  return {
    definition: {
      name: "Test Agent",
      description: "Test",
      allowed_folders: ["Research"],
      allowed_tags: ["agent-access"],
      model: "gemini-2.5-flash",
      tools: ["vault", "github", "discord", "rag"],
      max_actions: 2,
      instructions: "Eres un agente de prueba.",
      ...overrides,
    },
    vaultPath: "/fake/vault",
    noContext: false,
    parameters: {
      channel_id: "123456",
      triggered_by: "test-user",
    },
    contextFragments: [
      { source: "Research/test.md", content: "Contenido de prueba" },
    ],
    contextString: "## [Research/test.md]\n\nContenido de prueba",
  };
}

describe("PromptBuilder", () => {
  it("builds system prompt with agent name", () => {
    const { systemPrompt } = PromptBuilder.build(makeInvocation());
    expect(systemPrompt).toContain("Test Agent");
    expect(systemPrompt).toContain("Sanctum");
  });

  it("includes tool schemas for github", () => {
    const { systemPrompt } = PromptBuilder.build(
      makeInvocation({ tools: ["github"] })
    );
    expect(systemPrompt).toContain("github_issue_create");
    expect(systemPrompt).toContain("github_issue_close");
    expect(systemPrompt).not.toContain("vault_write");
  });

  it("includes tool schemas for vault", () => {
    const { systemPrompt } = PromptBuilder.build(
      makeInvocation({ tools: ["vault"] })
    );
    expect(systemPrompt).toContain("vault_write");
  });

  it("includes tool schemas for discord", () => {
    const { systemPrompt } = PromptBuilder.build(
      makeInvocation({ tools: ["discord"] })
    );
    expect(systemPrompt).toContain("discord_send");
  });

  it("includes tool schemas for rag", () => {
    const { systemPrompt } = PromptBuilder.build(
      makeInvocation({ tools: ["rag"] })
    );
    expect(systemPrompt).toContain("rag_index_folder");
    expect(systemPrompt).toContain("rag_search");
  });

  it("includes multiple tool schemas when multiple tools", () => {
    const { systemPrompt } = PromptBuilder.build(
      makeInvocation({ tools: ["vault", "github", "discord", "rag"] })
    );
    expect(systemPrompt).toContain("vault_write");
    expect(systemPrompt).toContain("github_issue_create");
    expect(systemPrompt).toContain("discord_send");
    expect(systemPrompt).toContain("rag_index_folder");
  });

  it("always includes none action", () => {
    const { systemPrompt } = PromptBuilder.build(makeInvocation());
    expect(systemPrompt).toContain("none");
  });

  it("includes channel_id in prompt when provided", () => {
    const { systemPrompt } = PromptBuilder.build(makeInvocation());
    expect(systemPrompt).toContain("123456");
    expect(systemPrompt).toContain("test-user");
  });

  it("includes context in user message", () => {
    const { userMessage } = PromptBuilder.build(makeInvocation());
    expect(userMessage).toContain("Research/test.md");
    expect(userMessage).toContain("Contenido de prueba");
  });

  it("includes max_actions limit", () => {
    const { systemPrompt } = PromptBuilder.build(
      makeInvocation({ max_actions: 5 })
    );
    expect(systemPrompt).toContain("5");
  });

  it("handles empty context", () => {
    const { userMessage } = PromptBuilder.build(
      makeInvocation({
        contextFragments: [],
        contextString: "",
      })
    );
    expect(userMessage.length).toBeGreaterThan(0);
    expect(userMessage).toContain("CONTEXTO DEL VAULT");
  });
});
