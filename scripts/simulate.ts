import { readFile } from "node:fs/promises";
import { packChecksum } from "../src/packs/canonical";
import { compilePack } from "../src/packs/compile";
import type {
  DataPackV1,
  GeneratorSettings,
  ResultSnapshotV1,
} from "../src/packs/types";
import {
  defaultGeneratorSettings,
  generateResult,
  isValidEntryPair,
} from "../src/engine/pack-engine";

function argument(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return (
    process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
}

const count = Math.max(1000, Number(argument("count", "10000")));
const ROOT = new URL("../", import.meta.url);
const data = JSON.parse(
  await readFile(
    new URL(".tmp/public/packs/tagforge-official-v2.tagforge.json", ROOT),
    "utf8",
  ),
) as DataPackV1;
const checksum = await packChecksum(data);
const pack = compilePack({
  data,
  ref: {
    packId: data.manifest.packId,
    version: data.manifest.version,
    checksum,
  },
  origin: "official",
  capabilities: {
    generate: true,
    browse: true,
    history: true,
    export: true,
    analysis: true,
  },
});

const reachableEntries = new Set<string>();
const reachablePrompts = new Set<string>();
const report: Record<string, unknown> = {};
let failed = false;

for (const recipe of data.recipes) {
  const history: ResultSnapshotV1[] = [];
  const frequency = new Map<string, number>();
  let invalidPairs = 0;
  let recentPairRepeats = 0;
  for (let index = 0; index < count; index += 1) {
    const seed = `simulation:${recipe.id}:${index}`;
    const settings: GeneratorSettings = {
      ...defaultGeneratorSettings(pack),
      recipeId: recipe.id,
      seed,
      avoidRecent: true,
    };
    const result = generateResult(pack, settings, history);
    const entries = result.slots
      .filter((slot) => slot.source === "entries")
      .map((slot) => pack.entryById.get(slot.itemId))
      .filter((entry) => entry !== undefined);
    for (const slot of result.slots) {
      frequency.set(slot.itemId, (frequency.get(slot.itemId) ?? 0) + 1);
      if (slot.source === "entries") reachableEntries.add(slot.itemId);
      else reachablePrompts.add(slot.itemId);
    }
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        if (!isValidEntryPair(entries[left], entries[right])) invalidPairs += 1;
        const key = [entries[left].id, entries[right].id].sort().join("|");
        const recentKeys = history
          .slice(0, recipe.cooldown.pairWindow)
          .flatMap((previous) => {
            const ids = previous.slots
              .filter((slot) => slot.source === "entries")
              .map((slot) => slot.itemId);
            const pairs: string[] = [];
            for (let a = 0; a < ids.length; a += 1) {
              for (let b = a + 1; b < ids.length; b += 1) {
                pairs.push([ids[a], ids[b]].sort().join("|"));
              }
            }
            return pairs;
          });
        if (recentKeys.includes(key)) {
          recentPairRepeats += 1;
        }
      }
    }
    history.unshift(result);
    const historyLimit = Math.max(
      recipe.cooldown.entryWindow,
      recipe.cooldown.familyWindow,
      recipe.cooldown.pairWindow,
      3,
    );
    if (history.length > historyLimit) history.pop();
  }
  const top = [...frequency.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([id, uses]) => ({ id, uses, rate: uses / count }));
  report[recipe.id] = {
    runs: count,
    invalidPairs,
    recentPairRepeats,
    uniqueItems: frequency.size,
    top,
  };
  if (invalidPairs > 0 || recentPairRepeats > 0) failed = true;
}

const activeEntryIds = new Set(
  data.entries
    .filter((entry) => entry.enabled !== false && !entry.deprecatedBy)
    .map((entry) => entry.id),
);
const activePromptIds = new Set(
  data.promptDecks.flatMap((deck) =>
    deck.prompts.filter((prompt) => prompt.enabled).map((prompt) => prompt.id),
  ),
);
const declaredReachableEntries = new Set<string>();
const declaredReachablePrompts = new Set<string>();
for (const recipe of data.recipes) {
  for (const slot of recipe.slots) {
    if (slot.source === "entries") {
      const categoryIds = new Set([
        ...(slot.categoryIds ?? []),
        ...(recipe.variants ?? []).flatMap(
          (variant) => variant.slotCategoryIds[slot.id] ?? [],
        ),
      ]);
      for (const entry of data.entries) {
        if (
          entry.enabled !== false &&
          !entry.deprecatedBy &&
          categoryIds.has(entry.categoryId)
        ) {
          declaredReachableEntries.add(entry.id);
        }
      }
    } else {
      const deck = data.promptDecks.find((item) => item.id === slot.deckId);
      for (const prompt of deck?.prompts ?? []) {
        if (prompt.enabled) declaredReachablePrompts.add(prompt.id);
      }
    }
  }
}
const undeclaredEntries = [...activeEntryIds].filter(
  (id) => !declaredReachableEntries.has(id),
);
const undeclaredPrompts = [...activePromptIds].filter(
  (id) => !declaredReachablePrompts.has(id),
);
const unreachableEntries = [...activeEntryIds].filter(
  (id) => !reachableEntries.has(id),
);
const unreachablePrompts = [...activePromptIds].filter(
  (id) => !reachablePrompts.has(id),
);
if (undeclaredEntries.length > 0 || undeclaredPrompts.length > 0) failed = true;

console.log(
  JSON.stringify(
    {
      countPerRecipe: count,
      recipes: report,
      reachability: {
        declared: {
          entries: {
            reached: declaredReachableEntries.size,
            total: activeEntryIds.size,
            missing: undeclaredEntries,
          },
          prompts: {
            reached: declaredReachablePrompts.size,
            total: activePromptIds.size,
            missing: undeclaredPrompts,
          },
        },
        simulationCoverage: {
        entries: {
          reached: reachableEntries.size,
          total: activeEntryIds.size,
          missing: unreachableEntries,
        },
        prompts: {
          reached: reachablePrompts.size,
          total: activePromptIds.size,
          missing: unreachablePrompts,
        },
        },
      },
    },
    null,
    2,
  ),
);

if (failed) process.exit(1);
