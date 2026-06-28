import { describe, it, expect } from "vitest";
import { tokenize, computeFrequencies } from "../tokenizer.js";

describe("tokenizer", () => {
  it("extracts terms from plain text", () => {
    const tokens = tokenize("redes neuronales convolucionales");
    const terms = tokens.map(t => t.term);
    expect(terms.length).toBeGreaterThanOrEqual(3);
    terms.forEach(t => expect(t.length).toBeGreaterThanOrEqual(2));
  });

  it("removes stop words", () => {
    const tokens = tokenize("the and of for a an in");
    expect(tokens.length).toBe(0);
  });

  it("handles empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   \n\n")).toEqual([]);
  });

  it("computes term frequencies", () => {
    const tokens = tokenize("gato gato perro gato");
    const freqs = computeFrequencies(tokens);
    const gato = freqs.find(f => f.term.includes("gato") || f.term.includes("gat"));
    const perro = freqs.find(f => f.term.includes("perro") || f.term.includes("perr"));
    expect(gato?.frequency).toBe(3);
    expect(perro?.frequency).toBe(1);
  });

  it("strips code blocks", () => {
    const tokens = tokenize("Texto normal\n```\ncode block\n```\nM\u00E1s texto");
    const terms = tokens.map(t => t.term);
    expect(terms).not.toContain("code");
    expect(terms).toContain("texto");
  });

  it("rejects single-character terms", () => {
    const tokens = tokenize("a b c palabra");
    expect(tokens.length).toBe(1);
    expect(tokens[0].term).toBe("palabra");
  });

  it("produces stable output for repeated input", () => {
    const t1 = tokenize("investigaci\u00F3n cient\u00EDfica");
    const t2 = tokenize("investigaci\u00F3n cient\u00EDfica");
    expect(t1.map(t => t.term)).toEqual(t2.map(t => t.term));
  });
});
