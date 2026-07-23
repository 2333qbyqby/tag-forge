import { buildCandidate, rerollSlot as rebuildSlot } from "./build-candidate";
import { isNearDuplicate } from "./history";
import { softmaxPick, type SeededRng } from "./rng";
import { scoreCandidate } from "./score-candidate";
import { ideaSimilarity } from "./similarity";
import { TEMPLATES } from "./templates";
import type {
  CompiledData,
  GeneratedIdea,
  GeneratorConfig,
  IdeaCandidate,
  IdeaHistoryEntry,
} from "./types";

interface ScoredCandidate {
  candidate: IdeaCandidate;
  metrics: ReturnType<typeof scoreCandidate>["metrics"];
  signals: ReturnType<typeof scoreCandidate>["signals"];
}

function candidateKey(candidate: IdeaCandidate): string {
  return [...candidate.tagIds].sort().join("|");
}

function toGeneratedIdea(
  scored: ScoredCandidate,
  config: GeneratorConfig,
  seed: string,
  suffix = "0",
): GeneratedIdea {
  return {
    ...scored.candidate,
    id: `${seed}:${suffix}:${candidateKey(scored.candidate)}`,
    seed,
    mode: config.mode,
    metrics: scored.metrics,
    signals: scored.signals,
    createdAt: Date.now(),
  };
}

export function generateIdea(
  config: GeneratorConfig,
  data: CompiledData,
  history: IdeaHistoryEntry[],
  rng: SeededRng,
  candidateCount = 96,
): GeneratedIdea {
  const template = TEMPLATES[config.mode];
  const candidates: ScoredCandidate[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < candidateCount; index += 1) {
    const candidate = buildCandidate({
      template,
      config,
      data,
      history,
      rng: rng.fork(`candidate:${index}`),
    });
    if (!candidate) continue;
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    if (
      config.avoidRecent &&
      history.length > 2 &&
      isNearDuplicate(candidate.tagIds, history, data)
    ) {
      continue;
    }
    seen.add(key);
    candidates.push({ candidate, ...scoreCandidate(candidate, config, data, history) });
  }

  if (candidates.length === 0) {
    const fallback = buildCandidate({
      template,
      config: { ...config, avoidRecent: false, excludedTagIds: [] },
      data,
      history: [],
      rng: rng.fork("fallback"),
    });
    if (!fallback) throw new Error("No valid idea can be generated with this data set.");
    return toGeneratedIdea(
      { candidate: fallback, ...scoreCandidate(fallback, config, data, history) },
      config,
      config.seed,
      "fallback",
    );
  }

  const topPool = candidates
    .sort((a, b) => b.metrics.total - a.metrics.total)
    .slice(0, 12);
  const picked =
    softmaxPick(
      topPool,
      topPool.map((candidate) => candidate.metrics.total),
      0.08 + config.surprise * 0.12,
      rng.fork("final-pick"),
    ) ?? topPool[0];
  return toGeneratedIdea(picked, config, config.seed);
}

export function generateIdeas(
  count: number,
  config: GeneratorConfig,
  data: CompiledData,
  history: IdeaHistoryEntry[],
  rng: SeededRng,
): GeneratedIdea[] {
  const results: GeneratedIdea[] = [];
  for (let index = 0; index < count; index += 1) {
    const localHistory = [
      ...results.map((idea) => ({
        id: idea.id,
        tagIds: idea.tagIds,
        createdAt: idea.createdAt,
      })),
      ...history,
    ];
    const idea = generateIdea(
      { ...config, seed: `${config.seed}-${index + 1}` },
      data,
      localHistory,
      rng.fork(`result:${index}`),
    );
    if (
      results.some(
        (result) => ideaSimilarity(result.tagIds, idea.tagIds, data) > 0.7,
      )
    ) {
      index -= 1;
      if (results.length === 0) break;
      continue;
    }
    results.push({ ...idea, id: `${idea.id}:${index}` });
  }
  return results;
}

export function rerollIdeaSlot(
  idea: GeneratedIdea,
  slotId: string,
  config: GeneratorConfig,
  data: CompiledData,
  history: IdeaHistoryEntry[],
  rng: SeededRng,
): GeneratedIdea {
  const template = TEMPLATES[config.mode];
  const candidate = rebuildSlot(
    idea,
    slotId,
    template,
    config,
    data,
    history,
    rng,
  );
  if (!candidate) return idea;
  return toGeneratedIdea(
    { candidate, ...scoreCandidate(candidate, config, data, history) },
    config,
    `${config.seed}-${slotId}`,
    "reroll",
  );
}

