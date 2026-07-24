import { describe, expect, it } from "vitest";
import { compiledData, prompts } from "../src/data";
import { getEdge } from "../src/engine/indexes";
import { createSeededRng } from "../src/engine/rng";
import {
  generateChallenge,
  drawPrompt,
  isValidBasePair,
  rerollChallengeBase,
  rerollChallengePrompt,
  rerollChallengeSlot,
  rerollSingleSlot,
  toHistoryEntry,
} from "../src/engine/v2";
import type {
  GeneratedIdeaV2,
  GeneratorConfigV2,
  IdeaHistoryEntryV2,
} from "../src/engine/v2-types";

function config(
  seed: string,
  overrides: Partial<GeneratorConfigV2> = {},
): GeneratorConfigV2 {
  return {
    mode: "challenge",
    selectedKinds: ["gameplay", "any"],
    locked: { left: false, right: false, prompt: false },
    excludedTagIds: [],
    excludedPromptIds: [],
    avoidRecent: true,
    seed,
    ...overrides,
  };
}

describe("Engine 2 generator", () => {
  it("is deterministic for the same data, config, history and seed", () => {
    const value = config("same-seed");
    const first = generateChallenge(
      value,
      compiledData,
      prompts,
      [],
      createSeededRng(value.seed),
    );
    const second = generateChallenge(
      value,
      compiledData,
      prompts,
      [],
      createSeededRng(value.seed),
    );
    expect(second.baseTagIds).toEqual(first.baseTagIds);
    expect(second.promptId).toBe(first.promptId);
  });

  it("keeps the base and prompt random streams independent", () => {
    let changedBase = false;
    for (let index = 0; index < 60; index += 1) {
      const seed = `stream:${index}`;
      const original = generateChallenge(
        config(seed),
        compiledData,
        prompts,
        [],
        createSeededRng(seed),
      );
      const changed = generateChallenge(
        config(seed, { excludedTagIds: [original.baseTagIds[0]] }),
        compiledData,
        prompts,
        [],
        createSeededRng(seed),
      );
      expect(changed.promptId).toBe(original.promptId);
      if (changed.baseTagIds[0] !== original.baseTagIds[0]) changedBase = true;
    }
    expect(changedBase).toBe(true);
  });

  it("never emits same-family, redundant, hard-conflict or non-gameplay pairs", () => {
    for (let index = 0; index < 1000; index += 1) {
      const seed = `valid:${index}`;
      const idea = generateChallenge(
        config(seed, { avoidRecent: false }),
        compiledData,
        prompts,
        [],
        createSeededRng(seed),
      );
      const left = compiledData.tagById.get(idea.baseTagIds[0])!;
      const right = compiledData.tagById.get(idea.baseTagIds[1]!)!;
      expect(isValidBasePair(left, right, compiledData)).toBe(true);
      expect(
        ["genre", "mechanic"].includes(left.kind) ||
          ["genre", "mechanic"].includes(right.kind),
      ).toBe(true);
      const edge = getEdge(compiledData, left.id, right.id);
      expect(edge.hardConflict).toBe(false);
      expect(edge.redundancy).toBe(0);
      expect(left.family).not.toBe(right.family);
    }
  });

  it("rerolls only the requested challenge branch", () => {
    const value = config("reroll-base");
    const idea = generateChallenge(
      value,
      compiledData,
      prompts,
      [],
      createSeededRng(value.seed),
    );
    const base = rerollChallengeBase(
      { ...value, seed: "reroll-base-next" },
      compiledData,
      [],
      createSeededRng("reroll-base-next"),
      idea,
    );
    expect(base.promptId).toBe(idea.promptId);

    const prompt = rerollChallengePrompt(
      { ...value, seed: "reroll-prompt-next" },
      prompts,
      [],
      createSeededRng("reroll-prompt-next"),
      idea,
    );
    expect(prompt.baseTagIds).toEqual(idea.baseTagIds);
    expect(prompt.promptId).not.toBe(idea.promptId);

    const right = rerollChallengeSlot(
      1,
      { ...value, seed: "reroll-right-next" },
      compiledData,
      [],
      createSeededRng("reroll-right-next"),
      idea,
    );
    expect(right.baseTagIds[0]).toBe(idea.baseTagIds[0]);
    expect(right.promptId).toBe(idea.promptId);
  });

  it("preserves every locked challenge part", () => {
    const originalConfig = config("locked-original");
    const original = generateChallenge(
      originalConfig,
      compiledData,
      prompts,
      [],
      createSeededRng(originalConfig.seed),
    );
    const nextConfig = config("locked-next", {
      locked: { left: true, right: false, prompt: true },
    });
    const next = generateChallenge(
      nextConfig,
      compiledData,
      prompts,
      [],
      createSeededRng(nextConfig.seed),
      original,
    );
    expect(next.baseTagIds[0]).toBe(original.baseTagIds[0]);
    expect(next.promptId).toBe(original.promptId);
  });

  it("supports a one-word and a compatible two-word single state", () => {
    const value = config("single", { mode: "single" });
    const one = rerollSingleSlot(
      0,
      value,
      compiledData,
      [],
      createSeededRng(value.seed),
    );
    expect(one.baseTagIds[0]).toBeTruthy();
    expect(one.baseTagIds[1]).toBeUndefined();
    const two = rerollSingleSlot(
      1,
      value,
      compiledData,
      [],
      createSeededRng(value.seed).fork("right"),
      one,
    );
    expect(two.baseTagIds[1]).toBeTruthy();
    expect(
      isValidBasePair(
        compiledData.tagById.get(two.baseTagIds[0])!,
        compiledData.tagById.get(two.baseTagIds[1]!)!,
        compiledData,
      ),
    ).toBe(true);
  });

  it("forbids exact recent pairs while candidates remain", () => {
    const history: IdeaHistoryEntryV2[] = [];
    const produced: GeneratedIdeaV2[] = [];
    for (let index = 0; index < 200; index += 1) {
      const seed = `cooldown:${index}`;
      const idea = generateChallenge(
        config(seed),
        compiledData,
        prompts,
        history,
        createSeededRng(seed),
      );
      const key = [...idea.baseTagIds].sort().join("|");
      const recentKeys = produced
        .slice(-30)
        .map((entry) => [...entry.baseTagIds].sort().join("|"));
      expect(recentKeys).not.toContain(key);
      produced.push(idea);
      history.unshift(toHistoryEntry(idea, prompts));
    }
  });

  it("relaxes only prompt history cooldown when the candidate pool is exhausted", () => {
    const only = prompts[0];
    const history: IdeaHistoryEntryV2[] = [
      {
        id: "recent-only",
        schemaVersion: 2,
        mode: "challenge",
        baseTagIds: [],
        promptId: only.id,
        promptType: only.type,
        promptFamily: only.family,
        createdAt: 1,
      },
    ];
    expect(
      drawPrompt(
        [only],
        config("prompt-fallback"),
        history,
        createSeededRng("prompt-fallback"),
        only.id,
      ).id,
    ).toBe(only.id);
  });
});
