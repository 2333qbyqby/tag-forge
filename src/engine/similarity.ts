import type { CompiledData } from "./types";

export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((item) => setB.has(item)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function clusterSimilarity(
  a: string[],
  b: string[],
  data: CompiledData,
): number {
  const clustersFor = (ids: string[]) =>
    ids.flatMap((id) => data.tagById.get(id)?.clusters ?? []);
  return jaccardSimilarity(clustersFor(a), clustersFor(b));
}

export function ideaSimilarity(
  a: string[],
  b: string[],
  data: CompiledData,
): number {
  return 0.72 * jaccardSimilarity(a, b) + 0.28 * clusterSimilarity(a, b, data);
}

