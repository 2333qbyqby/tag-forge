import { getEdge } from "./indexes";
import { recentUsagePenalty } from "./history";
import type {
  CompiledData,
  GeneratorConfig,
  IdeaHistoryEntry,
  TagNode,
} from "./types";

function modeBoost(tag: TagNode, config: GeneratorConfig): number {
  if (config.mode === "jam") {
    if (tag.kind === "constraint" || tag.kind === "jamPrompt") return 0.18;
    if (tag.scopeImpact < 0) return 0.12;
  }
  if (config.mode === "prototype" && tag.implementationRisk < 0.55) return 0.12;
  if (config.mode === "wild") return tag.rarity * 0.28;
  return 0;
}

function scopeFit(tag: TagNode, config: GeneratorConfig): number {
  const normalizedImpact = (tag.scopeImpact + 1) / 2;
  const distance = Math.abs(normalizedImpact - config.targetScope);
  return 0.28 * (1 - distance * 2);
}

export function contextualLogit(
  tag: TagNode,
  selectedIds: string[],
  config: GeneratorConfig,
  data: CompiledData,
  history: IdeaHistoryEntry[],
): number {
  let synergy = 0;
  let tension = 0;
  let redundancy = 0;
  let softConflict = 0;

  for (const selectedId of selectedIds) {
    const edge = getEdge(data, tag.id, selectedId);
    if (edge.hardConflict) return Number.NEGATIVE_INFINITY;
    synergy += edge.compatibility;
    tension += edge.tension;
    redundancy += edge.redundancy;
    softConflict += edge.softConflict;
  }

  const divisor = Math.max(1, selectedIds.length);
  synergy /= divisor;
  tension /= divisor;
  redundancy /= divisor;
  softConflict /= divisor;

  const surprise = config.surprise;
  const recentPenalty = config.avoidRecent
    ? Math.min(2, recentUsagePenalty(tag.id, history))
    : 0;

  return (
    Math.log(Math.max(0.02, tag.baseWeight)) +
    modeBoost(tag, config) +
    scopeFit(tag, config) +
    tag.rarity * surprise * 1.1 -
    0.9 * recentPenalty -
    1.1 * redundancy +
    (1.35 - 0.45 * surprise) * synergy +
    (0.15 + 1.1 * surprise) * tension -
    1.5 * softConflict
  );
}
