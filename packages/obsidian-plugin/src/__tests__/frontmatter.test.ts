import { describe, it, expect } from "vitest";
import { parseFrontmatter, stringifyFrontmatter } from "../context/FrontmatterParser";
import { parseAgentConfig } from "../config/schema";

describe("FrontmatterParser", () => {
  it("parses a valid frontmatter", () => {
    const content = `---
name: test-agent
tools:
  - github
  - vault
---
# Body content here`;
    const result = parseFrontmatter<Record<string, unknown>>(content);
    expect(result).not.toBeNull();
    expect(result!.data.name).toBe("test-agent");
    expect(result!.data.tools).toEqual(["github", "vault"]);
    expect(result!.body.trim()).toBe("# Body content here");
  });

  it("returns null for content without frontmatter", () => {
    expect(parseFrontmatter("# Just a heading")).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(parseFrontmatter("")).toBeNull();
  });

  it("returns null for empty frontmatter (no keys)", () => {
    const result = parseFrontmatter("---\n---\nbody text");
    expect(result).toBeNull();
  });

  it("stringifies and back-parses", () => {
    const data = { name: "test", tools: ["vault"] };
    const fm = stringifyFrontmatter(data, "content");
    const parsed = parseFrontmatter<Record<string, unknown>>(fm);
    expect(parsed).not.toBeNull();
    expect(parsed!.data.name).toBe("test");
    expect(parsed!.body.trim()).toBe("content");
  });

  it("handles tags array", () => {
    const content = `---
tags:
  - agent-access
  - test
---`;
    const result = parseFrontmatter<Record<string, unknown>>(content);
    expect(result).not.toBeNull();
    expect(result!.data.tags).toEqual(["agent-access", "test"]);
  });
});

describe("agentConfigSchema", () => {
  it("parses a valid config", () => {
    const config = parseAgentConfig(
      { name: "My Agent", tools: ["github"], max_actions: 5 },
      "my-agent"
    );
    expect(config).not.toBeNull();
    expect(config!.name).toBe("My Agent");
    expect(config!.id).toBe("my-agent");
    expect(config!.max_actions).toBe(5);
    expect(config!.tools).toEqual(["github"]);
  });

  it("returns null for invalid config (missing name)", () => {
    const config = parseAgentConfig({ tools: [] }, "fallback");
    expect(config).toBeNull();
  });

  it("applies defaults for optional fields", () => {
    const config = parseAgentConfig({ name: "Minimal" }, "minimal");
    expect(config).not.toBeNull();
    expect(config!.max_actions).toBe(3);
    expect(config!.model).toBe("auto");
    expect(config!.triggers.run_manual).toBe(true);
    expect(config!.tools).toEqual([]);
  });

  it("validates tool values", () => {
    const config = parseAgentConfig(
      { name: "Bad Tools", tools: ["web", "invalid_tool"] },
      "bad-tools"
    );
    expect(config).toBeNull();
  });
});

describe("matchesFolder (ported from TriggerManager)", () => {
  function matchesFolder(path: string, folders: string[]): boolean {
    if (folders.length === 0) return true;
    return folders.some((f) => path.startsWith(f + "/") || path === f + ".md");
  }

  it("returns true when no folders filter", () => {
    expect(matchesFolder("anything.md", [])).toBe(true);
  });

  it("matches file directly in folder", () => {
    expect(matchesFolder("Research/notes.md", ["Research"])).toBe(true);
  });

  it("matches file in nested path", () => {
    expect(matchesFolder("Research/Sub/notes.md", ["Research"])).toBe(true);
  });

  it("returns false for non-matching folder", () => {
    expect(matchesFolder("Other/notes.md", ["Research"])).toBe(false);
  });

  it("matches exact file path", () => {
    expect(matchesFolder("Research.md", ["Research"])).toBe(true);
  });

  it("does partial prefix match (Research vs ResearchX)", () => {
    expect(matchesFolder("ResearchX/notes.md", ["Research"])).toBe(false);
  });
});

describe("matchesTag (ported from TriggerManager)", () => {
  function matchesTag(content: string, tags: string[]): boolean {
    if (tags.length === 0) return true;
    const parsed = parseFrontmatter<Record<string, unknown>>(content);
    if (!parsed) return false;
    const rawTags = parsed.data.tags;
    if (!rawTags) return false;
    const fileTags = Array.isArray(rawTags) ? rawTags : [rawTags];
    const normalized = tags.map((t) => t.replace(/^#/, ""));
    const fileNormalized = fileTags.map((t: unknown) =>
      String(t).replace(/^#/, "")
    );
    return normalized.some((t) => fileNormalized.includes(t));
  }

  it("returns true when no tags filter", () => {
    expect(matchesTag("---\n---", [])).toBe(true);
  });

  it("matches a tag in frontmatter", () => {
    const content = "---\ntags:\n  - agent-access\n---\nbody";
    expect(matchesTag(content, ["agent-access"])).toBe(true);
  });

  it("returns false when tag not present", () => {
    const content = "---\ntags:\n  - other-tag\n---\nbody";
    expect(matchesTag(content, ["agent-access"])).toBe(false);
  });

  it("matches with # prefix in filter", () => {
    const content = "---\ntags:\n  - agent-access\n---\nbody";
    expect(matchesTag(content, ["#agent-access"])).toBe(true);
  });

  it("returns false for content without frontmatter", () => {
    expect(matchesTag("no frontmatter", ["agent-access"])).toBe(false);
  });
});

describe("sanitizeContent", () => {
  function sanitizeContent(content: string): string {
    return content
      .replace(/!\[\[.*?\]\]/g, "[imagen omitida]")
      .replace(/!\[.*?\]\(.*?\)/g, "[imagen omitida]")
      .replace(/data:image\/[^;]+;base64,[^\s]+/g, "[imagen omitida]");
  }

  it("replaces Obsidian embeds", () => {
    expect(sanitizeContent("Text ![[image.png]] end")).toBe(
      "Text [imagen omitida] end"
    );
  });

  it("replaces markdown images", () => {
    expect(sanitizeContent("![alt](path/to/img.png)")).toBe(
      "[imagen omitida]"
    );
  });

  it("replaces data URIs", () => {
    expect(
      sanitizeContent("data:image/png;base64,iVBORw0KGgoAAAANS")
    ).toBe("[imagen omitida]");
  });

  it("leaves normal text untouched", () => {
    expect(sanitizeContent("Hello [[link]] world")).toBe(
      "Hello [[link]] world"
    );
  });
});
