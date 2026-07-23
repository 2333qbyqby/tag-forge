import { describe, expect, it } from "vitest";
import { TAG_KINDS } from "../src/engine/types";
import { compiledData } from "../src/data";

describe("data snapshot", () => {
  it("contains a useful v0.1 vocabulary", () => {
    expect(compiledData.tags.length).toBeGreaterThanOrEqual(300);
    expect(compiledData.relations.length).toBeGreaterThanOrEqual(150);
    for (const kind of TAG_KINDS) {
      expect(compiledData.tagsByKind.get(kind)?.length).toBeGreaterThan(0);
    }
  });

  it("only references existing tags", () => {
    for (const relation of compiledData.relations) {
      expect(compiledData.tagById.has(relation.a)).toBe(true);
      expect(compiledData.tagById.has(relation.b)).toBe(true);
    }
  });
});

