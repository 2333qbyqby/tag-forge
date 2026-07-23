import type { CompiledData, IdeaHistoryEntry } from "./types";
import { ideaSimilarity } from "./similarity";

export function recentUsagePenalty(
  tagId: string,
  history: IdeaHistoryEntry[],
): number {
  const recent = history.slice(0, 50);
  return recent.reduce((penalty, entry, index) => {
    if (!entry.tagIds.includes(tagId)) return penalty;
    return penalty + Math.exp(-index / 12);
  }, 0);
}

export function freshnessScore(
  tagIds: string[],
  history: IdeaHistoryEntry[],
  data: CompiledData,
): number {
  if (history.length === 0) return 1;
  const nearest = Math.max(
    ...history
      .slice(0, 20)
      .map((entry) => ideaSimilarity(tagIds, entry.tagIds, data)),
  );
  return 1 - nearest;
}

export function isNearDuplicate(
  tagIds: string[],
  history: IdeaHistoryEntry[],
  data: CompiledData,
  threshold = 0.75,
): boolean {
  return history
    .slice(0, 20)
    .some((entry) => ideaSimilarity(tagIds, entry.tagIds, data) > threshold);
}

