import process from "node:process";
import { compiledData, prompts } from "../src/data";
import { getEdge } from "../src/engine/indexes";
import { createSeededRng } from "../src/engine/rng";
import {
  generateChallenge,
  isValidBasePair,
  rerollSingleSlot,
  toHistoryEntry,
} from "../src/engine/v2";
import type {
  GeneratedIdeaV2,
  GeneratorConfigV2,
  GeneratorModeV2,
  IdeaHistoryEntryV2,
} from "../src/engine/v2-types";

function argument(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function recipeName(idea: GeneratedIdeaV2): string {
  const [leftId, rightId] = idea.baseTagIds;
  const left = compiledData.tagById.get(leftId);
  const right = rightId ? compiledData.tagById.get(rightId) : undefined;
  if (!left || !right) return "invalid";
  const kinds = new Set([left.kind, right.kind]);
  if (left.kind === "mechanic" && right.kind === "mechanic") {
    return "mechanic-mechanic";
  }
  if (kinds.has("genre") && kinds.has("mechanic")) {
    return "genre-mechanic";
  }
  if (
    kinds.has("mechanic") &&
    (kinds.has("theme") || kinds.has("mood"))
  ) {
    return "mechanic-theme-mood";
  }
  if (kinds.has("genre") && (kinds.has("theme") || kinds.has("mood"))) {
    return "genre-theme-mood";
  }
  if (
    (kinds.has("genre") || kinds.has("mechanic")) &&
    (kinds.has("presentation") || kinds.has("perspective"))
  ) {
    return "gameplay-presentation-perspective";
  }
  return "invalid";
}

const count = Math.max(100, Number(argument("count", "50000")));
const mode = argument("mode", "challenge") as GeneratorModeV2;
if (mode !== "single" && mode !== "challenge") {
  throw new Error(`Unsupported Engine 2 mode: ${mode}`);
}

const config: GeneratorConfigV2 = {
  mode,
  selectedKinds: ["gameplay", "any"],
  locked: { left: false, right: false, prompt: false },
  excludedTagIds: [],
  excludedPromptIds: [],
  avoidRecent: true,
  seed: "simulation-v2",
};

const tagFrequency = new Map<string, number>();
const promptFrequency = new Map<string, number>();
const promptTypeFrequency = new Map<string, number>();
const promptFamilyFrequency = new Map<string, number>();
const recipeFrequency = new Map<string, number>();
const seenPairs = new Set<string>();
const history: IdeaHistoryEntryV2[] = [];
let hardConflicts = 0;
let redundantPairs = 0;
let sameFamilyPairs = 0;
let invalidGameplayPairs = 0;
let repeatedRecentPairs = 0;

for (let index = 0; index < count; index += 1) {
  const seed = `simulation:${mode}:${index}`;
  const runConfig = { ...config, seed };
  let idea: GeneratedIdeaV2;
  if (mode === "challenge") {
    idea = generateChallenge(
      runConfig,
      compiledData,
      prompts,
      history,
      createSeededRng(seed),
    );
  } else {
    const left = rerollSingleSlot(
      0,
      runConfig,
      compiledData,
      history,
      createSeededRng(seed).fork("left"),
    );
    idea = rerollSingleSlot(
      1,
      runConfig,
      compiledData,
      history,
      createSeededRng(seed).fork("right"),
      left,
    );
  }

  const [leftId, rightId] = idea.baseTagIds;
  const left = compiledData.tagById.get(leftId);
  const right = rightId ? compiledData.tagById.get(rightId) : undefined;
  if (!left || !right) {
    invalidGameplayPairs += 1;
    continue;
  }
  const pairKey = [leftId, rightId].sort().join("|");
  if (
    history
      .slice(0, 30)
      .some(
        (entry) =>
          entry.baseTagIds.length >= 2 &&
          [...entry.baseTagIds].sort().join("|") === pairKey,
      )
  ) {
    repeatedRecentPairs += 1;
  }
  seenPairs.add(pairKey);
  increment(tagFrequency, leftId);
  increment(tagFrequency, rightId);
  if (mode === "challenge") increment(recipeFrequency, recipeName(idea));

  const edge = getEdge(compiledData, leftId, rightId);
  if (edge.hardConflict) hardConflicts += 1;
  if (edge.redundancy > 0) redundantPairs += 1;
  if ((left.family ?? left.id) === (right.family ?? right.id)) {
    sameFamilyPairs += 1;
  }
  if (
    !isValidBasePair(left, right, compiledData) ||
    !["genre", "mechanic"].includes(left.kind) &&
      !["genre", "mechanic"].includes(right.kind)
  ) {
    invalidGameplayPairs += 1;
  }

  const prompt = prompts.find((item) => item.id === idea.promptId);
  if (prompt) {
    increment(promptFrequency, prompt.id);
    increment(promptTypeFrequency, prompt.type);
    increment(promptFamilyFrequency, prompt.family);
  }

  history.unshift(toHistoryEntry(idea, prompts));
  if (history.length > 100) history.pop();
}

const rateMap = (map: Map<string, number>) =>
  Object.fromEntries(
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => [key, value / count]),
  );

const expectedRecipes: Record<string, number> = {
  "genre-mechanic": 0.35,
  "mechanic-mechanic": 0.2,
  "mechanic-theme-mood": 0.2,
  "genre-theme-mood": 0.15,
  "gameplay-presentation-perspective": 0.1,
};
const recipeRates = rateMap(recipeFrequency);
const recipeDeviation =
  mode === "challenge"
    ? Math.max(
        ...Object.entries(expectedRecipes).map(([name, expected]) =>
          Math.abs((recipeRates[name] ?? 0) - expected),
        ),
      )
    : 0;
const maxPromptRate =
  promptFrequency.size > 0
    ? Math.max(...[...promptFrequency.values()].map((value) => value / count))
    : 0;
const maxPromptTypeRate =
  promptTypeFrequency.size > 0
    ? Math.max(...[...promptTypeFrequency.values()].map((value) => value / count))
    : 0;
const maxPromptFamilyRate =
  promptFamilyFrequency.size > 0
    ? Math.max(
        ...[...promptFamilyFrequency.values()].map((value) => value / count),
      )
    : 0;

const report = {
  runs: count,
  mode,
  uniqueBasePairs: seenPairs.size,
  hardConflicts,
  redundantPairs,
  sameFamilyPairs,
  invalidGameplayPairs,
  repeatedRecentPairs,
  promptReachability:
    mode === "challenge"
      ? { reached: promptFrequency.size, total: prompts.length }
      : undefined,
  recipeRates: mode === "challenge" ? recipeRates : undefined,
  recipeMaxDeviation: recipeDeviation,
  promptTypeRates:
    mode === "challenge" ? rateMap(promptTypeFrequency) : undefined,
  promptFamilyRates:
    mode === "challenge" ? rateMap(promptFamilyFrequency) : undefined,
  dominance:
    mode === "challenge"
      ? { maxPromptRate, maxPromptTypeRate, maxPromptFamilyRate }
      : undefined,
  mostCommonTags: [...tagFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id, uses]) => ({ id, uses, rate: uses / (count * 2) })),
};

console.log(JSON.stringify(report, null, 2));

const failed =
  hardConflicts > 0 ||
  redundantPairs > 0 ||
  sameFamilyPairs > 0 ||
  invalidGameplayPairs > 0 ||
  repeatedRecentPairs > 0 ||
  (mode === "challenge" &&
    (promptFrequency.size !== prompts.length ||
      recipeDeviation > 0.025 ||
      maxPromptRate > 0.015 ||
      maxPromptTypeRate > 0.25 ||
      maxPromptFamilyRate > 0.18));

if (failed) process.exit(1);
