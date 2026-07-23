import { describe, expect, it } from "vitest";
import { compiledData } from "../src/data";
import { generateIdea, rerollIdeaSlot } from "../src/engine/generate";
import { getEdge } from "../src/engine/indexes";
import { createSeededRng } from "../src/engine/rng";
import type { GeneratorConfig, GeneratorMode } from "../src/engine/types";

function config(
  seed: string,
  overrides: Partial<GeneratorConfig> = {},
): GeneratorConfig {
  return {
    mode: "jam",
    surprise: 0.5,
    targetScope: 0.3,
    seed,
    pinnedBySlot: {},
    excludedTagIds: [],
    avoidRecent: false,
    ...overrides,
  };
}

describe("generator", () => {
  it("is deterministic for the same data, config and seed", () => {
    const value = config("same-seed");
    const first = generateIdea(
      value,
      compiledData,
      [],
      createSeededRng(value.seed),
    );
    const second = generateIdea(
      value,
      compiledData,
      [],
      createSeededRng(value.seed),
    );
    expect(second.slots).toEqual(first.slots);
    expect(second.metrics).toEqual(first.metrics);
  });

  it("never emits duplicate tags or a hard-conflict pair", () => {
    const modes: GeneratorMode[] = ["quick", "jam", "prototype", "wild"];
    for (const mode of modes) {
      for (let index = 0; index < 180; index += 1) {
        const value = config(`${mode}:${index}`, { mode });
        const idea = generateIdea(
          value,
          compiledData,
          [],
          createSeededRng(value.seed),
          36,
        );
        expect(new Set(idea.tagIds).size).toBe(idea.tagIds.length);
        for (let a = 0; a < idea.tagIds.length; a += 1) {
          for (let b = a + 1; b < idea.tagIds.length; b += 1) {
            expect(
              getEdge(compiledData, idea.tagIds[a], idea.tagIds[b]).hardConflict,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("preserves pinned slots", () => {
    for (let index = 0; index < 80; index += 1) {
      const value = config(`pinned:${index}`, {
        mode: "quick",
        pinnedBySlot: { theme: "memory" },
      });
      const idea = generateIdea(
        value,
        compiledData,
        [],
        createSeededRng(value.seed),
      );
      expect(idea.slots.theme).toBe("memory");
    }
  });

  it("rerolls only the requested slot", () => {
    const value = config("reroll-base", { mode: "jam" });
    const idea = generateIdea(
      value,
      compiledData,
      [],
      createSeededRng(value.seed),
    );
    const next = rerollIdeaSlot(
      idea,
      "setting",
      { ...value, seed: "reroll-next" },
      compiledData,
      [],
      createSeededRng("reroll-next"),
    );
    expect(next.slots.setting).not.toBe(idea.slots.setting);
    expect(next.slots.jamPrompt).toBe(idea.slots.jamPrompt);
    expect(next.slots.mechanic).toBe(idea.slots.mechanic);
    expect(next.slots.constraint).toBe(idea.slots.constraint);
    expect(next.slots.mood).toBe(idea.slots.mood);
  });

  it("moves average novelty upward as surprise increases", () => {
    const average = (surprise: number) => {
      let total = 0;
      for (let index = 0; index < 180; index += 1) {
        const value = config(`novelty:${surprise}:${index}`, {
          surprise,
          mode: "wild",
        });
        total += generateIdea(
          value,
          compiledData,
          [],
          createSeededRng(value.seed),
          48,
        ).metrics.novelty;
      }
      return total / 180;
    };
    expect(average(0.9)).toBeGreaterThan(average(0.1) + 0.015);
  });
});

