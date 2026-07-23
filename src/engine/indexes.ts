import type {
  CompiledData,
  CompiledEdge,
  TagKind,
  TagNode,
  TagRelation,
} from "./types";

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function emptyEdge(): CompiledEdge {
  return {
    compatibility: 0,
    tension: 0,
    redundancy: 0,
    softConflict: 0,
    hardConflict: false,
    confidence: 0,
  };
}

export function compileData(
  tags: TagNode[],
  relations: TagRelation[],
): CompiledData {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const tagsByKind = new Map<TagKind, TagNode[]>();
  const clusterIndex = new Map<string, Set<string>>();
  const edgeByPair = new Map<string, CompiledEdge>();

  for (const tag of tags) {
    const byKind = tagsByKind.get(tag.kind) ?? [];
    byKind.push(tag);
    tagsByKind.set(tag.kind, byKind);
    for (const cluster of tag.clusters) {
      const members = clusterIndex.get(cluster) ?? new Set<string>();
      members.add(tag.id);
      clusterIndex.set(cluster, members);
    }
  }

  for (const relation of relations) {
    const edge = edgeByPair.get(pairKey(relation.a, relation.b)) ?? emptyEdge();
    const value = relation.strength * relation.confidence;
    if (relation.kind === "synergy") edge.compatibility = Math.max(edge.compatibility, value);
    if (relation.kind === "tension") edge.tension = Math.max(edge.tension, value);
    if (relation.kind === "redundancy") edge.redundancy = Math.max(edge.redundancy, value);
    if (relation.kind === "soft-conflict") edge.softConflict = Math.max(edge.softConflict, value);
    if (relation.kind === "hard-conflict") edge.hardConflict = true;
    edge.confidence = Math.max(edge.confidence, relation.confidence);
    edgeByPair.set(pairKey(relation.a, relation.b), edge);
  }

  return { tags, relations, tagById, tagsByKind, edgeByPair, clusterIndex };
}

export function getEdge(
  data: CompiledData,
  a: string,
  b: string,
): CompiledEdge {
  const explicit = data.edgeByPair.get(pairKey(a, b));
  if (explicit) return explicit;
  const tagA = data.tagById.get(a);
  const tagB = data.tagById.get(b);
  if (!tagA || !tagB) return emptyEdge();
  const shared = tagA.clusters.filter((cluster) => tagB.clusters.includes(cluster));
  if (shared.length === 0) return emptyEdge();
  return {
    ...emptyEdge(),
    compatibility: Math.min(0.42, 0.16 * shared.length),
    redundancy: tagA.kind === tagB.kind ? Math.min(0.65, 0.22 * shared.length) : 0,
    confidence: 0.45,
  };
}

