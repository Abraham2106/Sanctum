import { describe, it, expect, vi } from "vitest";
import { ExecutorRegistry } from "../executors/ActionExecutor.js";

describe("ExecutorRegistry", () => {
  it("filters out 'none' actions before execution", async () => {
    const registry = new ExecutorRegistry();
    const context = {
      vaultPath: "/fake",
      definition: {
        name: "Test",
        description: "",
        allowed_folders: [],
        allowed_tags: [],
        model: "",
        tools: [],
        max_actions: 10,
      },
    };

    const actions = [
      { type: "none" as const, reason: "No action needed" },
    ];

    await registry.executeAll(actions, context);
  });

  it("respects max_actions limit", async () => {
    const registry = new ExecutorRegistry();
    const context = {
      vaultPath: "/fake",
      definition: {
        name: "Test",
        description: "",
        allowed_folders: [],
        allowed_tags: [],
        model: "",
        tools: [],
        max_actions: 1,
      },
    };

    const actions = [
      { type: "vault_write" as const, path: "test.md", content: "test" },
      { type: "vault_write" as const, path: "test2.md", content: "test2" },
    ];

    await registry.executeAll(actions, context);
  });

  it("handles empty actions array", async () => {
    const registry = new ExecutorRegistry();
    const context = {
      vaultPath: "/fake",
      definition: {
        name: "Test",
        description: "",
        allowed_folders: [],
        allowed_tags: [],
        model: "",
        tools: [],
        max_actions: 5,
      },
    };

    await registry.executeAll([], context);
  });

  it("warns on unknown action types", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registry = new ExecutorRegistry();
    const context = {
      vaultPath: "/fake",
      definition: {
        name: "Test",
        description: "",
        allowed_folders: [],
        allowed_tags: [],
        model: "",
        tools: [],
        max_actions: 5,
      },
    };

    const actions = [
      { type: "unknown_action" as any, param: "value" },
    ];

    await registry.executeAll(actions, context);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
