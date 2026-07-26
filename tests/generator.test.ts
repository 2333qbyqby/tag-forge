import {
  defaultGeneratorSettings,
  generateResult,
  isValidEntryPair,
} from "../src/engine/pack-engine";
import type {
  CompiledPack,
  GeneratorSettings,
  ResultSnapshot,
} from "../src/packs/types";
import { officialTestPack } from "./fixtures";

let pack: CompiledPack;

beforeAll(async () => {
  pack = await officialTestPack();
});

function settings(
  recipeId: string,
  seed = "deterministic-test",
): GeneratorSettings {
  return {
    ...defaultGeneratorSettings(pack),
    recipeId,
    seed,
  };
}

describe("pack generator", () => {
  it.each([
    "collision",
    "challenge",
    "prototype",
    "world-building",
    "historical-jam",
  ])("reproduces %s from the same root seed", (recipeId) => {
    const left = generateResult(pack, settings(recipeId), []);
    const right = generateResult(pack, settings(recipeId), []);
    expect(left.id).toBe(right.id);
    expect(left.variantId).toBe(right.variantId);
    expect(left.slots).toEqual(right.slots);
  });

  it("rerolls one slot without changing the other random streams", () => {
    const initialSettings = settings("prototype", "initial");
    const initial = generateResult(pack, initialSettings, []);
    const nextSettings = {
      ...initialSettings,
      seed: "reroll-only-one-slot",
    };
    const rerolled = generateResult(
      pack,
      nextSettings,
      [],
      initial,
      "primary",
    );
    expect(
      rerolled.slots.filter((slot) => slot.slotId !== "primary"),
    ).toEqual(initial.slots.filter((slot) => slot.slotId !== "primary"));
    expect(rerolled.slots.find((slot) => slot.slotId === "primary")?.itemId).not
      .toBe(initial.slots.find((slot) => slot.slotId === "primary")?.itemId);
    const entries = rerolled.slots
      .filter((slot) => slot.source === "entries")
      .map((slot) => pack.entryById.get(slot.itemId)!);
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        expect(isValidEntryPair(entries[left], entries[right])).toBe(true);
      }
    }
  });

  it("respects locks while generating a fresh result", () => {
    const initial = generateResult(pack, settings("world-building", "one"), []);
    const nextSettings = {
      ...settings("world-building", "two"),
      lockedSlotIds: ["motif-a"],
    };
    const next = generateResult(pack, nextSettings, [], initial);
    expect(next.slots.find((slot) => slot.slotId === "motif-a")).toEqual(
      initial.slots.find((slot) => slot.slotId === "motif-a"),
    );
  });

  it("makes the motif challenge exactly two design slots and three free motif slots", () => {
    const challengeSettings = {
      ...settings("challenge", "three-concepts"),
      categoryOverrides: {
        "motif-a": ["motif-concept"],
        "motif-b": ["motif-concept"],
        "motif-c": ["motif-concept"],
      },
    };
    const result = generateResult(pack, challengeSettings, []);
    expect(result.slots).toHaveLength(5);
    const groups = result.slots.map((slot) =>
      pack.categoryById.get(slot.categoryId ?? "")?.group,
    );
    expect(groups.filter((group) => group === "design")).toHaveLength(2);
    expect(groups.filter((group) => group === "motif")).toHaveLength(3);
    expect(
      result.slots
        .filter((slot) => slot.slotId.startsWith("motif-"))
        .every((slot) => slot.categoryId === "motif-concept"),
    ).toBe(true);
  });

  it("never emits duplicate IDs, families, or composite overlaps", () => {
    for (const recipe of pack.data.recipes) {
      const history: ResultSnapshot[] = [];
      for (let index = 0; index < 500; index += 1) {
        const result = generateResult(
          pack,
          settings(recipe.id, `${recipe.id}:${index}`),
          history,
        );
        const entries = result.slots
          .filter((slot) => slot.source === "entries")
          .map((slot) => pack.entryById.get(slot.itemId)!);
        for (let left = 0; left < entries.length; left += 1) {
          for (let right = left + 1; right < entries.length; right += 1) {
            expect(isValidEntryPair(entries[left], entries[right])).toBe(true);
          }
        }
        history.unshift(result);
        if (history.length > 100) history.pop();
      }
    }
  });

  it("uses pair cooldown without relation scoring", () => {
    const first = generateResult(pack, settings("collision", "repeat"), []);
    const second = generateResult(
      pack,
      settings("collision", "repeat"),
      [first],
    );
    expect(second.slots.map((slot) => slot.itemId).sort()).not.toEqual(
      first.slots.map((slot) => slot.itemId).sort(),
    );
  });
});
