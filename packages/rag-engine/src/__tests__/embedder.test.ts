import { describe, it, expect } from "vitest";
import { cosineSimilarity, serializeVector, deserializeVector } from "../embedder.js";

describe("embedder", () => {
  it("computes cosine similarity of identical vectors", () => {
    const a = new Float32Array([1, 2, 3, 4]);
    const b = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it("computes cosine similarity of opposite vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it("computes cosine similarity of orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("handles zero vectors", () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([1, 1]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("serializes and deserializes Float32Array", () => {
    const original = new Float32Array([0.1, 0.2, 0.3, Math.PI]);
    const buffer = serializeVector(original);
    const restored = deserializeVector(buffer);
    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i], 5);
    }
  });

  it("handles vectors of different lengths", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});
