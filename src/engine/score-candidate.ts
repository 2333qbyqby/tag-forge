import { freshnessScore } from "./history";
import { getEdge } from "./indexes";
import type {
  CompiledData,
  GeneratorConfig,
  IdeaCandidate,
  IdeaHistoryEntry,
  IdeaMetrics,
  PairSignal,
} from "./types";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function scoreCandidate(
  candidate: IdeaCandidate,
  config: GeneratorConfig,
  data: CompiledData,
  history: IdeaHistoryEntry[],
): { metrics: IdeaMetrics; signals: PairSignal[] } {
  let synergy = 0;
  let tension = 0;
  let conflicts = 0;
  let redundancy = 0;
  let knownPairs = 0;
  const signals: PairSignal[] = [];

  for (let a = 0; a < candidate.tagIds.length; a += 1) {
    for (let b = a + 1; b < candidate.tagIds.length; b += 1) {
      const aId = candidate.tagIds[a];
      const bId = candidate.tagIds[b];
      const edge = getEdge(data, aId, bId);
      if (edge.confidence > 0) knownPairs += 1;
      synergy += edge.compatibility;
      tension += edge.tension;
      conflicts += edge.softConflict;
      redundancy += edge.redundancy;
      const strongest = Math.max(
        edge.compatibility,
        edge.tension,
        edge.softConflict,
        edge.redundancy,
      );
      if (strongest < 0.22) continue;
      const kind =
        strongest === edge.compatibility
          ? "synergy"
          : strongest === edge.tension
            ? "tension"
            : strongest === edge.redundancy
              ? "redundancy"
              : "conflict";
      signals.push({ a: aId, b: bId, kind, strength: strongest });
    }
  }

  const pairCount = Math.max(
    1,
    (candidate.tagIds.length * (candidate.tagIds.length - 1)) / 2,
  );
  const tags = candidate.tagIds
    .map((id) => data.tagById.get(id))
    .filter((tag) => tag !== undefined);
  const rarity = tags.reduce((sum, tag) => sum + tag.rarity, 0) / tags.length;
  const unknownRatio = 1 - knownPairs / pairCount;
  const novelty = clamp01(rarity * 0.72 + unknownRatio * 0.28 - redundancy / pairCount);
  const actualScope = clamp01(
    0.5 +
      tags.reduce((sum, tag) => sum + tag.scopeImpact, 0) /
        Math.max(2, tags.length * 1.7),
  );
  const risk = clamp01(
    tags.reduce((sum, tag) => sum + tag.implementationRisk, 0) / tags.length,
  );
  const coherence = clamp01(
    0.58 + synergy / pairCount - conflicts / pairCount - redundancy / pairCount,
  );
  const tensionScore = clamp01(tension / Math.max(1, pairCount * 0.45));
  const noveltyFit = Math.exp(
    -Math.pow(novelty - config.surprise, 2) / (2 * Math.pow(0.22, 2)),
  );
  const tensionTarget = 0.12 + config.surprise * 0.65;
  const tensionFit = Math.exp(
    -Math.pow(tensionScore - tensionTarget, 2) / (2 * Math.pow(0.28, 2)),
  );
  const scopeFit = Math.exp(
    -Math.pow(actualScope - config.targetScope, 2) / (2 * Math.pow(0.25, 2)),
  );
  const freshness = freshnessScore(candidate.tagIds, history, data);
  const redundancyPenalty = Math.min(0.24, (redundancy / pairCount) * 0.8);
  const noveltyDirection =
    config.surprise * novelty + (1 - config.surprise) * (1 - novelty);
  const total =
    0.23 * coherence +
    0.12 +
    0.1 * noveltyFit +
    0.1 * tensionFit +
    0.1 * scopeFit +
    0.1 * freshness +
    0.25 * noveltyDirection -
    redundancyPenalty;

  return {
    metrics: {
      coherence,
      novelty,
      tension: tensionScore,
      scope: actualScope,
      scopeFit,
      risk,
      freshness,
      total,
    },
    signals: signals.sort((a, b) => b.strength - a.strength),
  };
}
