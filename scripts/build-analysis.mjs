import { readFile, writeFile, mkdir } from "node:fs/promises";
import Graphology from "graphology";
import louvain from "graphology-communities-louvain";
import pagerank from "graphology-metrics/centrality/pagerank.js";
import betweenness from "graphology-metrics/centrality/betweenness.js";

const ROOT = new URL("../", import.meta.url);
const REGISTRY_URL = new URL(".tmp/public/packs/official-registry.json", ROOT);
const registry = JSON.parse(await readFile(REGISTRY_URL, "utf8"));
const PACK_URL = new URL(`.tmp/public/${registry.packPath}`, ROOT);
const ANALYSIS_DIR = new URL(
  `.tmp/public/${registry.analysisPath.replace(/[^/]+$/, "")}`,
  ROOT,
);

function xmur3(input) {
  let hash = 1779033703 ^ input.length;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function rngFor(seed) {
  let value = xmur3(seed)();
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(items, weight, random) {
  const weights = items.map(weight);
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  let cursor = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= Math.max(0, weights[index]);
    if (cursor <= 0) return items[index];
  }
  return items.at(-1);
}

function pairKey(left, right) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function compositeOverlap(left, right) {
  const leftParts = new Set([left.id, ...(left.compositeOf ?? [])]);
  const rightParts = new Set([right.id, ...(right.compositeOf ?? [])]);
  return [...leftParts].some((part) => rightParts.has(part));
}

function validPair(left, right) {
  return (
    left.id !== right.id &&
    left.family !== right.family &&
    !compositeOverlap(left, right)
  );
}

function round(value) {
  return Number(value.toFixed(8));
}

const pack = JSON.parse(await readFile(PACK_URL, "utf8"));
const entries = pack.entries
  .filter((entry) => entry.enabled !== false && !entry.deprecatedBy)
  .sort((left, right) => left.id.localeCompare(right.id));
const byId = new Map(entries.map((entry) => [entry.id, entry]));
const byCategory = new Map();
for (const entry of entries) {
  const bucket = byCategory.get(entry.categoryId) ?? [];
  bucket.push(entry);
  byCategory.set(entry.categoryId, bucket);
}

const edgeMap = new Map();
function addEdge(left, right, weight, source) {
  if (left === right || !byId.has(left) || !byId.has(right)) return;
  const key = pairKey(left, right);
  const existing = edgeMap.get(key) ?? {
    source: key.split("|")[0],
    target: key.split("|")[1],
    weight: 0,
    sources: [],
  };
  existing.weight = Math.max(existing.weight, weight);
  if (!existing.sources.includes(source)) existing.sources.push(source);
  existing.sources.sort();
  edgeMap.set(key, existing);
}

const byFamily = new Map();
for (const entry of entries) {
  const bucket = byFamily.get(entry.family) ?? [];
  bucket.push(entry);
  byFamily.set(entry.family, bucket);
}
for (const members of byFamily.values()) {
  for (let left = 0; left < members.length; left += 1) {
    for (let right = left + 1; right < members.length; right += 1) {
      addEdge(members[left].id, members[right].id, 0.92, "family");
    }
  }
}
for (const entry of entries) {
  for (const part of entry.compositeOf ?? []) {
    addEdge(entry.id, part, 1, "composite");
  }
}

for (const entry of entries) {
  const left = new Set(entry.facets);
  const candidates = entries
    .filter((candidate) => candidate.id !== entry.id)
    .map((candidate) => {
      const right = new Set(candidate.facets);
      const intersection = [...left].filter((facet) => right.has(facet)).length;
      const union = new Set([...left, ...right]).size;
      return {
        id: candidate.id,
        score: union === 0 ? 0 : intersection / union,
      };
    })
    .filter((candidate) => candidate.score >= 0.2)
    .sort(
      (leftValue, rightValue) =>
        rightValue.score - leftValue.score ||
        leftValue.id.localeCompare(rightValue.id),
    )
    .slice(0, 6);
  for (const candidate of candidates) {
    addEdge(entry.id, candidate.id, candidate.score, "facet");
  }
}

const cooccurrence = new Map();
const recipeCooccurrence = {};
for (const recipe of pack.recipes) {
  const random = rngFor(`analysis:${pack.manifest.dataVersion}:${recipe.id}`);
  let producedPairs = 0;
  for (let run = 0; run < 10_000; run += 1) {
    const variant = recipe.variants?.length
      ? weightedPick(recipe.variants, (item) => item.weight, random)
      : undefined;
    const picked = [];
    for (const slot of recipe.slots.filter((item) => item.source === "entries")) {
      const categoryIds =
        variant?.slotCategoryIds?.[slot.id] ?? slot.categoryIds ?? [];
      const pool = categoryIds
        .flatMap((categoryId) => byCategory.get(categoryId) ?? [])
        .filter((entry) => picked.every((other) => validPair(entry, other)));
      if (pool.length === 0) continue;
      const selected = weightedPick(
        pool,
        (entry) =>
          entry.baseWeight *
          (recipe.riskPolicy === "prefer-lower"
            ? Math.max(0.25, 1 - entry.implementationRisk * 0.45)
            : 1),
        random,
      );
      if (selected) picked.push(selected);
    }
    for (let left = 0; left < picked.length; left += 1) {
      for (let right = left + 1; right < picked.length; right += 1) {
        const key = pairKey(picked[left].id, picked[right].id);
        cooccurrence.set(key, (cooccurrence.get(key) ?? 0) + 1);
        producedPairs += 1;
      }
    }
  }
  recipeCooccurrence[recipe.id] = producedPairs;
}

const cooccurrenceByNode = new Map();
for (const [key, count] of cooccurrence) {
  const [left, right] = key.split("|");
  for (const [node, other] of [
    [left, right],
    [right, left],
  ]) {
    const bucket = cooccurrenceByNode.get(node) ?? [];
    bucket.push({ other, count });
    cooccurrenceByNode.set(node, bucket);
  }
}
for (const [node, values] of cooccurrenceByNode) {
  const top = values
    .sort(
      (left, right) =>
        right.count - left.count || left.other.localeCompare(right.other),
    )
    .slice(0, 4);
  const max = top[0]?.count ?? 1;
  for (const value of top) {
    addEdge(node, value.other, 0.4 + (value.count / max) * 0.4, "cooccurrence");
  }
}

const edges = [...edgeMap.values()]
  .map((edge) => ({ ...edge, weight: round(edge.weight) }))
  .sort(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      left.target.localeCompare(right.target),
  );
const graph = new Graphology.UndirectedGraph();
for (const entry of entries) {
  graph.addNode(entry.id, { categoryId: entry.categoryId });
}
for (const edge of edges) {
  graph.addEdge(edge.source, edge.target, { weight: edge.weight });
}

const communityById = louvain(graph, {
  getEdgeWeight: "weight",
  rng: rngFor("tagforge-analysis-louvain"),
  randomWalk: false,
});
const pageRankById = pagerank(graph, { getEdgeWeight: "weight" });
const betweennessById = betweenness(graph, {
  getEdgeWeight: "weight",
  normalized: true,
});
const metrics = entries.map((entry) => ({
  id: entry.id,
  degree: graph.degree(entry.id),
  weightedDegree: round(
    graph.reduceEdges(
      entry.id,
      (sum, _edge, attributes) => sum + (attributes.weight ?? 1),
      0,
    ),
  ),
  pageRank: round(pageRankById[entry.id] ?? 0),
  betweenness: round(betweennessById[entry.id] ?? 0),
  community: communityById[entry.id],
}));

const memberIdsByCommunity = new Map();
for (const [id, community] of Object.entries(communityById)) {
  const bucket = memberIdsByCommunity.get(community) ?? [];
  bucket.push(id);
  memberIdsByCommunity.set(community, bucket);
}
const communities = [...memberIdsByCommunity.entries()]
  .sort(([left], [right]) => left - right)
  .map(([id, memberIds]) => {
    const facetCounts = new Map();
    for (const memberId of memberIds) {
      for (const facet of byId.get(memberId)?.facets ?? []) {
        facetCounts.set(facet, (facetCounts.get(facet) ?? 0) + 1);
      }
    }
    const label =
      [...facetCounts.entries()].sort(
        (left, right) =>
          right[1] - left[1] || left[0].localeCompare(right[0]),
      )[0]?.[0] ?? `community-${id}`;
    return { id, label, memberIds: memberIds.sort() };
  });

const countBy = (values) =>
  Object.fromEntries(
    [...values.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
const categoryCounts = new Map();
const groupCounts = new Map([["design", 0], ["motif", 0]]);
const facetCounts = new Map();
for (const entry of entries) {
  categoryCounts.set(
    entry.categoryId,
    (categoryCounts.get(entry.categoryId) ?? 0) + 1,
  );
  const group = pack.categories.find((category) => category.id === entry.categoryId)?.group ?? "design";
  groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  for (const facet of entry.facets) {
    facetCounts.set(facet, (facetCounts.get(facet) ?? 0) + 1);
  }
}

const analysis = {
  manifest: {
    pack: {
      packId: registry.packId,
      dataVersion: registry.dataVersion,
      checksum: registry.checksum,
    },
    generatedAt: `${registry.dataVersion.replaceAll(".", "-")}T00:00:00.000Z`,
    nodeCount: entries.length,
    edgeCount: edges.length,
    communityCount: communities.length,
  },
  edges,
  metrics,
  communities,
  categoryCounts: countBy(categoryCounts),
  groupCounts: countBy(groupCounts),
  facetCounts: countBy(facetCounts),
  recipeCooccurrence,
};
const output = `${JSON.stringify(analysis, null, 2)}\n`;
const artifacts = new Map([
  ["analysis.json", output],
  [
    "analysis-manifest.json",
    `${JSON.stringify(analysis.manifest, null, 2)}\n`,
  ],
  ["edges.json", `${JSON.stringify(edges, null, 2)}\n`],
  ["communities.json", `${JSON.stringify(communities, null, 2)}\n`],
  ["metrics.json", `${JSON.stringify(metrics, null, 2)}\n`],
]);

if (process.argv.includes("--verify")) {
  for (const [name, expected] of artifacts) {
    const existing = await readFile(new URL(name, ANALYSIS_DIR), "utf8");
    if (existing !== expected) {
      throw new Error(
        `Official analysis artifact is stale or non-deterministic: ${name}`,
      );
    }
  }
  console.log(
    `Analysis verified — ${entries.length} nodes, ${edges.length} edges, ${communities.length} communities.`,
  );
} else {
  await mkdir(ANALYSIS_DIR, { recursive: true });
  for (const [name, content] of artifacts) {
    await writeFile(new URL(name, ANALYSIS_DIR), content, "utf8");
  }
  console.log(
    `Analysis built — ${entries.length} nodes, ${edges.length} edges, ${communities.length} communities.`,
  );
}
