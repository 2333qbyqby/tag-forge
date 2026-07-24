import { describe, expect, it } from "vitest";
import { compiledData, DATA_VERSION, prompts } from "../src/data";
import {
  BASE_TAG_KINDS,
  PROMPT_FAMILIES,
  PROMPT_TYPES,
} from "../src/engine/v2-types";

const TYPE_TARGETS: Record<string, number> = {
  "open-choice": 180,
  "abstract-metaphor": 140,
  "change-consequence": 120,
  "relationship-identity": 100,
  "time-loop-rhythm": 90,
  "space-scale-boundary": 90,
  "perception-information": 90,
  "object-material-sensory": 70,
  "rule-resource-constraint": 60,
  "goal-start-situation": 30,
  "experimental-absurd": 30,
};

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

describe("Engine 2 data snapshot", () => {
  it("uses the V2 versions and an auditable base-tag vocabulary", () => {
    expect(DATA_VERSION).toBe("2026.07.2");
    expect(compiledData.tags.length).toBeGreaterThanOrEqual(450);
    for (const kind of BASE_TAG_KINDS) {
      expect(
        compiledData.tagsByKind
          .get(kind)
          ?.some(
            (tag) =>
              tag.enabled &&
              tag.generationEligible &&
              !tag.deprecatedBy &&
              tag.aliases !== undefined &&
              tag.family,
          ),
      ).toBe(true);
    }
  });

  it("only references valid tags without requiring a dense relation graph", () => {
    for (const relation of compiledData.relations) {
      expect(compiledData.tagById.has(relation.a)).toBe(true);
      expect(compiledData.tagById.has(relation.b)).toBe(true);
    }
    for (const tag of compiledData.tags) {
      for (const component of tag.compositeOf ?? []) {
        expect(compiledData.tagById.has(component)).toBe(true);
      }
      if (tag.deprecatedBy) {
        expect(compiledData.tagById.has(tag.deprecatedBy)).toBe(true);
        expect(tag.generationEligible).toBe(false);
      }
    }
  });

  it("contains exactly 1000 enabled, unique, quota-balanced prompts", () => {
    expect(prompts).toHaveLength(1000);
    const enabled = prompts.filter((prompt) => prompt.enabled);
    expect(enabled).toHaveLength(1000);
    expect(new Set(enabled.map((prompt) => prompt.id)).size).toBe(1000);
    expect(
      new Set(enabled.map((prompt) => normalized(prompt.labels.zh))).size,
    ).toBe(1000);
    expect(
      new Set(enabled.map((prompt) => normalized(prompt.labels.en))).size,
    ).toBe(1000);

    for (const type of PROMPT_TYPES) {
      expect(enabled.filter((prompt) => prompt.type === type)).toHaveLength(
        TYPE_TARGETS[type],
      );
    }
    for (const family of PROMPT_FAMILIES) {
      const count = enabled.filter((prompt) => prompt.family === family).length;
      expect(count).toBeGreaterThanOrEqual(50);
      expect(count).toBeLessThanOrEqual(120);
    }
  });
});
