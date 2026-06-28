import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.resolve(__dirname, "../../../../__test_agents__");

const validAgent = `---
name: Test Agent
description: A test agent
allowed_folders:
  - Research
allowed_tags:
  - agent-access
model: gemini-2.5-flash
tools:
  - vault
max_actions: 2
instructions: Test instructions
---

# Test agent body
`;

const missingName = `---
description: No name
allowed_folders:
  - Research
allowed_tags:
  - agent-access
model: gemini-2.5-flash
tools:
  - vault
---
`;

const missingFolder = `---
name: No Folder
description: Missing allowed_folders
allowed_tags:
  - agent-access
model: gemini-2.5-flash
tools:
  - vault
---
`;

const invalidTags = `---
name: Invalid Tags
description: Tags not array
allowed_folders:
  - Research
allowed_tags: not-an-array
model: gemini-2.5-flash
tools:
  - vault
---
`;

describe("loadAgentConfig", () => {
  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, "valid.md"), validAgent);
    await fs.writeFile(path.join(testDir, "missing-name.md"), missingName);
    await fs.writeFile(path.join(testDir, "missing-folder.md"), missingFolder);
    await fs.writeFile(path.join(testDir, "invalid-tags.md"), invalidTags);
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("loads a valid agent config", async () => {
    const { loadAgentConfig } = await import("../loadAgentConfig.js");
    const config = await loadAgentConfig(path.join(testDir, "valid.md"));
    expect(config.name).toBe("Test Agent");
    expect(config.description).toBe("A test agent");
    expect(config.allowed_folders).toEqual(["Research"]);
    expect(config.allowed_tags).toEqual(["agent-access"]);
    expect(config.model).toBe("gemini-2.5-flash");
    expect(config.tools).toEqual(["vault"]);
    expect(config.max_actions).toBe(2);
    expect(config.instructions).toBe("Test instructions");
  });

  it("rejects config without name", async () => {
    const { loadAgentConfig } = await import("../loadAgentConfig.js");
    await expect(loadAgentConfig(path.join(testDir, "missing-name.md"))).rejects.toThrow("name");
  });

  it("rejects config without allowed_folders", async () => {
    const { loadAgentConfig } = await import("../loadAgentConfig.js");
    await expect(loadAgentConfig(path.join(testDir, "missing-folder.md"))).rejects.toThrow("allowed_folders");
  });

  it("rejects config with non-array allowed_tags", async () => {
    const { loadAgentConfig } = await import("../loadAgentConfig.js");
    await expect(loadAgentConfig(path.join(testDir, "invalid-tags.md"))).rejects.toThrow("allowed_tags");
  });

  it("rejects non-existent file", async () => {
    const { loadAgentConfig } = await import("../loadAgentConfig.js");
    await expect(loadAgentConfig(path.join(testDir, "nonexistent.md"))).rejects.toThrow();
  });
});
