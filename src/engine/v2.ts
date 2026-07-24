import { getEdge } from "./indexes";
import { softmaxPick, weightedPick, type SeededRng } from "./rng";
import type { CompiledData, TagNode } from "./types";
import {
  BASE_TAG_KINDS,
  type BaseKindChoice,
  type BaseTagKind,
  type GeneratedIdeaV2,
  type GeneratorConfigV2,
  type IdeaHistoryEntryV2,
  type PromptRecord,
} from "./v2-types";

const GAMEPLAY_KINDS = new Set<BaseTagKind>(["genre", "mechanic"]);

function isGameplayKind(kind: TagNode["kind"]): boolean {
  return kind === "genre" || kind === "mechanic";
}

const RECIPES: Array<{
  left: BaseTagKind[];
  right: BaseTagKind[];
  weight: number;
}> = [
  { left: ["genre"], right: ["mechanic"], weight: 35 },
  { left: ["mechanic"], right: ["mechanic"], weight: 20 },
  { left: ["mechanic"], right: ["theme", "mood"], weight: 20 },
  { left: ["genre"], right: ["theme", "mood"], weight: 15 },
  {
    left: ["genre", "mechanic"],
    right: ["presentation", "perspective"],
    weight: 10,
  },
];

function tagFamily(tag: TagNode): string {
  return tag.family ?? tag.id;
}

function isEligibleBaseTag(tag: TagNode): tag is TagNode & { kind: BaseTagKind } {
  return (
    tag.enabled &&
    !tag.deprecatedBy &&
    tag.generationEligible !== false &&
    BASE_TAG_KINDS.includes(tag.kind as BaseTagKind)
  );
}

function kindsForChoice(choice: BaseKindChoice): BaseTagKind[] {
  if (choice === "any") return [...BASE_TAG_KINDS];
  if (choice === "gameplay") return ["genre", "mechanic"];
  return [choice];
}

function eligibleTags(
  data: CompiledData,
  kinds: BaseTagKind[],
  excluded: Set<string>,
): TagNode[] {
  return kinds.flatMap((kind) => data.tagsByKind.get(kind) ?? []).filter(
    (tag) => isEligibleBaseTag(tag) && !excluded.has(tag.id),
  );
}

function tagHistoryWeight(
  tag: TagNode,
  history: IdeaHistoryEntryV2[],
  avoidRecent: boolean,
  data: CompiledData,
): number {
  if (!avoidRecent) return 1;
  let penalty = 0;
  for (let index = 0; index < Math.min(30, history.length); index += 1) {
    const entry = history[index];
    if (entry.baseTagIds.includes(tag.id)) {
      penalty += Math.exp(-index / 8);
    }
  }
  const exactCooldown = history
    .slice(0, 5)
    .some((entry) => entry.baseTagIds.includes(tag.id))
    ? 0.15
    : 1;
  const familyCooldown = history.slice(0, 3).some((entry) =>
    entry.baseTagIds.some((id) => {
      const historicalTag = data.tagById.get(id);
      return historicalTag
        ? tagFamily(historicalTag) === tagFamily(tag)
        : false;
    }),
  )
    ? 0.35
    : 1;
  return exactCooldown * familyCooldown * Math.exp(-0.55 * penalty);
}

function hasCompositeOverlap(a: TagNode, b: TagNode): boolean {
  const aParts = new Set([a.id, ...(a.compositeOf ?? [])]);
  const bParts = new Set([b.id, ...(b.compositeOf ?? [])]);
  return [...aParts].some((part) => bParts.has(part));
}

export function isValidBasePair(
  a: TagNode,
  b: TagNode,
  data: CompiledData,
): boolean {
  if (a.id === b.id) return false;
  if (tagFamily(a) === tagFamily(b)) return false;
  if (hasCompositeOverlap(a, b)) return false;
  const edge = getEdge(data, a.id, b.id);
  return !edge.hardConflict && edge.redundancy === 0;
}

function pairKey(ids: string[]): string {
  return [...ids].sort().join("|");
}

function isRecentPair(ids: string[], history: IdeaHistoryEntryV2[]): boolean {
  if (ids.length < 2) return false;
  const key = pairKey(ids);
  return history
    .slice(0, 30)
    .some((entry) => entry.baseTagIds.length >= 2 && pairKey(entry.baseTagIds) === key);
}

function candidateScore(
  candidate: TagNode,
  other: TagNode | undefined,
  config: GeneratorConfigV2,
  data: CompiledData,
  history: IdeaHistoryEntryV2[],
): number {
  let score =
    Math.log(Math.max(0.02, candidate.baseWeight)) +
    Math.log(
      Math.max(
        0.02,
        tagHistoryWeight(candidate, history, config.avoidRecent, data),
      ),
    );
  if (!other) return score;
  const edge = getEdge(data, candidate.id, other.id);
  const averageRisk =
    (candidate.implementationRisk + other.implementationRisk) / 2;
  score +=
    0.25 * edge.compatibility +
    0.1 * edge.tension -
    0.8 * edge.softConflict -
    0.6 * Math.max(0, averageRisk - 0.65);
  return score;
}

function pickTag(
  kinds: BaseTagKind[],
  other: TagNode | undefined,
  config: GeneratorConfigV2,
  data: CompiledData,
  history: IdeaHistoryEntryV2[],
  rng: SeededRng,
  extraExcluded: string[] = [],
): TagNode | undefined {
  const excluded = new Set([
    ...config.excludedTagIds,
    ...extraExcluded,
    ...(other ? [other.id] : []),
  ]);
  const semanticCandidates = eligibleTags(data, kinds, excluded).filter(
    (candidate) => !other || isValidBasePair(candidate, other, data),
  );
  const cooldownCandidates =
    other && config.avoidRecent
      ? semanticCandidates.filter(
          (candidate) => !isRecentPair([candidate.id, other.id], history),
        )
      : semanticCandidates;
  const candidates =
    cooldownCandidates.length > 0 ? cooldownCandidates : semanticCandidates;
  const scores = candidates.map((candidate) =>
    candidateScore(candidate, other, config, data, history),
  );
  return softmaxPick(candidates, scores, 0.82, rng);
}

function recipeFor(rng: SeededRng) {
  return weightedPick(
    RECIPES,
    RECIPES.map((recipe) => recipe.weight),
    rng,
  )!;
}

function createIdea(
  mode: GeneratedIdeaV2["mode"],
  seed: string,
  baseTagIds: [string, string?],
  promptId?: string,
): GeneratedIdeaV2 {
  const parts = [...baseTagIds, promptId].filter(Boolean).join("|");
  return {
    id: `v2:${seed}:${parts}`,
    schemaVersion: 2,
    mode,
    seed,
    baseTagIds,
    promptId,
    createdAt: Date.now(),
  };
}

export function drawBasePair(
  config: GeneratorConfigV2,
  data: CompiledData,
  history: IdeaHistoryEntryV2[],
  rng: SeededRng,
  current?: GeneratedIdeaV2,
): [string, string] {
  const leftCandidate = config.locked.left
    ? data.tagById.get(current?.baseTagIds[0] ?? "")
    : undefined;
  const rightCandidate = config.locked.right
    ? data.tagById.get(current?.baseTagIds[1] ?? "")
    : undefined;
  const fixedLeft =
    leftCandidate && isEligibleBaseTag(leftCandidate) ? leftCandidate : undefined;
  const fixedRight =
    rightCandidate && isEligibleBaseTag(rightCandidate)
      ? rightCandidate
      : undefined;

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const recipe = recipeFor(rng.fork(`recipe:${attempt}`));
    const left =
      fixedLeft ??
      pickTag(
        recipe.left,
        fixedRight,
        config,
        data,
        history,
        rng.fork(`left:${attempt}`),
      );
    if (!left) continue;
    const right =
      fixedRight ??
      pickTag(
        recipe.right,
        left,
        config,
        data,
        history,
        rng.fork(`right:${attempt}`),
      );
    if (!right || !isValidBasePair(left, right, data)) continue;
    const ids = [left.id, right.id];
    if (config.avoidRecent && isRecentPair(ids, history)) continue;
    if (!isGameplayKind(left.kind) && !isGameplayKind(right.kind)) continue;
    return [left.id, right.id];
  }

  const fallbackLeft =
    fixedLeft ??
    pickTag(
      ["genre", "mechanic"],
      fixedRight,
      { ...config, avoidRecent: false },
      data,
      [],
      rng.fork("fallback-left"),
    );
  const fallbackRight =
    fixedRight ??
    (fallbackLeft
      ? pickTag(
          isGameplayKind(fallbackLeft.kind)
            ? [...BASE_TAG_KINDS]
            : ["genre", "mechanic"],
          fallbackLeft,
          { ...config, avoidRecent: false },
          data,
          [],
          rng.fork("fallback-right"),
        )
      : undefined);
  if (
    !fallbackLeft ||
    !fallbackRight ||
    !isValidBasePair(fallbackLeft, fallbackRight, data) ||
    (!isGameplayKind(fallbackLeft.kind) &&
      !isGameplayKind(fallbackRight.kind))
  ) {
    throw new Error("No valid Engine 2 base pair is available.");
  }
  return [fallbackLeft.id, fallbackRight.id];
}

export function drawPrompt(
  prompts: PromptRecord[],
  config: GeneratorConfigV2,
  history: IdeaHistoryEntryV2[],
  rng: SeededRng,
  previousPromptId?: string,
): PromptRecord {
  const excluded = new Set(config.excludedPromptIds);
  const recentIds = new Set(
    [
      ...(previousPromptId ? [previousPromptId] : []),
      ...(config.avoidRecent
        ? history.slice(0, 10).map((entry) => entry.promptId).filter(Boolean)
        : []),
    ],
  );
  const recentFamilies = new Set(
    config.avoidRecent
      ? history.slice(0, 3).map((entry) => entry.promptFamily).filter(Boolean)
      : [],
  );
  const lastTypes = history.slice(0, 3).map((entry) => entry.promptType);
  const repeatedType =
    lastTypes.length === 3 && lastTypes.every((type) => type === lastTypes[0])
      ? lastTypes[0]
      : undefined;
  let candidates = prompts.filter(
    (prompt) =>
      prompt.enabled &&
      !excluded.has(prompt.id) &&
      !recentIds.has(prompt.id),
  );
  if (candidates.length === 0) {
    candidates = prompts.filter(
      (prompt) => prompt.enabled && !excluded.has(prompt.id),
    );
  }
  const weights = candidates.map((prompt) => {
    let weight = prompt.baseWeight;
    if (recentFamilies.has(prompt.family)) weight *= 0.35;
    if (prompt.type === repeatedType) weight *= 0.3;
    return weight;
  });
  const picked = weightedPick(candidates, weights, rng);
  if (!picked) throw new Error("No enabled Engine 2 prompt is available.");
  return picked;
}

export function generateChallenge(
  config: GeneratorConfigV2,
  data: CompiledData,
  prompts: PromptRecord[],
  history: IdeaHistoryEntryV2[],
  rng: SeededRng,
  current?: GeneratedIdeaV2,
): GeneratedIdeaV2 {
  const baseTagIds =
    config.locked.left && config.locked.right && current?.baseTagIds[1]
      ? ([current.baseTagIds[0], current.baseTagIds[1]] as [string, string])
      : drawBasePair(config, data, history, rng.fork("base"), current);
  const promptId =
    config.locked.prompt && current?.promptId
      ? current.promptId
      : drawPrompt(
          prompts,
          config,
          history,
          rng.fork("prompt"),
          current?.promptId,
        ).id;
  return createIdea("challenge", config.seed, baseTagIds, promptId);
}

export function rerollSingleSlot(
  slot: 0 | 1,
  config: GeneratorConfigV2,
  data: CompiledData,
  history: IdeaHistoryEntryV2[],
  rng: SeededRng,
  current?: GeneratedIdeaV2,
): GeneratedIdeaV2 {
  const ids: [string, string?] = current
    ? [current.baseTagIds[0], current.baseTagIds[1]]
    : ["", undefined];
  const otherIndex = slot === 0 ? 1 : 0;
  const other = data.tagById.get(ids[otherIndex] ?? "");
  const choice = config.selectedKinds[slot];
  const selectedKinds = kindsForChoice(choice);
  const kinds =
    other && !GAMEPLAY_KINDS.has(other.kind as BaseTagKind)
      ? selectedKinds.filter((kind) => GAMEPLAY_KINDS.has(kind))
      : selectedKinds;
  const picked = pickTag(
    kinds,
    other,
    config,
    data,
    history,
    rng.fork(`single:${slot}`),
    [ids[slot] ?? ""],
  );
  if (!picked) return current ?? createIdea("single", config.seed, [""]);
  ids[slot] = picked.id;
  if (!ids[0] && ids[1]) {
    ids[0] = ids[1];
    ids[1] = undefined;
  }
  return createIdea("single", config.seed, ids);
}

export function rerollChallengeBase(
  config: GeneratorConfigV2,
  data: CompiledData,
  history: IdeaHistoryEntryV2[],
  rng: SeededRng,
  current: GeneratedIdeaV2,
): GeneratedIdeaV2 {
  const baseTagIds = drawBasePair(config, data, history, rng.fork("base"), current);
  return createIdea("challenge", config.seed, baseTagIds, current.promptId);
}

export function rerollChallengeSlot(
  slot: 0 | 1,
  config: GeneratorConfigV2,
  data: CompiledData,
  history: IdeaHistoryEntryV2[],
  rng: SeededRng,
  current: GeneratedIdeaV2,
): GeneratedIdeaV2 {
  const isolatedConfig: GeneratorConfigV2 = {
    ...config,
    locked: {
      ...config.locked,
      left: slot === 1,
      right: slot === 0,
    },
  };
  const baseTagIds = drawBasePair(
    isolatedConfig,
    data,
    history,
    rng.fork(`base-slot:${slot}`),
    current,
  );
  return createIdea("challenge", config.seed, baseTagIds, current.promptId);
}

export function rerollChallengePrompt(
  config: GeneratorConfigV2,
  prompts: PromptRecord[],
  history: IdeaHistoryEntryV2[],
  rng: SeededRng,
  current: GeneratedIdeaV2,
): GeneratedIdeaV2 {
  const prompt = drawPrompt(
    prompts,
    config,
    history,
    rng.fork("prompt"),
    current.promptId,
  );
  return createIdea("challenge", config.seed, current.baseTagIds, prompt.id);
}

export function toHistoryEntry(
  idea: GeneratedIdeaV2,
  prompts: PromptRecord[],
): IdeaHistoryEntryV2 {
  const prompt = prompts.find((item) => item.id === idea.promptId);
  return {
    id: idea.id,
    schemaVersion: 2,
    mode: idea.mode,
    baseTagIds: idea.baseTagIds.filter((id): id is string => Boolean(id)),
    promptId: idea.promptId,
    promptType: prompt?.type,
    promptFamily: prompt?.family,
    createdAt: idea.createdAt,
  };
}
